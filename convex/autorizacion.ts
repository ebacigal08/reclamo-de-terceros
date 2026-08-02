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

// ── Variante SOLO-AGENTE ─────────────────────────────────────────────────────
/**
 * Agente dueño del caso. Es el guard de las bitácoras y de todo lo que el
 * damnificado no debe poder tocar ni leer.
 *
 * El módulo ya contrastaba en su JSDoc "el guard de las bitácoras (solo-agente)" con
 * el dual, pero nunca tuvo la variante: el triplete `resolveRole` + `db.get(casoId)` +
 * `caso.agenteId !== agente._id` terminó open-codeado en notasInternas, gestiones,
 * respuestasAseguradora, pedidos y casos. Vive acá para que "cómo se deriva que un
 * caso es de un agente" tenga UN solo lugar.
 *
 * Fail-closed a `null`, y MISMO trato para "no hay sesión", "sos damnificado", "el
 * caso no existe" y "el caso es ajeno" → no filtra la existencia de casos ajenos.
 */
export async function casoDeAgente(ctx: QueryCtx, casoId: Id<"casos">) {
  const resolved = await resolveRole(ctx);
  if (!resolved || resolved.rol !== "agente") return null;

  const caso = await ctx.db.get(casoId);
  if (!caso || caso.agenteId !== resolved.agente._id) return null;

  return { agente: resolved.agente, caso };
}

/** Versión que LANZA. Mismo mensaje para inexistente y ajeno. */
export async function exigirCasoDeAgente(ctx: QueryCtx, casoId: Id<"casos">) {
  const autorizado = await casoDeAgente(ctx, casoId);
  if (!autorizado) {
    throw new Error("No autorizado: el caso no existe o no es tuyo.");
  }
  return autorizado;
}

// ── Pertenencia de un DAMNIFICADO a un agente (REC-90) ───────────────────────
/**
 * "Este cliente es mío". La frontera de autorización de la sección Clientes.
 *
 * ⚠️ `damnificados` NO tiene `agenteId`, y no debería tenerlo: la relación es
 * muchos-a-muchos a través de `casos`, porque el alta REUSA deliberadamente al
 * damnificado que ya existe con ese email (`casos.crearRegistro`). O sea que dos
 * agentes pueden compartir persona. La regla de pertenencia se deriva: **te
 * autoriza tener al menos un caso en común**.
 *
 * ⚠️ LO IMPORTANTE ESTÁ EN EL RETORNO: `casos` sale YA FILTRADO por el agente que
 * llama, y el array crudo —que incluye los casos de OTROS agentes con la misma
 * persona— no sale nunca de esta función. Así "cada agente ve sólo sus casos" es
 * estructural y no depende de que cada llamador se acuerde de filtrar; un olvido
 * acá no muestra de más, porque no hay nada de más para mostrar. Es el mismo
 * criterio con el que el relato separa `respuestas` de `respuestasAgente`.
 *
 * No hay índice `by_damnificado_agente` a propósito: el conjunto que se filtra en
 * JS es "todos los casos de UNA persona" —uno o dos siniestros— y un índice nuevo
 * se paga en cada escritura de `casos`, para siempre.
 *
 * Fail-closed a `null`, y MISMO trato para "no hay sesión", "sos damnificado", "el
 * damnificado no existe" y "no compartís ningún caso" → no filtra la existencia de
 * clientes ajenos. Ojo con el segundo: un damnificado autenticado NO pasa ni
 * siquiera para su propio documento, porque esto es una pantalla del agente.
 */
export async function damnificadoDeAgente(
  ctx: QueryCtx,
  damnificadoId: Id<"damnificados">,
) {
  const resolved = await resolveRole(ctx);
  if (!resolved || resolved.rol !== "agente") return null;

  const dam = await ctx.db.get(damnificadoId);
  if (!dam) return null;

  const todos = await ctx.db
    .query("casos")
    .withIndex("by_damnificado", (q) => q.eq("damnificadoId", damnificadoId))
    .collect();
  const casos = todos.filter((c) => c.agenteId === resolved.agente._id);
  if (casos.length === 0) return null;

  return { agente: resolved.agente, dam, casos };
}

/** Versión que LANZA. Mismo mensaje para inexistente y ajeno. */
export async function exigirDamnificadoDeAgente(
  ctx: QueryCtx,
  damnificadoId: Id<"damnificados">,
) {
  const autorizado = await damnificadoDeAgente(ctx, damnificadoId);
  if (!autorizado) {
    throw new Error("No autorizado: el cliente no existe o no es tuyo.");
  }
  return autorizado;
}
