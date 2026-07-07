import {
  query,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  createAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { normalizeEmail } from "./lib";

/**
 * Invitación y activación de cuenta del damnificado (REC-17).
 *
 * El damnificado no tiene registro público: lo crea el agente (REC-19) y queda
 * con `cuentaActivada=false` y un `invitacionToken`. Este módulo consume ese
 * token: valida el link, deja que el damnificado fije su contraseña (crea la
 * cuenta Password de Convex Auth) y marca la cuenta como activada.
 *
 * El disparo real (email de invitación al crear el caso) es de REC-19; acá se
 * incluye `generarInvitacionDemo` (sólo dev) para poder probar el flujo ahora.
 *
 * Los errores destinados al usuario usan `ConvexError` (mensaje legible en
 * `err.data` del lado cliente); ver src/app/activar/[token]/ActivarForm.tsx.
 */

/** Busca un damnificado por su token de invitación (null si no hay match). */
async function buscarPorToken(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"damnificados"> | null> {
  if (!token) return null;
  return await ctx.db
    .query("damnificados")
    .withIndex("by_invitacionToken", (q) => q.eq("invitacionToken", token))
    .first();
}

// ── Lectura pública para la pantalla /activar/[token] ────────────
type EstadoInvitacion =
  | { estado: "valido"; nombre: string; email: string }
  | { estado: "usado" }
  | { estado: "invalido" };

export const porToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<EstadoInvitacion> => {
    const dam = await buscarPorToken(ctx, token);
    if (!dam) return { estado: "invalido" };
    if (dam.cuentaActivada) return { estado: "usado" };
    return { estado: "valido", nombre: dam.nombre, email: dam.email };
  },
});

// ── Entrega de la invitación (seam de REC-19 → REC-65) ───────────
// La dispara `casos.crear` vía `scheduler.runAfter` cuando corresponde
// invitar (damnificado nuevo o aún sin activar). El token ya lo persistió la
// mutation: esta action SÓLO entrega. Hoy loguea el link (DEV); REC-65
// reemplaza EL CUERPO por el envío real (Resend/Nodemailer) sin tocar firma
// ni call-site. Logueamos sólo email + link (nada más de PII); para prod,
// REC-65 debe revisar este logging.
export const enviarInvitacion = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, { email, token }): Promise<void> => {
    const base = process.env.SITE_URL ?? "http://localhost:3000";
    const url = `${base}/activar/${token}`;
    // TODO REC-65: enviar email real. Hoy: log DEV (no muta DB, no genera token).
    console.log(`[invitacion] Link de activación para ${email}: ${url}`);
  },
});

// ── Internos usados por la action `activar` ──────────────────────
export const damnificadoPorToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => buscarPorToken(ctx, token),
});

export const contarPorEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // take(2) por tabla: alcanza para detectar cualquier duplicado.
    const [agentes, damnificados] = await Promise.all([
      ctx.db
        .query("agentes")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(2),
      ctx.db
        .query("damnificados")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(2),
    ]);
    return {
      agentes: agentes.length,
      damnificadoIds: damnificados.map((d) => d._id),
    };
  },
});

export const authAccountExiste = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const cuenta = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .first();
    return cuenta !== null;
  },
});

export const marcarActivado = internalMutation({
  args: { damnificadoId: v.id("damnificados") },
  handler: async (ctx, { damnificadoId }) => {
    // NO borramos invitacionToken: el uso único ya lo garantiza el chequeo de
    // `cuentaActivada` en `activar` (rechaza reactivación). Conservarlo permite
    // que `porToken` distinga un link ya usado (→ "usado") de uno inexistente
    // (→ "invalido"), en vez de mostrar ambos como "invalido".
    await ctx.db.patch(damnificadoId, { cuentaActivada: true });
  },
});

// ── Activación (action: crea la cuenta Password server-side) ─────
export const activar = action({
  args: { token: v.string(), password: v.string() },
  handler: async (ctx, { token, password }): Promise<{ email: string }> => {
    if (password.length < 8) {
      throw new ConvexError("La contraseña debe tener al menos 8 caracteres.");
    }

    const dam = await ctx.runQuery(internal.invitaciones.damnificadoPorToken, {
      token,
    });
    if (!dam) throw new ConvexError("Invitación inválida o vencida.");
    if (dam.cuentaActivada) {
      throw new ConvexError("Esta cuenta ya fue activada. Iniciá sesión.");
    }

    const email = normalizeEmail(dam.email);

    // Invariante de unicidad global (alineado con resolveRole): el email debe
    // corresponder a EXACTAMENTE 1 damnificado —el del token— y 0 agentes.
    const { agentes, damnificadoIds } = await ctx.runQuery(
      internal.invitaciones.contarPorEmail,
      { email },
    );
    if (agentes > 0) {
      throw new ConvexError(
        "Conflicto de cuenta: el email ya pertenece a un agente.",
      );
    }
    if (damnificadoIds.length !== 1 || damnificadoIds[0] !== dam._id) {
      throw new ConvexError(
        "Conflicto de cuenta: el email no es único entre damnificados.",
      );
    }

    // Idempotente ante una activación a medias: si ya existe la cuenta Password
    // (por un intento previo interrumpido), sólo (re)fija la contraseña.
    const yaTieneCuenta = await ctx.runQuery(
      internal.invitaciones.authAccountExiste,
      { email },
    );
    if (yaTieneCuenta) {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: password },
      });
    } else {
      await createAccount(ctx, {
        provider: "password",
        account: { id: email, secret: password },
        profile: { email, name: dam.nombre },
      });
    }

    await ctx.runMutation(internal.invitaciones.marcarActivado, {
      damnificadoId: dam._id,
    });

    return { email };
  },
});

// ── Helper DEV: generar una invitación para probar el flujo ──────
// Sustituye el disparo real (REC-19). Es `internalAction` a propósito: NO se
// expone a la app/cliente. Se invoca sólo desde el CLI admin — `npx convex run`
// puede correr funciones internal — y está gated a `DEPLOYMENT_ENV==="dev"`.
//   npx convex run invitaciones:generarInvitacionDemo
//   npx convex run invitaciones:generarInvitacionDemo '{"email":"marta.coledani@example.com"}'
export const setTokenDemo = internalMutation({
  args: { email: v.optional(v.string()), token: v.string() },
  handler: async (ctx, { email, token }): Promise<{ email: string }> => {
    let dam: Doc<"damnificados"> | null = null;
    if (email) {
      dam = await ctx.db
        .query("damnificados")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
    } else {
      // Sin email explícito: el primer damnificado que aún no activó su cuenta.
      const todos = await ctx.db.query("damnificados").collect();
      dam = todos.find((d) => !d.cuentaActivada) ?? todos[0] ?? null;
    }
    if (!dam) {
      throw new Error("No hay damnificado para invitar (¿corriste el seed?).");
    }
    await ctx.db.patch(dam._id, {
      invitacionToken: token,
      invitacionEnviadaEn: Date.now(),
    });
    return { email: dam.email };
  },
});

export const generarInvitacionDemo = internalAction({
  args: { email: v.optional(v.string()) },
  handler: async (
    ctx,
    { email },
  ): Promise<{ email: string; token: string; url: string }> => {
    if (process.env.DEPLOYMENT_ENV !== "dev") {
      throw new Error("generarInvitacionDemo: sólo disponible en dev.");
    }
    const token = crypto.randomUUID();
    const objetivo = email ? normalizeEmail(email) : undefined;
    const res = await ctx.runMutation(internal.invitaciones.setTokenDemo, {
      email: objetivo,
      token,
    });
    const base = process.env.SITE_URL ?? "http://localhost:3000";
    const url = `${base}/activar/${token}`;
    console.log(
      `[invitacion][DEV] Link de activación para ${res.email}: ${url}`,
    );
    return { email: res.email, token, url };
  },
});
