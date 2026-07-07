import { mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { resolveRole } from "./users";

/**
 * REC-24 · "Solicitar documentación" — el agente le pide un documento o info al
 * damnificado directamente desde el sistema. Crea el `pedidosDocumentacion` + una
 * notificación `NUEVO_PEDIDO` y agenda el aviso por email (hoy stub, ver
 * `notificarPedido`). NO cambia el esquema (los campos ya existen).
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

    // 6) Notificación para el damnificado (misma forma que `casos.crear`).
    await ctx.db.insert("notificaciones", {
      destinatario: "DAMNIFICADO",
      casoId,
      motivo: "NUEVO_PEDIDO",
      visto: false,
    });

    // 7) Aviso por email (stub), encolado atado al commit de esta mutation
    //    (`runAfter` sólo dispara si la transacción commitea).
    await ctx.scheduler.runAfter(0, internal.pedidos.notificarPedido, {
      email: damnificado.email,
      descripcion: texto,
    });

    return { pedidoId };
  },
});

/**
 * Entrega del aviso "nuevo pedido" al damnificado. Igual que
 * `invitaciones.enviarInvitacion`: hoy es un STUB que loguea (DEV). El envío real
 * (Resend/Nodemailer) queda para la infra de email (REC-65/REC-15) y reemplaza
 * SÓLO el cuerpo, sin tocar firma ni call-site.
 */
export const notificarPedido = internalAction({
  args: { email: v.string(), descripcion: v.string() },
  handler: async (_ctx, { email, descripcion }) => {
    // TODO (infra email, REC-65/REC-15): envío real. NOTA: este log incluye la
    // descripción completa — aceptable en DEV, pero al cablear el envío real
    // revisar/retirar este console.log para no exponer texto sensible en prod.
    console.log(`[pedido] Aviso de nuevo pedido para ${email}: ${descripcion}`);
  },
});
