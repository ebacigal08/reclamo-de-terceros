import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { resolveRole } from "./users";

/**
 * REC-33 · "Notas internas del agente" — el espacio PRIVADO del agente dentro del
 * caso: sospechas sobre el reclamo, estrategia legal, datos sensibles de la
 * negociación, recordatorios de seguimiento.
 *
 * Seguridad — SÓLO AGENTE. El criterio de aceptación del issue es absoluto: "el
 * damnificado no puede acceder a ellas bajo ninguna circunstancia". Por eso, igual
 * que `gestiones` (REC-32) y `respuestasAseguradora` (REC-31), la tabla vive en su
 * propio módulo y NO cuelga de `casos.get`, que es una query DUAL-ROL (agente O
 * damnificado dueño) y hace spread del caso: colgarla de ahí dejaría la privacidad
 * a merced de un `if` interno que cualquier refactor futuro puede romper en
 * silencio. Acá la frontera es la función entera.
 *
 * Reglas del módulo (iguales a `pedidos.ts` / `gestiones.ts`): la identidad se
 * DERIVA de la sesión con `resolveRole` —`agenteId` NUNCA llega del cliente, ni
 * siquiera como argumento—; `Error` para los guards de sesión/pertenencia,
 * `ConvexError` (legible en el cliente) para la validación de formulario/negocio.
 * ORDEN FIJO: auth → pertenencia → cerrado → validación → write → return.
 *
 * NO notifica ni manda email: es, literalmente, lo que el damnificado no debe ver.
 */

// Una nota de estrategia es más larga que la descripción de una gestión (1000).
const MAX_TEXTO = 2000;

/**
 * Guard de `editar` y `eliminar`, que reciben `notaId` (no `casoId`): resuelve rol
 * Y pertenencia en un solo lugar. La nota sólo guarda `casoId`, así que la
 * pertenencia va por la cadena nota → caso → agente (mismo patrón que
 * `gestiones.gestionAutorizada` y `pedidos.responder`).
 *
 * MISMO mensaje para "no existe" y "no es tuya": si difirieran, la respuesta
 * filtraría la existencia de notas ajenas.
 *
 * Ojo con la pertenencia: se valida contra `caso.agenteId`, el dueño del CASO —no
 * contra `nota.agenteId`, el autor—. Son lo mismo hoy (el autor sólo puede escribir
 * en sus casos), pero el caso es la unidad de autorización del sistema entero; usar
 * el autor abriría la puerta a que un agente que hereda un caso no pueda tocar las
 * notas que vinieron con él.
 */
async function notaAutorizada(ctx: MutationCtx, notaId: Id<"notasInternas">) {
  const resolved = await resolveRole(ctx);
  if (!resolved || resolved.rol !== "agente") {
    throw new Error("No autorizado: se requiere una sesión de agente.");
  }

  const nota = await ctx.db.get(notaId);
  if (!nota) {
    throw new Error("No autorizado: la nota no existe o no es tuya.");
  }

  const caso = await ctx.db.get(nota.casoId);
  if (!caso || caso.agenteId !== resolved.agente._id) {
    throw new Error("No autorizado: la nota no existe o no es tuya.");
  }

  return { nota, caso };
}

/** Valida y normaliza el texto. La MISMA función corre en `crear` y en `editar`. */
function validarTexto(texto: string): string {
  const contenido = texto.trim();
  if (!contenido) {
    throw new ConvexError("Escribí la nota antes de guardarla.");
  }
  if (contenido.length > MAX_TEXTO) {
    throw new ConvexError(
      `La nota es demasiado larga (máx. ${MAX_TEXTO} caracteres).`,
    );
  }
  return contenido;
}

/**
 * Notas de un caso, en orden de creación ASCENDENTE (la UI lo invierte para
 * mostrar la más reciente arriba, como pide el issue).
 *
 * Fail-closed: sin sesión de agente, o caso inexistente/ajeno → `null` (mismo trato
 * para ambos → no filtra existencia). `[]` = autorizado y sin notas.
 */
export const listPorCaso = query({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") return null;

    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) return null;

    const notas = await ctx.db
      .query("notasInternas")
      .withIndex("by_caso", (q) => q.eq("casoId", casoId))
      .collect();

    return notas.map((n) => ({
      _id: n._id,
      texto: n.texto,
      creadaEn: n._creationTime, // el `creadaAt` del issue
      actualizadaEn: n.actualizadaAt ?? null, // null = nunca editada
    }));
  },
});

/** Crea una nota privada en el caso. */
export const crear = mutation({
  // `agenteId` NO figura acá a propósito: se deriva de la sesión.
  args: {
    casoId: v.id("casos"),
    texto: v.string(),
  },
  handler: async (ctx, { casoId, texto }) => {
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
      throw new ConvexError("El caso está cerrado; no podés agregar notas.");
    }

    // 4) Validación.
    const contenido = validarTexto(texto);

    // 5) Alta. El autor sale de la SESIÓN, nunca de los args.
    const notaId = await ctx.db.insert("notasInternas", {
      casoId,
      agenteId: resolved.agente._id,
      texto: contenido,
      // `actualizadaAt` queda ausente: una nota recién creada no fue editada.
    });

    return { notaId };
  },
});

/**
 * Edita el texto de una nota. `casoId` y `agenteId` no son editables: cambiar de
 * caso o de autor no es "corregir una nota", es otra operación.
 */
export const editar = mutation({
  args: {
    notaId: v.id("notasInternas"),
    texto: v.string(),
  },
  handler: async (ctx, { notaId, texto }) => {
    // 1-2) Rol + pertenencia (nota → caso → agente).
    const { nota, caso } = await notaAutorizada(ctx, notaId);

    // 3) Cerrado = congelado, también para editar.
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés editar notas.");
    }

    // 4) Validar SIEMPRE, y recién después comparar para el early-return. Nunca al
    //    revés: si el early-return fuera primero, una edición "sin cambios" sobre
    //    un dato viejo inválido se saltearía la validación entera.
    const contenido = validarTexto(texto);

    // 5) Idempotente: si el texto normalizado no cambió, no se escribe NADA —y en
    //    particular no se toca `actualizadaAt`, que si no mentiría diciendo que la
    //    nota se editó cuando en realidad no cambió nada.
    if (nota.texto === contenido) {
      return { notaId };
    }

    await ctx.db.patch(notaId, { texto: contenido, actualizadaAt: Date.now() });
    return { notaId };
  },
});

/**
 * Elimina una nota.
 *
 * BORRADO DURO, igual que `gestiones.eliminar`: una nota interna borrada es una
 * nota que el agente decidió que no va; un soft-delete pediría un filtro en TODA
 * lectura presente y futura, y acá el costo de olvidarse ese filtro es exactamente
 * el peor caso del issue (que reaparezca material privado). Nada referencia a
 * `notasInternas` → no hay cascada.
 *
 * NO es idempotente ante una nota inexistente, a propósito: devolver `ok` en
 * silencio para "no existe" y `Error` para "ajena" DISTINGUIRÍA los dos casos y
 * filtraría la existencia de notas ajenas. Los dos comparten el error genérico de
 * `notaAutorizada`.
 */
export const eliminar = mutation({
  args: { notaId: v.id("notasInternas") },
  handler: async (ctx, { notaId }) => {
    const { caso } = await notaAutorizada(ctx, notaId);

    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés eliminar notas.");
    }

    await ctx.db.delete(notaId);
    return { ok: true };
  },
});
