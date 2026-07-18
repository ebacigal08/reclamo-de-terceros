import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { exigirCasoDeAgente } from "./autorizacion";
import { crearNotificacion } from "./notificaciones";
import {
  tipoDocumentoValidator,
  DOC_ETIQUETA_MAX,
  TIPO_DOCUMENTO_LABEL,
  type TipoDocumento,
} from "./tiposDocumento";

/**
 * REC-77 · Checklist tipado de documentación por caso. El agente arma una lista
 * de documentos estándar (`agregar`); cada ítem queda **pendiente** hasta que
 * agente o damnificado suben un archivo contra él (`documentos.registrar` con
 * `itemId`), y el estado **recibido** se DERIVA en lectura (`casos.get`/`miCaso`)
 * de si hay ≥1 documento vinculado — no se guarda un `estado`.
 *
 * Seguridad (igual que `pedidos.ts`): `agregar`/`quitar` son SÓLO del agente
 * dueño (`exigirCasoDeAgente`); el vínculo doc↔ítem lo valida `registrar` contra
 * el mismo `casoId`. `Error` para guards de sesión/pertenencia/integridad;
 * `ConvexError` (mensaje legible) para validación de negocio.
 */

const MAX_ITEMS_POR_LOTE = 20;

/** Normaliza una etiqueta OTROS para comparar duplicados (no para mostrar). */
function normalizarEtiqueta(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

/**
 * Agrega uno o varios documentos tipados a la checklist del caso. Idempotente:
 * saltea los que ya están (no-OTROS por tipo; OTROS por etiqueta normalizada) y
 * devuelve `{ insertados, salteados }`. Sólo notifica al damnificado si insertó
 * al menos uno (evita avisos vacíos).
 */
export const agregar = mutation({
  args: {
    casoId: v.id("casos"),
    items: v.array(
      v.object({
        tipoDocumento: tipoDocumentoValidator,
        etiqueta: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { casoId, items }) => {
    const { caso } = await exigirCasoDeAgente(ctx, casoId);
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés modificar la checklist.");
    }
    if (items.length === 0) {
      throw new ConvexError("Elegí al menos un documento para pedir.");
    }
    if (items.length > MAX_ITEMS_POR_LOTE) {
      throw new ConvexError(`No podés agregar más de ${MAX_ITEMS_POR_LOTE} documentos a la vez.`);
    }

    // Validación por ítem: OTROS exige `etiqueta`; el resto la prohíbe.
    const limpios = items.map((it) => {
      if (it.tipoDocumento === "OTROS") {
        const etiqueta = (it.etiqueta ?? "").trim();
        if (!etiqueta) throw new ConvexError("Escribí qué documento es (para 'Otros').");
        if (etiqueta.length > DOC_ETIQUETA_MAX) {
          throw new ConvexError(
            `La descripción del documento es demasiado larga (máx. ${DOC_ETIQUETA_MAX}).`,
          );
        }
        return { tipoDocumento: it.tipoDocumento, etiqueta };
      }
      if ((it.etiqueta ?? "").trim()) {
        throw new ConvexError("Sólo 'Otros' lleva una descripción.");
      }
      return { tipoDocumento: it.tipoDocumento, etiqueta: undefined as string | undefined };
    });

    // Estado actual del caso para el dedup (una sola lectura).
    const existentes = await ctx.db
      .query("itemsDocumentacion")
      .withIndex("by_caso", (q) => q.eq("casoId", casoId))
      .collect();
    const tiposPresentes = new Set(
      existentes.filter((e) => e.tipoDocumento !== "OTROS").map((e) => e.tipoDocumento),
    );
    const otrosPresentes = new Set(
      existentes
        .filter((e) => e.tipoDocumento === "OTROS")
        .map((e) => normalizarEtiqueta(e.etiqueta ?? "")),
    );

    // Cargar el damnificado ANTES de escribir (guard de integridad, como
    // pedidos.crear): si falta, aborta toda la mutation sin estado parcial.
    const damnificado = await ctx.db.get(caso.damnificadoId);
    if (!damnificado) throw new Error("No se pudo cargar el damnificado del caso.");

    // Dedup contra lo existente Y dentro del propio lote.
    const nuevos: { tipoDocumento: TipoDocumento; etiqueta?: string }[] = [];
    const enLoteTipos = new Set<string>();
    const enLoteOtros = new Set<string>();
    for (const it of limpios) {
      if (it.tipoDocumento === "OTROS") {
        const norm = normalizarEtiqueta(it.etiqueta!);
        if (otrosPresentes.has(norm) || enLoteOtros.has(norm)) continue;
        enLoteOtros.add(norm);
        nuevos.push(it);
      } else {
        if (tiposPresentes.has(it.tipoDocumento) || enLoteTipos.has(it.tipoDocumento)) continue;
        enLoteTipos.add(it.tipoDocumento);
        nuevos.push(it);
      }
    }

    for (const it of nuevos) {
      await ctx.db.insert("itemsDocumentacion", {
        casoId,
        tipoDocumento: it.tipoDocumento,
        ...(it.etiqueta ? { etiqueta: it.etiqueta } : {}),
      });
    }

    if (nuevos.length > 0) {
      const labels = nuevos.map((it) =>
        it.tipoDocumento === "OTROS" ? it.etiqueta! : TIPO_DOCUMENTO_LABEL[it.tipoDocumento],
      );
      const lista = labels.length <= 3 ? labels.join(", ") : `${labels.length} documentos`;
      await crearNotificacion(ctx, {
        casoId,
        destinatario: "DAMNIFICADO",
        email: damnificado.email,
        datos: { motivo: "NUEVO_PEDIDO", descripcion: `Documentación solicitada: ${lista}` },
      });
    }

    return { insertados: nuevos.length, salteados: limpios.length - nuevos.length };
  },
});

/**
 * Quita un ítem PENDIENTE de la checklist. Bloquea si ya tiene un documento
 * vinculado (ítem recibido) → evita referencias colgadas. La atomicidad se apoya
 * en que las mutations de Convex son serializables (OCC): el read por `by_item`
 * entra al read-set, así que una `registrar(itemId)` concurrente conflictúa y
 * re-corre (nunca queda un `documento` con `itemId` borrado).
 */
export const quitar = mutation({
  args: { itemId: v.id("itemsDocumentacion") },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error("No autorizado: el ítem no existe o no es tuyo.");
    const { caso } = await exigirCasoDeAgente(ctx, item.casoId);
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés modificar la checklist.");
    }
    const linkados = await ctx.db
      .query("documentos")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect();
    if (linkados.length > 0) {
      throw new ConvexError("Ese documento ya fue recibido; no se puede quitar de la checklist.");
    }
    await ctx.db.delete(itemId);
    return { ok: true };
  },
});
