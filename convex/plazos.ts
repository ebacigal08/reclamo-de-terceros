import { internalMutation, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { crearNotificacion } from "./notificaciones";
import { emailDeAvisos, RE_FECHA, esFechaReal } from "./lib";
import { exigirCasoDeAgente } from "./autorizacion";

/**
 * Plazos críticos del reclamo: alertas al agente (REC-29 · REC-74) y edición
 * (REC-81).
 *
 * `revisarVencimientos` es el job que dispara el cron diario (convex/crons.ts):
 * busca los plazos por vencer (≤ hoy+3, incluye vencidos) de casos abiertos y
 * REAVISA al agente cada 3 días mientras sigan venciendo (cadencia C2, vía
 * `ultimoAvisoEn`). La ENTREGA real de cada aviso la reflejan los webhooks de
 * Resend en `entregasEmail`; `avisadoAlAgente` quedó LEGACY (sólo lo usa
 * `reabrirAvisos`). El flag `inminente` de `casos.listMine` ya NO depende de
 * "avisado": persiste mientras el plazo venza.
 *
 * `editar` (REC-81) es la ÚNICA API de cliente del módulo: hasta REC-81 los
 * plazos sólo los escribían el seed y el cron, y la ficha los mostraba
 * read-only. Corrige fecha y descripción, y re-arma la alerta si la fecha
 * cambió. No crea ni elimina plazos (alcance acotado por el usuario).
 */

/**
 * Job diario: detecta plazos por vencer (≤ hoy+3) de casos abiertos y avisa al
 * agente, reavisando cada 3 días (`ultimoAvisoEn`) mientras sigan venciendo.
 * Corre sin sesión (lo dispara el cron), por eso no pasa por `resolveRole`.
 */
export const revisarVencimientos = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Corte "inminente": hoy (UTC) + 3 días, en YYYY-MM-DD (incluye vencidos, sin
    // cota inferior). El cron usa "hoy" en UTC; para una ventana de 3 días el
    // corrimiento de frontera es despreciable. Comparar strings ISO = comparar fechas.
    const ahora = Date.now();
    const CADENCIA_MS = 3 * 86_400_000;
    const limiteISO = new Date(ahora + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    // Se recorre por FECHA (todos los ≤ hoy+3), NO por el booleano legacy: así se
    // pueden REAVISAR los que siguen venciendo (C2). La cadencia la controla
    // `ultimoAvisoEn` ("último intento"); la entrega real vive en `entregasEmail`.
    const porVencer = await ctx.db
      .query("plazos")
      .withIndex("by_fecha", (q) => q.lte("fechaVencimiento", limiteISO))
      .collect();

    let avisados = 0;
    for (const plazo of porVencer) {
      // Plazos de casos cerrados/inexistentes no se avisan.
      const caso = await ctx.db.get(plazo.casoId);
      if (!caso || caso.cerrado) continue;

      // Cadencia: no reavisar si el último intento fue hace menos de 3 días.
      if (
        plazo.ultimoAvisoEn !== undefined &&
        ahora - plazo.ultimoAvisoEn < CADENCIA_MS
      ) {
        continue;
      }

      const agente = await ctx.db.get(caso.agenteId);
      if (!agente) continue; // sin destinatario del aviso
      const damnificado = await ctx.db.get(caso.damnificadoId);

      // Registrar el INTENTO ANTES de encolar (idempotencia del cron, mismo commit).
      // `avisadoAlAgente` se mantiene por compatibilidad con `reabrirAvisos` (legacy).
      await ctx.db.patch(plazo._id, { ultimoAvisoEn: ahora, avisadoAlAgente: true });
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

      // REC-74 · limpiar también `ultimoAvisoEn` (el driver de cadencia) para forzar
      // el reaviso en la próxima corrida, no sólo el flag legacy.
      await ctx.db.patch(plazo._id, {
        avisadoAlAgente: false,
        ultimoAvisoEn: undefined,
      });
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

// ── Edición del plazo (REC-81) ───────────────────────────────────

// Un plazo es un RÓTULO ("Contestar la mediación"), no una bitácora: por eso la
// mitad de los 1000 de `gestiones`. Espejo de PLAZO_MAX_DESCRIPCION en
// src/lib/constants.ts (el server valida igual).
const MAX_DESCRIPCION = 500;

/**
 * Corrige un plazo mal cargado: fecha de vencimiento y/o descripción.
 *
 * Set ABSOLUTO de los dos campos editables (la UI manda el form entero), igual
 * que `gestiones.editar`: un patch parcial con `v.optional` multiplicaría los
 * estados a validar sin ganar nada. `casoId` NO es editable — viaja como
 * argumento sólo para el guard de pertenencia, no para mover el plazo de caso.
 *
 * NO crea ni elimina plazos, y no existe "marcar cumplido" (alcance acotado por
 * el usuario). La tabla no tiene ningún campo de cumplimiento.
 */
export const editar = mutation({
  args: {
    casoId: v.id("casos"),
    plazoId: v.id("plazos"),
    fechaVencimiento: v.string(),
    descripcion: v.string(),
  },
  handler: async (ctx, { casoId, plazoId, fechaVencimiento, descripcion }) => {
    // 1) Rol + pertenencia del CASO (fail-closed; mismo mensaje para inexistente
    //    y ajeno → no filtra la existencia de casos ajenos).
    const { caso } = await exigirCasoDeAgente(ctx, casoId);

    // 2) Pertenencia del PLAZO al caso, explícita: la mutation recibe los dos IDs
    //    y nada garantiza que se correspondan. Sin este guard, el dueño de un caso
    //    podría editar el plazo de CUALQUIER otro caso pasando su propio `casoId`.
    //    Mismo error genérico que arriba, por el mismo motivo.
    const plazo = await ctx.db.get(plazoId);
    if (!plazo || plazo.casoId !== casoId) {
      throw new Error("No autorizado: el plazo no existe o no es tuyo.");
    }

    // 3) Cerrado = congelado, como toda escritura del agente.
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés editar plazos.");
    }

    // 4) Validar SIEMPRE, y recién después comparar para el early-return de
    //    idempotencia. Nunca al revés: si el early-return fuera primero, una
    //    edición "sin cambios" sobre un dato viejo inválido se saltearía la
    //    validación entera (misma lección que `gestiones.editar`).
    //
    //    NO hay guard de dirección ni de pasado, a diferencia de las gestiones
    //    (que prohíben futuro): el dominio es el opuesto. Un plazo puede
    //    corregirse a una fecha YA VENCIDA — es justo el caso en que el agente
    //    descubre tarde que la fecha real era otra.
    if (!RE_FECHA.test(fechaVencimiento) || !esFechaReal(fechaVencimiento)) {
      throw new ConvexError("La fecha de vencimiento no es válida.");
    }
    const texto = descripcion.trim();
    if (!texto) {
      throw new ConvexError("Escribí a qué corresponde el plazo.");
    }
    if (texto.length > MAX_DESCRIPCION) {
      throw new ConvexError(
        `La descripción es demasiado larga (máx. ${MAX_DESCRIPCION} caracteres).`,
      );
    }

    // 5) Idempotente: sin cambios reales, no escribe (igual que `gestiones.editar`).
    const cambioFecha = plazo.fechaVencimiento !== fechaVencimiento;
    if (!cambioFecha && plazo.descripcion === texto) {
      return { plazoId };
    }

    // 6) Re-armado de la alerta SÓLO si cambió la fecha (decisión del usuario:
    //    CUALQUIER cambio de fecha, adelante o atrás — adelantar un plazo lo hace
    //    más urgente, y esperar la cadencia dejaría al agente sin aviso fresco).
    //    Editar sólo la descripción NO toca la alerta.
    //
    //    Hay que limpiar LOS DOS campos, como hace `reabrirAvisos`: el driver REAL
    //    de la cadencia es `ultimoAvisoEn` (el cron recorre por fecha y corta por
    //    él); `avisadoAlAgente` quedó legacy. Limpiar sólo el booleano NO reavisa.
    await ctx.db.patch(plazoId, {
      fechaVencimiento,
      descripcion: texto,
      ...(cambioFecha
        ? { avisadoAlAgente: false, ultimoAvisoEn: undefined }
        : {}),
    });

    return { plazoId };
  },
});
