import type { EmailConfig } from "@convex-dev/auth/server";
import { emailTexto, renderEmailHtml, sendEmailOrThrow } from "./email";

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
 */

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
  sendVerificationRequest: async ({ identifier: email, token }) => {
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
  },
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
