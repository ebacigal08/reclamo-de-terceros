import { v } from "convex/values";
import { internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Alertas de vencimientos de plazos para el agente (REC-29).
 *
 * `revisarVencimientos` es el job que dispara el cron diario (convex/crons.ts):
 * busca los plazos por vencer que todavía no se avisaron, notifica al agente del
 * caso (notificación + email stub) y marca cada plazo como avisado para no
 * repetir. La ventana ("no avisado" && vencimiento ≤ hoy+3, incluye vencidos)
 * coincide EXACTO con el flag `inminente` de `casos.listMine`, así que avisar un
 * plazo apaga su indicador en la lista.
 */

/**
 * Job diario: detecta plazos por vencer y avisa al agente. Idempotente vía
 * `avisadoAlAgente` (el índice `by_avisado_fecha` ya excluye los avisados).
 * Corre sin sesión (lo dispara el cron), por eso no pasa por `resolveRole`.
 */
export const revisarVencimientos = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Corte "inminente": hoy (UTC) + 3 días, en YYYY-MM-DD. El cron usa "hoy" en
    // UTC (no la fecha local AR de listMine); para una ventana de 3 días el
    // corrimiento de frontera es despreciable. Comparar strings ISO = comparar fechas.
    const limiteISO = new Date(Date.now() + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const porVencer = await ctx.db
      .query("plazos")
      .withIndex("by_avisado_fecha", (q) =>
        q.eq("avisadoAlAgente", false).lte("fechaVencimiento", limiteISO),
      )
      .collect();

    let avisados = 0;
    for (const plazo of porVencer) {
      // Plazos de casos cerrados/inexistentes no se avisan.
      const caso = await ctx.db.get(plazo.casoId);
      if (!caso || caso.cerrado) continue;

      const agente = await ctx.db.get(caso.agenteId);
      if (!agente) continue; // sin destinatario del aviso
      const damnificado = await ctx.db.get(caso.damnificadoId);

      await ctx.db.insert("notificaciones", {
        destinatario: "AGENTE",
        casoId: caso._id,
        motivo: "PLAZO_PROXIMO",
        visto: false,
      });
      // Marcar avisado ANTES de agendar: evita reavisos aunque el email falle.
      await ctx.db.patch(plazo._id, { avisadoAlAgente: true });
      // Email al agente (stub), atado al commit de esta mutation.
      await ctx.scheduler.runAfter(0, internal.plazos.notificarPlazo, {
        email: agente.email,
        damnificadoNombre: damnificado?.nombre ?? "",
        descripcion: plazo.descripcion,
        fechaVencimiento: plazo.fechaVencimiento,
        casoId: caso._id,
      });
      avisados++;
    }

    return { avisados };
  },
});

/**
 * Entrega del aviso "plazo próximo a vencer" al agente. Mismo patrón STUB que
 * `pedidos.notificarRespuesta`: hoy loguea (DEV); el envío real (Resend/Nodemailer)
 * queda para la infra de email (REC-28/REC-65) y reemplaza SÓLO el cuerpo.
 */
export const notificarPlazo = internalAction({
  args: {
    email: v.string(),
    damnificadoNombre: v.string(),
    descripcion: v.string(),
    fechaVencimiento: v.string(),
    casoId: v.id("casos"),
  },
  handler: async (
    _ctx,
    { email, damnificadoNombre, descripcion, fechaVencimiento, casoId },
  ) => {
    const base = process.env.SITE_URL ?? "http://localhost:3000";
    const url = `${base}/agente/casos/${casoId}`;
    // TODO (infra email, REC-28/REC-65): envío real al agente. Asunto sugerido:
    // "Plazo próximo a vencer en el caso de {damnificadoNombre}".
    console.log(
      `[plazo] Plazo próximo (${fechaVencimiento}) en el caso de ${damnificadoNombre} para ${email}: ${descripcion} — ${url}`,
    );
  },
});
