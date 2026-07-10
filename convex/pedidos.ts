import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { resolveRole } from "./users";
import { crearNotificacion } from "./notificaciones";

/**
 * REC-24 · "Solicitar documentación" — el agente le pide un documento o info al
 * damnificado directamente desde el sistema. Crea el `pedidosDocumentacion` y
 * dispara la notificación `NUEVO_PEDIDO` (registro + email) vía el motor
 * `crearNotificacion` (REC-28). NO cambia el esquema (los campos ya existen).
 *
 * Seguridad (regla del módulo, igual que `casos.crear`): la identidad del agente
 * se DERIVA de la sesión con `resolveRole`; nunca se acepta `agenteId` del
 * cliente. La pertenencia del caso se verifica inline (no hay helper reutilizable
 * aún — la misma lógica vive en `casos.get`). Errores: `Error` para los guards de
 * sesión/pertenencia/estado; `ConvexError` (mensaje legible en el cliente) para la
 * validación de formulario/negocio.
 *
 * ORDEN (fijo): auth → pertenencia → cerrado/texto → cargar damnificado → inserts
 * → scheduler → return. El damnificado se valida ANTES de escribir para no dejar
 * pedido/notificación huérfanos ni un email sin destinatario si faltara.
 */
export const crear = mutation({
  args: {
    casoId: v.id("casos"),
    descripcion: v.string(),
  },
  handler: async (ctx, { casoId, descripcion }) => {
    // 1) Autorización: sólo un agente autenticado (guard → Error, no de formulario).
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }

    // 2) Pertenencia: el caso existe y es de este agente. Fail-closed con el
    //    mismo mensaje para inexistente y ajeno → no se filtra la existencia.
    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) {
      throw new Error("No autorizado: el caso no existe o no es tuyo.");
    }

    // 3) Guard de negocio + validación del texto (ConvexError legible en el cliente).
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés enviar nuevos pedidos.");
    }
    const texto = descripcion.trim();
    if (!texto) {
      throw new ConvexError("Escribí qué documentación necesitás.");
    }
    if (texto.length > 500) {
      throw new ConvexError("El pedido es demasiado largo (máx. 500 caracteres).");
    }

    // 4) Cargar y validar el damnificado ANTES de cualquier escritura: si faltara
    //    (dato inconsistente), abortamos sin dejar pedido/notificación huérfanos.
    const damnificado = await ctx.db.get(caso.damnificadoId);
    if (!damnificado) {
      throw new Error("Estado inconsistente: el caso no tiene damnificado.");
    }

    // 5) Alta del pedido. `enviadoEn` del issue = `_creationTime` (convención del
    //    módulo: no hay campos `creadoEn` manuales).
    const pedidoId = await ctx.db.insert("pedidosDocumentacion", {
      casoId,
      descripcion: texto,
      respondido: false,
    });

    // 6) Notificación + email al damnificado (registro + envío en un paso).
    await crearNotificacion(ctx, {
      casoId,
      destinatario: "DAMNIFICADO",
      email: damnificado.email,
      datos: { motivo: "NUEVO_PEDIDO", descripcion: texto },
    });

    return { pedidoId };
  },
});

/**
 * REC-25 · "Responder pedido" — el damnificado ve y responde un pedido activo del
 * agente (`/damnificado/pedido/[id]`). `get` es la lectura de la pantalla;
 * `responder` cierra el ciclo (marca respondido + notifica al agente).
 *
 * Seguridad (misma regla del módulo que `crear`): identidad y pertenencia se
 * DERIVAN de la sesión con `resolveRole`; nunca se acepta id de identidad del
 * cliente. Como el pedido sólo tiene `casoId`, la pertenencia se valida vía
 * pedido → caso → `caso.damnificadoId === sesión` (mismo patrón dual que
 * `documentos.getCasoAutorizado`).
 */

/**
 * Lee UN pedido por id para la pantalla del damnificado. `pedidoId` llega crudo
 * de la URL: se normaliza con `normalizeId` para tolerar ids malformados sin
 * tirar error de validación. Devuelve `null` (→ el cliente redirige a "Mi caso")
 * ante: sin sesión de damnificado, id inválido, pedido inexistente, o caso ajeno
 * (mismo trato "no existe"/"ajeno" → no filtra existencia).
 */
export const get = query({
  args: { pedidoId: v.string() },
  handler: async (ctx, { pedidoId }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") return null;

    const id = ctx.db.normalizeId("pedidosDocumentacion", pedidoId);
    if (!id) return null;

    const pedido = await ctx.db.get(id);
    if (!pedido) return null;

    const caso = await ctx.db.get(pedido.casoId);
    if (!caso || caso.damnificadoId !== resolved.damnificado._id) return null;

    return {
      pedido: {
        _id: pedido._id,
        descripcion: pedido.descripcion,
        respondido: pedido.respondido,
        respondidoEn: pedido.respondidoEn ?? null,
      },
      caso: { _id: caso._id, cerrado: caso.cerrado },
    };
  },
});

/**
 * Cierra el ciclo: marca el pedido como respondido, notifica al agente (in-app +
 * email) y muestra el acuse en el cliente. Los archivos ya se subieron por
 * separado con `documentos.registrar`; acá se reciben sus `documentoIds` y se
 * VALIDA en el servidor que existan, sean del mismo caso del pedido y del
 * damnificado — así un cliente manipulado no puede responder sin documento real
 * (no se confía en el gating de la UI).
 *
 * ORDEN (fijo, igual que `crear`): auth → pertenencia → negocio → validar docs →
 * cargar agente ANTES de escribir → writes → scheduler → return.
 */
export const responder = mutation({
  args: {
    pedidoId: v.id("pedidosDocumentacion"),
    documentoIds: v.array(v.id("documentos")),
  },
  handler: async (ctx, { pedidoId, documentoIds }) => {
    // 1) Autorización: sólo un damnificado autenticado (guard → Error).
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") {
      throw new Error("No autorizado: se requiere una sesión de damnificado.");
    }

    // 2) Pertenencia vía pedido → caso. Mismo mensaje para inexistente y ajeno.
    const pedido = await ctx.db.get(pedidoId);
    if (!pedido) {
      throw new Error("No autorizado: el pedido no existe o no es tuyo.");
    }
    const caso = await ctx.db.get(pedido.casoId);
    if (!caso || caso.damnificadoId !== resolved.damnificado._id) {
      throw new Error("No autorizado: el pedido no existe o no es tuyo.");
    }

    // 3) Guards de negocio (ConvexError legible en el cliente).
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés responder este pedido.");
    }
    if (pedido.respondido) {
      throw new ConvexError("Este pedido ya fue respondido.");
    }

    // 4) Integridad de los documentos: al menos uno, y todos deben existir, ser
    //    del mismo caso del pedido y subidos por el damnificado. No se confía en
    //    el cliente (evita marcar respondido sin documento real).
    if (documentoIds.length === 0) {
      throw new ConvexError("Subí al menos un archivo antes de confirmar.");
    }
    for (const docId of new Set(documentoIds)) {
      const doc = await ctx.db.get(docId);
      if (!doc || doc.casoId !== pedido.casoId || doc.subidoPor !== "DAMNIFICADO") {
        throw new Error("Documento inválido: no pertenece a este caso.");
      }
    }

    // 5) Cargar el agente ANTES de escribir: si faltara (dato inconsistente),
    //    abortamos sin dejar el pedido a medias ni un email sin destinatario.
    const agente = await ctx.db.get(caso.agenteId);
    if (!agente) {
      throw new Error("Estado inconsistente: el caso no tiene agente.");
    }

    // 6) Marcar respondido. `respondidoEn` = ahora.
    await ctx.db.patch(pedidoId, { respondido: true, respondidoEn: Date.now() });

    // 7) Notificación + email al AGENTE (registro + envío en un paso).
    await crearNotificacion(ctx, {
      casoId: caso._id,
      destinatario: "AGENTE",
      email: agente.email,
      datos: { motivo: "PEDIDO_RESPONDIDO", descripcion: pedido.descripcion },
    });

    return { ok: true };
  },
});
