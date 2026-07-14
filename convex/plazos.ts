import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { crearNotificacion } from "./notificaciones";
import { emailDeAvisos } from "./lib";

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
        email: emailDeAvisos(agente),
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

/**
 * REC-73 · Rescate: vuelve a poner en `false` el `avisadoAlAgente` de plazos que
 * se dieron por avisados pero cuyo aviso NUNCA se entregó.
 *
 * Por qué hace falta. `revisarVencimientos` marca `avisadoAlAgente: true` ANTES de
 * mandar el email (idempotencia del cron), y el email es best-effort: si se cae —o,
 * como pasó en producción, si la dirección del agente está SUPRIMIDA en Resend y el
 * mensaje se descarta en silencio— el plazo queda marcado como avisado para
 * siempre. El índice `by_avisado_fecha` ya no lo trae, y NADIE lo reavisa jamás.
 * El estado dice "avisado" y el agente nunca se enteró.
 *
 * Criterio: plazos con `avisadoAlAgente: true` cuyo caso está ABIERTO. Es el único
 * proxy que el modelo ofrece para "esto todavía importa": la tabla `plazos` NO
 * tiene ningún campo de cumplimiento (ver schema). Un plazo de un caso cerrado ya
 * no le sirve a nadie, y `revisarVencimientos` igual los saltea.
 *
 * Después de correr esto, la próxima corrida del cron reavisa — ahora sí, a la
 * dirección de `emailDeAvisos`. Es `internalMutation`: no la expone el cliente.
 *
 *   npx convex run plazos:reabrirAvisos --deployment <deployment>
 *   npx convex run plazos:reabrirAvisos '{"plazoIds":["..."]}' --deployment <deployment>
 */
export const reabrirAvisos = internalMutation({
  // Sin argumentos: barre todos los plazos avisados de casos abiertos.
  // Con `plazoIds`: toca SÓLO esos (rescate quirúrgico).
  args: { plazoIds: v.optional(v.array(v.id("plazos"))) },
  handler: async (ctx, { plazoIds }) => {
    const candidatos = plazoIds
      ? await Promise.all(plazoIds.map((id) => ctx.db.get(id)))
      : await ctx.db
          .query("plazos")
          .withIndex("by_avisado_fecha", (q) => q.eq("avisadoAlAgente", true))
          .collect();

    const reabiertos = [];
    for (const plazo of candidatos) {
      if (!plazo || !plazo.avisadoAlAgente) continue;

      // Sólo casos abiertos: en uno cerrado el plazo ya no le sirve a nadie, y el
      // cron lo saltearía igual (reabrirlo sería ensuciar el estado por nada).
      const caso = await ctx.db.get(plazo.casoId);
      if (!caso || caso.cerrado) continue;

      await ctx.db.patch(plazo._id, { avisadoAlAgente: false });
      reabiertos.push({
        plazoId: plazo._id,
        numeroCaso: caso.numeroCaso,
        descripcion: plazo.descripcion,
        fechaVencimiento: plazo.fechaVencimiento,
      });
    }

    // Se devuelven los IDs y no sólo un contador: esto se corre a ciegas desde una
    // terminal, contra producción. El operador tiene que poder confirmar que tocó
    // exactamente las filas que esperaba, y no diecisiete.
    return { reabiertos: reabiertos.length, plazos: reabiertos };
  },
});
