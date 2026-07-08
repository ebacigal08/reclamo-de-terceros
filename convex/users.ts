import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { normalizeEmail } from "./lib";

/**
 * Identidad y rol (REC-17 · core).
 *
 * El rol NO lo guarda Convex Auth: se DERIVA por email contra las tablas de
 * dominio `agentes` / `damnificados`. `resolveRole` es la única fuente de
 * verdad de "quién es el que llama", y es **fail-closed**: ante falta de
 * sesión, email sin vínculo, o vínculo ambiguo (email en ambas tablas),
 * devuelve `null`. El conflicto se loguea **sólo en server y sin PII**
 * (userId, nunca el email completo ni datos en el cliente).
 *
 * Invariante asumido: email único global entre agentes y damnificados
 * (lo garantizan las escrituras; ver seed.ts).
 */
export async function resolveRole(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  const rawEmail = user?.email;
  if (!rawEmail) {
    console.warn(`[auth] userId ${userId} sin email; no se puede derivar rol`);
    return null;
  }
  const email = normalizeEmail(rawEmail);

  // take(2) por tabla: detecta también duplicados DENTRO de una misma tabla.
  // El invariante exige exactamente UNA coincidencia en total (agentes+damnificados).
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

  const total = agentes.length + damnificados.length;
  if (total !== 1) {
    // 0 = sin vínculo; >1 = duplicado intra-tabla o email en ambas tablas.
    console.error(
      `[auth] email con ${total} coincidencias (agentes=${agentes.length}, damnificados=${damnificados.length}) para userId ${userId}; fail-closed`,
    );
    return null;
  }

  if (agentes.length === 1) {
    return { rol: "agente" as const, userId, agente: agentes[0] };
  }

  const damnificado = damnificados[0];
  // Fail-closed: una cuenta Auth cuyo damnificado todavía no activó su cuenta
  // NO resuelve como sesión usable. Cubre estados parciales de activación
  // (cuenta Auth creada pero `marcarActivado` no aplicado; ver
  // invitaciones.activar). Recién con cuentaActivada=true accede al flujo privado.
  if (!damnificado.cuentaActivada) {
    console.warn(
      `[auth] damnificado ${damnificado._id} con cuenta Auth pero cuentaActivada=false; fail-closed`,
    );
    return null;
  }
  return { rol: "damnificado" as const, userId, damnificado };
}

/**
 * Datos de la sesión para la UI (shell y resolver de rol). Devuelve `null`
 * si no hay sesión válida — los consumidores hacen fail-closed (redirect).
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved) return null;

    if (resolved.rol === "agente") {
      const casos = await ctx.db
        .query("casos")
        .withIndex("by_agente", (q) =>
          q.eq("agenteId", resolved.agente._id).eq("cerrado", false),
        )
        .collect();
      return {
        rol: "agente" as const,
        nombre: resolved.agente.nombre,
        agenteId: resolved.agente._id,
        casosActivos: casos.length,
      };
    }

    return {
      rol: "damnificado" as const,
      nombre: resolved.damnificado.nombre,
      damnificadoId: resolved.damnificado._id,
      onboardingCompletado: resolved.damnificado.onboardingCompletado,
    };
  },
});

/**
 * Marca el onboarding del damnificado como visto (REC-26). Sin args: la
 * identidad se DERIVA de la sesión con `resolveRole` (regla del módulo; nunca
 * se acepta id del cliente). Fail-closed (guard → Error) e idempotente: no
 * re-escribe si ya estaba en `true`. La dispara la pantalla de onboarding al
 * finalizar o saltar; el resolver `/` deja de mostrar el wizard cuando queda
 * en `true`.
 */
export const completarOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") {
      throw new Error("No autorizado: se requiere una sesión de damnificado.");
    }
    if (!resolved.damnificado.onboardingCompletado) {
      await ctx.db.patch(resolved.damnificado._id, { onboardingCompletado: true });
    }
    return null;
  },
});
