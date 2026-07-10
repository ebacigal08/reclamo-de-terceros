import { internalMutation } from "./_generated/server";
import { crearNotificacion } from "./notificaciones";

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

      // Marcar avisado ANTES de crear la notificación/email: idempotencia del
      // cron (todo en el mismo commit; evita reavisar en la próxima corrida).
      await ctx.db.patch(plazo._id, { avisadoAlAgente: true });
      // Notificación + email al agente (registro + envío en un paso).
      await crearNotificacion(ctx, {
        casoId: caso._id,
        destinatario: "AGENTE",
        email: agente.email,
        datos: {
          motivo: "PLAZO_PROXIMO",
          descripcion: plazo.descripcion,
          fechaVencimiento: plazo.fechaVencimiento,
          damnificadoNombre: damnificado?.nombre ?? "",
        },
      });
      avisados++;
    }

    return { avisados };
  },
});
