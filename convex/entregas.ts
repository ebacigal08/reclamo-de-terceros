/**
 * REC-74 · Entrega REAL de los emails (correlación con los webhooks de Resend).
 *
 * La VERDAD de si un aviso llegó vive en la tabla `entregasEmail`, no en flags
 * "avisado" que sólo saben que se INTENTÓ. Cada envío que consigue un `id` de
 * Resend se registra acá (`registrar`), y los eventos del webhook lo completan
 * (`registrarEvento`).
 *
 * Correlación robusta: Resend entrega los eventos **at-least-once, sin orden
 * garantizado y con duplicados posibles**. Por eso:
 *  - Ambos lados hacen UPSERT por `resendId`: la fila la crea el que llegue primero.
 *  - Los eventos se deduplican por `svixId` (tabla `eventosResend`).
 *  - Un evento cuyo envío aún no se registró queda igual PERSISTIDO y se reconcilia.
 *  - El paso `reconciliarAlerta` corre desde los dos lados, así la alerta al agente
 *    se dispara en cuanto la fila tiene el contexto (casoId/destinatario) Y un
 *    desenlace de no-entrega, sin importar el orden de llegada.
 */

import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const destinatario = v.union(v.literal("AGENTE"), v.literal("DAMNIFICADO"));

const tipoEvento = v.union(
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
);

/**
 * Inserta la alerta in-app al agente por un aviso que NO se entregó, si
 * corresponde y no se creó antes. Corre desde `registrar` y `registrarEvento`
 * para cubrir el caso en que el evento llega antes que el registro del envío.
 * Es in-app pura: NO se manda email (sería irónico mailear sobre un email que
 * no llegó, y la casilla puede ser justo la rota).
 */
async function reconciliarAlerta(ctx: MutationCtx, fila: Doc<"entregasEmail">) {
  if (fila.alertaCreada) return;
  // Sólo alertamos por avisos al AGENTE (el caso REC-73). Un rebote al
  // damnificado en v1 sólo se registra.
  if (fila.destinatario !== "AGENTE" || !fila.casoId) return;
  const noEntregado =
    fila.rebotadoEn ?? fila.quejadoEn ?? fila.falladoEn;
  if (noEntregado === undefined) return;

  await ctx.db.insert("notificaciones", {
    destinatario: "AGENTE",
    casoId: fila.casoId,
    motivo: "AVISO_NO_ENTREGADO",
    visto: false,
  });
  await ctx.db.patch(fila._id, { alertaCreada: true });
}

/**
 * Upsert de la fila de entrega por `resendId`. Lee por índice ANTES de escribir
 * (el rango entra en el read-set → el OCC serializable de Convex evita filas
 * duplicadas si `registrar` y `registrarEvento` corren concurrentes).
 */
async function upsertEntrega(
  ctx: MutationCtx,
  resendId: string,
  campos: Partial<Doc<"entregasEmail">>,
): Promise<Doc<"entregasEmail">> {
  const existente = await ctx.db
    .query("entregasEmail")
    .withIndex("by_resend_id", (q) => q.eq("resendId", resendId))
    .unique();
  if (existente) {
    await ctx.db.patch(existente._id, campos);
    return (await ctx.db.get(existente._id))!;
  }
  const id = await ctx.db.insert("entregasEmail", { resendId, ...campos });
  return (await ctx.db.get(id))!;
}

/**
 * Lado ENVÍO: registra que un aviso se encoló en Resend (respondió 200) con su
 * contexto. Lo llama `notificaciones.enviar` best-effort tras `sendEmail`.
 */
export const registrar = internalMutation({
  args: {
    resendId: v.string(),
    motivo: v.string(),
    destinatario,
    casoId: v.id("casos"),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const fila = await upsertEntrega(ctx, args.resendId, {
      motivo: args.motivo,
      destinatario: args.destinatario,
      casoId: args.casoId,
      to: args.to,
      aceptadoEn: Date.now(),
    });
    await reconciliarAlerta(ctx, fila);
  },
});

/**
 * Lado WEBHOOK: aplica un evento de Resend. Dedup por `svixId`; persiste el
 * evento (con cuándo OCURRIÓ y cuándo se RECIBIÓ); upsert del desenlace en
 * `entregasEmail` con el timestamp real del evento; reconcilia la alerta.
 */
export const registrarEvento = internalMutation({
  args: {
    svixId: v.string(),
    resendId: v.string(),
    tipo: tipoEvento,
    createdAtEvento: v.number(),
  },
  handler: async (ctx, { svixId, resendId, tipo, createdAtEvento }) => {
    // Dedup: si ya procesamos este svixId, no-op (Resend reintenta).
    const yaVisto = await ctx.db
      .query("eventosResend")
      .withIndex("by_svix_id", (q) => q.eq("svixId", svixId))
      .unique();
    if (yaVisto) return;

    await ctx.db.insert("eventosResend", {
      svixId,
      resendId,
      tipo,
      createdAtEvento,
      recibidoEn: Date.now(),
    });

    const patch: Partial<Doc<"entregasEmail">> =
      tipo === "delivered"
        ? { entregadoEn: createdAtEvento }
        : tipo === "bounced"
          ? { rebotadoEn: createdAtEvento }
          : tipo === "complained"
            ? { quejadoEn: createdAtEvento }
            : { falladoEn: createdAtEvento };

    const fila = await upsertEntrega(ctx, resendId, patch);
    await reconciliarAlerta(ctx, fila);
  },
});
