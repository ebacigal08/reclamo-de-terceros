import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { resolveRole } from "./users";
import { RE_FECHA, esFechaReal, hoyEnArgentina } from "./lib";

/**
 * REC-32 · "Log de gestiones del agente" — bitácora INTERNA de qué hizo el agente
 * sobre el caso y cuándo (llamó, mandó un correo, presentó a la aseguradora, se
 * reunió). Sirve para demostrar el trabajo hecho y para no perder el hilo entre
 * muchos casos.
 *
 * Seguridad — SÓLO AGENTE, misma decisión que `respuestasAseguradora` (REC-31):
 * la tabla vive en su propio módulo y NO cuelga de `casos.get`, que es una query
 * DUAL-ROL (agente O damnificado dueño) y hace spread del caso. Colgarla de ahí
 * dejaría la no-visibilidad del damnificado a merced de un `if` interno que
 * cualquier refactor futuro puede romper en silencio. Acá la frontera es la
 * función entera.
 *
 * Reglas del módulo (iguales a `pedidos.ts`): la identidad se DERIVA de la sesión
 * con `resolveRole` (nunca se acepta `agenteId` del cliente); `Error` para los
 * guards de sesión/pertenencia, `ConvexError` (mensaje legible en el cliente) para
 * la validación de formulario/negocio. ORDEN FIJO de toda mutation: auth →
 * pertenencia → cerrado → validación → write → return.
 *
 * NO notifica ni manda email: es información interna del agente.
 */

// Mirror local de la union `tipoGestion` de convex/schema.ts (el bundle de Convex
// no puede importar de `src/`). MANTENER SINCRONIZADO con schema.ts y con
// `TIPOS_GESTION` de src/lib/constants.ts.
const tipoGestion = v.union(
  v.literal("LLAMADA"),
  v.literal("CORREO"),
  v.literal("PRESENTACION"),
  v.literal("REUNION"),
  v.literal("OTRO"),
);

// Más corta que una respuesta de la aseguradora (2000): allá se transcribe una
// oferta con rubros y montos; acá se anota qué se hizo.
const MAX_DESCRIPCION = 1000;

/**
 * Guard de `editar` y `eliminar`, que reciben `gestionId` (no `casoId`): resuelve
 * rol Y pertenencia en un solo lugar, para no mezclar estilos (las functions que
 * entran por `casoId` —`listPorCaso`, `registrar`— llevan el guard inline, como en
 * REC-31; la asimetría es del argumento, no del criterio).
 *
 * La gestión sólo guarda `casoId`, así que la pertenencia se valida por la cadena
 * gestión → caso → agente (mismo patrón que `pedidos.responder` y
 * `documentos.getCasoAutorizado`).
 *
 * MISMO mensaje para "no existe" y "no es tuya": si difirieran, la respuesta
 * filtraría la existencia de gestiones ajenas.
 */
async function gestionAutorizada(ctx: MutationCtx, gestionId: Id<"gestiones">) {
  const resolved = await resolveRole(ctx);
  if (!resolved || resolved.rol !== "agente") {
    throw new Error("No autorizado: se requiere una sesión de agente.");
  }

  const gestion = await ctx.db.get(gestionId);
  if (!gestion) {
    throw new Error("No autorizado: la gestión no existe o no es tuya.");
  }

  const caso = await ctx.db.get(gestion.casoId);
  if (!caso || caso.agenteId !== resolved.agente._id) {
    throw new Error("No autorizado: la gestión no existe o no es tuya.");
  }

  return { gestion, caso };
}

/** Valida y normaliza la descripción. `ConvexError` = mensaje legible para el agente. */
function validarDescripcion(descripcion: string): string {
  const texto = descripcion.trim();
  if (!texto) {
    throw new ConvexError("Escribí qué gestión hiciste.");
  }
  if (texto.length > MAX_DESCRIPCION) {
    throw new ConvexError(
      `La descripción es demasiado larga (máx. ${MAX_DESCRIPCION} caracteres).`,
    );
  }
  return texto;
}

/**
 * Formato + existencia real + no-futura, contra el hoy ARGENTINO del server.
 *
 * La MISMA función corre en `registrar` y en `editar`, y eso es lo que cierra el
 * bypass obvio: si sólo el alta validara, alcanzaría con registrar con fecha de
 * hoy y después editarla a 2030.
 */
function validarFechaGestion(fecha: string): void {
  if (!RE_FECHA.test(fecha) || !esFechaReal(fecha)) {
    throw new ConvexError("La fecha de la gestión no es válida.");
  }
  // Comparación lexicográfica de ISO (mismo criterio que `plazos`).
  if (fecha > hoyEnArgentina()) {
    throw new ConvexError("La fecha de la gestión no puede ser futura.");
  }
}

/**
 * Gestiones de un caso, en orden cronológico ASCENDENTE (lo da el índice
 * `by_caso_fecha`). El orden canónico queda en el server; la UI lo invierte para
 * mostrar la más reciente arriba, como pide el issue.
 *
 * Fail-closed: sin sesión de agente, o caso inexistente/ajeno → `null` (mismo
 * trato para ambos → no filtra existencia). `[]` = autorizado y sin gestiones.
 */
export const listPorCaso = query({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") return null;

    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) return null;

    const gestiones = await ctx.db
      .query("gestiones")
      .withIndex("by_caso_fecha", (q) => q.eq("casoId", casoId))
      .collect();

    return gestiones.map((g) => ({
      _id: g._id,
      tipo: g.tipo,
      descripcion: g.descripcion,
      fechaGestion: g.fechaGestion,
      registradoEn: g._creationTime, // el `registradoAt` del issue
    }));
  },
});

/** Registra una gestión en el caso. */
export const registrar = mutation({
  args: {
    casoId: v.id("casos"),
    tipo: tipoGestion,
    descripcion: v.string(),
    fechaGestion: v.string(), // ISO YYYY-MM-DD; `v.string()` no alcanza → se valida
  },
  handler: async (ctx, { casoId, tipo, descripcion, fechaGestion }) => {
    // 1) Autorización: sólo un agente autenticado.
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }

    // 2) Pertenencia, fail-closed y con el mismo mensaje para inexistente y ajeno.
    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) {
      throw new Error("No autorizado: el caso no existe o no es tuyo.");
    }

    // 3) Cerrado = congelado (invariante uniforme del módulo).
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés registrar gestiones.");
    }

    // 4) Validación.
    const texto = validarDescripcion(descripcion);
    validarFechaGestion(fechaGestion);

    // 5) Alta. `registradoAt` = `_creationTime`, no se persiste a mano.
    const gestionId = await ctx.db.insert("gestiones", {
      casoId,
      tipo,
      descripcion: texto,
      fechaGestion,
    });

    return { gestionId };
  },
});

/**
 * Corrige una gestión mal cargada.
 *
 * Set ABSOLUTO de los tres campos editables: la UI manda el form entero, y un
 * patch parcial con `v.optional` multiplicaría los estados a validar sin ganar
 * nada. `casoId` NO es editable: mover una gestión de caso no es corregir una
 * errata, y exigiría un segundo guard de pertenencia sobre el caso destino.
 */
export const editar = mutation({
  args: {
    gestionId: v.id("gestiones"),
    tipo: tipoGestion,
    descripcion: v.string(),
    fechaGestion: v.string(),
  },
  handler: async (ctx, { gestionId, tipo, descripcion, fechaGestion }) => {
    // 1-2) Rol + pertenencia (gestión → caso → agente).
    const { gestion, caso } = await gestionAutorizada(ctx, gestionId);

    // 3) Cerrado = congelado. Editar la bitácora de un caso ya terminado es
    //    justo lo que un log no debe permitir. Trade-off asumido: una errata
    //    descubierta DESPUÉS del cierre no se puede arreglar; el arreglo sería
    //    "reabrir caso", que no existe en el MVP. Si se agrega, el guard se
    //    revisa ahí con criterio explícito, no por goteo desde acá.
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés editar gestiones.");
    }

    // 4) Validar SIEMPRE, y recién después comparar para el early-return de
    //    idempotencia. Nunca al revés: si el early-return fuera primero, una
    //    edición "sin cambios" sobre un dato viejo inválido se saltearía la
    //    validación entera.
    const texto = validarDescripcion(descripcion);
    validarFechaGestion(fechaGestion);

    // 5) Idempotente: sin cambios reales, no escribe (igual que `cambiarPrioridad`).
    if (
      gestion.tipo === tipo &&
      gestion.descripcion === texto &&
      gestion.fechaGestion === fechaGestion
    ) {
      return { gestionId };
    }

    await ctx.db.patch(gestionId, { tipo, descripcion: texto, fechaGestion });
    return { gestionId };
  },
});

/**
 * Elimina una gestión registrada POR ERROR.
 *
 * BORRADO DURO (el primer `ctx.db.delete` del repo, a propósito): el issue habla
 * de una gestión "registrada por error" — no ocurrió, no hay nada que auditar. Un
 * soft-delete pediría un campo `eliminado` y un filtro en TODA lectura, presente y
 * futura: el día que alguien agregue una segunda lectura sin el filtro, las
 * gestiones "borradas" reaparecen. Nada referencia a `gestiones` → no hay cascada.
 *
 * NO es idempotente ante una gestión inexistente, a propósito: devolver `ok` en
 * silencio para "no existe" y `Error` para "ajena" DISTINGUIRÍA los dos casos y
 * filtraría la existencia de gestiones ajenas. Los dos comparten el error genérico
 * de `gestionAutorizada`. La race real (otra pestaña borró la fila) es inofensiva:
 * la live query ya la sacó del DOM.
 */
export const eliminar = mutation({
  args: { gestionId: v.id("gestiones") },
  handler: async (ctx, { gestionId }) => {
    const { caso } = await gestionAutorizada(ctx, gestionId);

    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés eliminar gestiones.");
    }

    await ctx.db.delete(gestionId);
    return { ok: true };
  },
});
