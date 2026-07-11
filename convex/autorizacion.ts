import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveRole } from "./users";

/**
 * Guards de pertenencia DUAL de un caso: agente dueño **O** damnificado dueño.
 *
 * Vive en su propio módulo y no en `convex/lib.ts` (que sería el lugar natural para
 * un helper compartido) por un motivo concreto: esto necesita `resolveRole` de
 * `users.ts`, y `users.ts` ya importa `lib.ts` → sería un ciclo de imports.
 *
 * Nació como `documentos.getCasoAutorizado` (REC-23), atado a `MutationCtx` porque
 * sólo lo usaban mutations. Acá se re-tipa sobre `QueryCtx` —el supertipo, del que
 * `MutationCtx` extiende— para que también sirva a las queries del chat (REC-34).
 *
 * ATENCIÓN: dual NO significa laxo. La pertenencia se verifica contra el rol de la
 * sesión; un damnificado con el `casoId` de otro caso NO pasa. La diferencia con el
 * guard de las bitácoras (solo-agente) es a quién se autoriza, no cuánto se afloja.
 */

/**
 * Versión fail-closed que devuelve `null` (contrato de las queries `listPorCaso` del
 * repo). MISMO trato para "no hay sesión", "el caso no existe" y "el caso es ajeno"
 * → no filtra la existencia de casos ajenos.
 */
export async function casoAutorizadoDual(ctx: QueryCtx, casoId: Id<"casos">) {
  const resolved = await resolveRole(ctx);
  if (!resolved) return null;

  const caso = await ctx.db.get(casoId);
  if (!caso) return null;

  const esDueño =
    resolved.rol === "agente"
      ? caso.agenteId === resolved.agente._id
      : caso.damnificadoId === resolved.damnificado._id;
  if (!esDueño) return null;

  return { resolved, caso };
}

/**
 * Versión que LANZA (contrato de las mutations del módulo: `Error` para los guards
 * de sesión/pertenencia, que no se muestran al usuario). Mismo mensaje para
 * inexistente y ajeno.
 */
export async function exigirCasoAutorizadoDual(
  ctx: QueryCtx,
  casoId: Id<"casos">,
) {
  const autorizado = await casoAutorizadoDual(ctx, casoId);
  if (!autorizado) {
    throw new Error("No autorizado: el caso no existe o no es tuyo.");
  }
  return autorizado;
}
