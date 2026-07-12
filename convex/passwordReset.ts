import type { EmailConfig } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { emailTexto, renderEmailHtml, sendEmailOrThrow } from "./email";
import { normalizeEmail } from "./lib";

/**
 * Provider de recuperación de contraseña — envío real por email (REC-65).
 *
 * El flujo de reset del provider Password (flows "reset" / "reset-verification")
 * exige un "email provider" que entregue un código de verificación. Antes (REC-17)
 * era un stub DEV que logueaba el OTP; ahora se envía por email vía Resend
 * (`convex/email.ts`).
 *
 * El envío usa `sendEmailOrThrow`: si no se puede entregar (sin `RESEND_API_KEY`,
 * Resend responde !ok, o falla la red) LANZA, y el flujo `reset` rechaza — la UI
 * de `/recuperar` muestra el error y NO avanza al paso del código. Nunca se
 * loguea el OTP (ni el cuerpo ni el asunto salen a los logs).
 *
 * RATE-LIMIT POR EMAIL (REC-69): antes de mandar, `sendVerificationRequest`
 * registra el intento vía `registrarEnvio` y LANZA si se superó el límite. Va acá
 * —el único punto en el camino real del envío— porque `auth:signIn` es pública:
 * un guard de cliente sería bypasseable. Ver la tabla `resetEnvios` en el schema.
 */

// Límites del envío de código de reset, POR EMAIL. Tuneables.
//  - Ventana corta alineada con la vida del OTP (15 min): dentro de UN código,
//    3 envíos alcanzan para "no llegó, reenviá".
//  - Ventana diaria: corta el goteo lento (bombardeo espaciado).
const MAX_ENVIOS_RESET_15M = 3;
const VENTANA_RESET_15M_MS = 15 * 60 * 1000;
const MAX_ENVIOS_RESET_24H = 8;
const VENTANA_RESET_24H_MS = 24 * 60 * 60 * 1000;

/**
 * Registra un envío de código de reset para `email` y LANZA (ConvexError, legible
 * en el cliente) si supera el límite de la ventana corta o de la diaria.
 *
 * Lee con `.collect()` y NO con `.unique()`: consolida la unión de timestamps de
 * todas las filas del email (defensa ante duplicados concurrentes) y deja UNA fila
 * canónica, borrando el resto. Así un duplicado nunca rompe el limiter.
 *
 * Corre ANTES del envío (mismo acto de chequear-y-registrar): es lo que evita el
 * bypass por ráfaga. Tradeoff deliberado y del lado seguro: si Resend después
 * falla, el intento igual consumió un slot de la ventana.
 */
export const registrarEnvio = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const ahora = Date.now();
    const desde24h = ahora - VENTANA_RESET_24H_MS;
    const desde15m = ahora - VENTANA_RESET_15M_MS;

    const filas = await ctx.db
      .query("resetEnvios")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    const recientes = filas
      .flatMap((f) => f.envios)
      .filter((t) => t > desde24h)
      .sort((a, b) => a - b);
    const en15m = recientes.filter((t) => t > desde15m).length;

    if (en15m >= MAX_ENVIOS_RESET_15M || recientes.length >= MAX_ENVIOS_RESET_24H) {
      throw new ConvexError(
        "Pediste demasiados códigos para este email. Esperá unos minutos e intentá de nuevo.",
      );
    }

    const envios = [...recientes, ahora];
    if (filas.length === 0) {
      await ctx.db.insert("resetEnvios", { email, envios });
    } else {
      // Fila canónica = la primera; consolidar ahí y borrar duplicados si los hubiera.
      await ctx.db.patch(filas[0]._id, { envios });
      for (const extra of filas.slice(1)) await ctx.db.delete(extra._id);
    }
  },
});

/** OTP numérico de `longitud` dígitos con CSPRNG (disponible en el runtime de acciones). */
function generarOtpNumerico(longitud: number): string {
  const buf = new Uint32Array(longitud);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => (n % 10).toString()).join("");
}

const CUERPO_RESET =
  "Usá este código para elegir una nueva contraseña. Vence en 15 minutos. " +
  "Si no pediste recuperar tu contraseña, ignorá este email.";

export const PasswordReset: EmailConfig = {
  id: "password-reset",
  type: "email",
  name: "Recuperación de contraseña",
  // El código de reset vive 15 minutos.
  maxAge: 60 * 15,
  // OTP de 8 dígitos (el usuario lo copia de su email en /recuperar).
  generateVerificationToken: async () => generarOtpNumerico(8),
  // El runtime de Convex Auth pasa el action ctx de Convex como 2º arg (ver
  // signIn.js: `sendVerificationRequest({...}, ctx)`, con su @ts-expect-error); el
  // tipo de Auth.js declara un solo parámetro y lo oculta. Cast localizado acá, con
  // handler tipado de nuestro lado. Si un update de la librería dejara de pasarlo,
  // `ctx.runMutation` tiraría → el reset falla ruidosamente (fail-closed), que la
  // verificación del camino feliz detecta.
  sendVerificationRequest: (async (
    { identifier: email, token }: { identifier: string; token: string },
    ctx: ActionCtx,
  ) => {
    // ANTES de enviar: registra el intento y LANZA si superó el límite por email
    // → el flujo `reset` rechaza y NO se manda el email.
    await ctx.runMutation(internal.passwordReset.registrarEnvio, {
      email: normalizeEmail(email),
    });
    const contenido = {
      titulo: "Recuperá tu contraseña",
      cuerpo: CUERPO_RESET,
      codigo: token,
    };
    // Crítico: si no entrega, lanza (el flujo de reset falla visiblemente).
    // El OTP va SÓLO en el cuerpo/HTML; sendEmailOrThrow no loguea ni asunto
    // ni cuerpo, así que nunca aparece en los logs.
    await sendEmailOrThrow({
      to: email,
      subject: "Tu código de recuperación · Amparo",
      motivo: "reset",
      text: emailTexto(contenido),
      html: renderEmailHtml(contenido),
    });
  }) as unknown as EmailConfig["sendVerificationRequest"],
  // Igual que el helper Email de Convex Auth: el código sólo vale para el email
  // con el que se pidió (evita reutilizar un OTP contra otra cuenta).
  authorize: async (params, account) => {
    if (
      typeof params.email !== "string" ||
      account.providerAccountId !== params.email
    ) {
      throw new Error("El código no corresponde a este email.");
    }
  },
};
