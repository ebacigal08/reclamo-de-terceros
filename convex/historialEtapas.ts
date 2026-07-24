import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { resolveRole } from "./users";

/**
 * REC-82 · Audit log de cambios de etapa del caso.
 *
 * El pipeline es forward-only por diseño (`casos.avanzarEtapa`) y el cierre es
 * terminal; ahora `casos.retrocederEtapa` permite volver UN paso. Esta tabla deja
 * el rastro que antes no existía: quién movió el caso, de qué etapa a cuál y en
 * qué dirección.
 *
 * Seguridad — SÓLO AGENTE, igual que `gestiones`/`notasInternas`: es interno del
 * agente, vive en su propio módulo y NO cuelga de `casos.get` (query DUAL-ROL). El
 * damnificado no lo ve bajo ninguna circunstancia; acá la frontera es la función
 * entera, no un `if` interno.
 *
 * La ESCRITURA no es una mutation pública: la disparan `casos.avanzarEtapa`,
 * `casos.retrocederEtapa` y `casos.cerrar` vía el helper `registrarCambioEtapa`
 * (mismo patrón que `crearNotificacion` de `notificaciones.ts`), en la misma
 * transacción que el `patch` de la etapa. Append-only: no hay editar ni eliminar.
 */

// Semántica del cambio. Espeja la union `direccionCambioEtapa` del schema.
type DireccionCambioEtapa = "AVANCE" | "RETROCESO" | "CIERRE";

/**
 * Inserta una entrada en el audit log. Helper plano (NO una Convex function): lo
 * llaman las mutations de `casos.ts` después de mover la etapa.
 *
 * Tipos concretos a propósito: `etapaAnterior`/`etapaNueva` son `Doc<"casos">["etapa"]`
 * —que ya incluye `"CERRADO"`—, así `cerrar` (que registra `etapaNueva: "CERRADO"`)
 * y `retroceder` comparten el MISMO subtipo y ninguno inventa uno propio. `agenteId`
 * lo pasa el caller derivado de la sesión, nunca del cliente.
 */
export async function registrarCambioEtapa(
  ctx: MutationCtx,
  args: {
    casoId: Id<"casos">;
    agenteId: Id<"agentes">;
    etapaAnterior: Doc<"casos">["etapa"];
    etapaNueva: Doc<"casos">["etapa"];
    direccion: DireccionCambioEtapa;
  },
) {
  await ctx.db.insert("historialEtapas", args);
}

/**
 * Historial de un caso, MÁS RECIENTE PRIMERO y ACOTADO.
 *
 * `.order("desc").take(MAX)` en vez de `.collect()`: un caso puede avanzar y
 * retroceder muchas veces, y esto no debe cargar el historial completo en una sola
 * lectura. 50 cubre de sobra cualquier caso real (el pipeline tiene 6 etapas).
 *
 * Fail-closed: sin sesión de agente, o caso inexistente/ajeno → `null` (mismo trato
 * para ambos → no filtra existencia; el damnificado NUNCA lee esta tabla). `[]` =
 * autorizado y sin cambios registrados todavía.
 */
const MAX_HISTORIAL = 50;

export const listPorCaso = query({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") return null;

    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) return null;

    const filas = await ctx.db
      .query("historialEtapas")
      .withIndex("by_caso", (q) => q.eq("casoId", casoId))
      .order("desc")
      .take(MAX_HISTORIAL);

    return filas.map((f) => ({
      _id: f._id,
      at: f._creationTime, // el `at` del issue
      etapaAnterior: f.etapaAnterior,
      etapaNueva: f.etapaNueva,
      direccion: f.direccion,
    }));
  },
});
