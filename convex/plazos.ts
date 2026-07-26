import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { crearNotificacion } from "./notificaciones";
import { emailDeAvisos, RE_FECHA, esFechaReal } from "./lib";
import { exigirCasoDeAgente } from "./autorizacion";

/**
 * Plazos críticos del reclamo: alertas al agente (REC-29 · REC-74) y ABM del
 * agente (REC-81 editar · REC-87 crear/eliminar).
 *
 * `revisarVencimientos` es el job que dispara el cron diario (convex/crons.ts):
 * busca los plazos por vencer (≤ hoy+3, incluye vencidos) de casos abiertos y
 * REAVISA al agente cada 3 días mientras sigan venciendo (cadencia C2, vía
 * `ultimoAvisoEn`). La ENTREGA real de cada aviso la reflejan los webhooks de
 * Resend en `entregasEmail`; `avisadoAlAgente` quedó LEGACY (sólo lo usa
 * `reabrirAvisos`). El flag `inminente` de `casos.listMine` ya NO depende de
 * "avisado": persiste mientras el plazo venza.
 *
 * API de cliente (toda solo-agente, y "cerrado = congelado"): `crear`, `editar`
 * y `eliminar`. Hasta REC-81 los plazos sólo los escribían el seed y el cron, y
 * la ficha los mostraba read-only; hasta REC-87 no había forma de dar de alta un
 * plazo — un caso nuevo nacía sin ninguno y el sistema avisaba por vencimientos
 * que nadie podía cargar.
 *
 * El CRON NO SE TOCÓ en REC-87: un plazo nace con `avisadoAlAgente: false` y sin
 * `ultimoAvisoEn`, que es exactamente lo que `revisarVencimientos` espera de un
 * plazo nunca avisado.
 *
 * SIGUE SIN EXISTIR "marcar cumplido" (alcance acotado por el usuario): la tabla
 * no tiene ningún campo de cumplimiento. Un plazo que ya no corresponde se
 * elimina.
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

// ── ABM del plazo (REC-81 editar · REC-87 crear/eliminar) ────────

// Un plazo es un RÓTULO ("Contestar la mediación"), no una bitácora: por eso la
// mitad de los 1000 de `gestiones`. Espejo de PLAZO_MAX_DESCRIPCION en
// src/lib/constants.ts (el server valida igual).
const MAX_DESCRIPCION = 500;

// REC-87 · Techo operativo, no una regla del dominio: `casos.get` y
// `casos.listMine` hacen `.collect()` de los plazos SIN cota, y son los dos
// caminos calientes del agente. 20 es holgadísimo para un reclamo real y acota
// esa lectura. Espejo de PLAZO_MAX_POR_CASO en src/lib/constants.ts.
const MAX_PLAZOS_POR_CASO = 20;

/**
 * Formato + fecha existente. La MISMA función corre en `crear` y en `editar`:
 * dos copias del criterio se separan sola la primera vez que una se corrige.
 *
 * NO hay guard de dirección ni de pasado, a diferencia de las gestiones (que
 * prohíben futuro): el dominio es el opuesto. Un plazo puede cargarse o
 * corregirse a una fecha YA VENCIDA — es justo el caso en que el agente
 * descubre tarde que la fecha real era otra.
 */
function validarFechaVencimiento(fechaVencimiento: string): void {
  if (!RE_FECHA.test(fechaVencimiento) || !esFechaReal(fechaVencimiento)) {
    throw new ConvexError("La fecha de vencimiento no es válida.");
  }
}

/** Valida y normaliza la descripción. `ConvexError` = mensaje legible para el agente. */
function validarDescripcion(descripcion: string): string {
  const texto = descripcion.trim();
  if (!texto) {
    throw new ConvexError("Escribí a qué corresponde el plazo.");
  }
  if (texto.length > MAX_DESCRIPCION) {
    throw new ConvexError(
      `La descripción es demasiado larga (máx. ${MAX_DESCRIPCION} caracteres).`,
    );
  }
  return texto;
}

/**
 * Guard de `editar` y `eliminar`: rol + pertenencia del CASO + que el plazo sea
 * EFECTIVAMENTE de ese caso.
 *
 * Las dos entran por `casoId` (y `crear` lo necesita sí o sí), así que acá la
 * cadena es caso → agente y después plazo → caso. Es la asimetría inversa a
 * `gestiones`, que entra por `gestionId`: lo que importa es que el módulo tenga
 * UNA sola forma de autorizar un plazo, no cuál de las dos.
 *
 * Sin el segundo tramo, el dueño de un caso podría tocar el plazo de CUALQUIER
 * otro pasando su propio `casoId`. MISMO mensaje para "no existe" y "no es
 * tuyo": si difirieran, la respuesta filtraría la existencia de plazos ajenos.
 */
async function plazoAutorizado(
  ctx: MutationCtx,
  casoId: Id<"casos">,
  plazoId: Id<"plazos">,
) {
  const { caso } = await exigirCasoDeAgente(ctx, casoId);

  const plazo = await ctx.db.get(plazoId);
  if (!plazo || plazo.casoId !== casoId) {
    throw new Error("No autorizado: el plazo no existe o no es tuyo.");
  }

  return { caso, plazo };
}

/**
 * REC-87 · Carga un plazo nuevo en el caso.
 *
 * Hasta acá el ÚNICO `insert("plazos")` del repo era el seed: un caso dado de
 * alta por el agente nacía sin plazos, la card quedaba vacía para siempre y
 * `editar` (REC-81) sólo servía sobre los casos sembrados.
 *
 * NACE SIN AVISAR, y eso es lo que evita tocar el cron: `avisadoAlAgente` es
 * requerido por el schema y va en `false`; `ultimoAvisoEn` queda AUSENTE a
 * propósito. `revisarVencimientos` recorre por `by_fecha` y corta por
 * `ultimoAvisoEn` ⇒ un plazo que ya cae dentro de la ventana (≤ hoy+3) se avisa
 * en la próxima corrida, sin ningún caso especial.
 *
 * NO notifica en el alta: el agente acaba de cargar el plazo, mandarle un email
 * a sí mismo en el mismo click es ruido. El aviso es del cron, y sólo cuando el
 * plazo entra en ventana.
 */
export const crear = mutation({
  args: {
    casoId: v.id("casos"),
    fechaVencimiento: v.string(), // ISO YYYY-MM-DD; `v.string()` no alcanza → se valida
    descripcion: v.string(),
  },
  handler: async (ctx, { casoId, fechaVencimiento, descripcion }) => {
    // 1) Rol + pertenencia del CASO (fail-closed; mismo mensaje para inexistente
    //    y ajeno). No hay pertenencia de plazo que chequear: todavía no existe.
    const { caso } = await exigirCasoDeAgente(ctx, casoId);

    // 2) Cerrado = congelado, como toda escritura del agente.
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés agregar plazos.");
    }

    // 3) Validación, con el MISMO criterio que `editar` (helpers compartidos).
    validarFechaVencimiento(fechaVencimiento);
    const texto = validarDescripcion(descripcion);

    // 4) Tope por caso, después de validar: el input basura corta antes de tocar
    //    la base. `take(N)` y no `collect()` — sólo hace falta saber si hay AL
    //    MENOS N, y sería raro que justo la función que impone el tope fuera la
    //    única lectura sin cota. Chequeo e insert van en la misma mutation, que
    //    es lo que lo hace atómico: dos altas concurrentes leen el mismo rango
    //    del índice, el insert de la ganadora invalida esa lectura y la otra
    //    reintenta por OCC, ve el tope y corta.
    const existentes = await ctx.db
      .query("plazos")
      .withIndex("by_caso", (q) => q.eq("casoId", casoId))
      .take(MAX_PLAZOS_POR_CASO);
    if (existentes.length >= MAX_PLAZOS_POR_CASO) {
      throw new ConvexError(
        `Este caso ya tiene el máximo de ${MAX_PLAZOS_POR_CASO} plazos. Eliminá alguno para agregar otro.`,
      );
    }

    const plazoId = await ctx.db.insert("plazos", {
      casoId,
      descripcion: texto,
      fechaVencimiento,
      avisadoAlAgente: false,
    });

    return { plazoId };
  },
});

/**
 * REC-87 · Elimina un plazo cargado por error.
 *
 * BORRADO DURO, mismo criterio que `gestiones.eliminar`: nada referencia a
 * `plazos` —las notificaciones `PLAZO_PROXIMO` guardan COPIAS de la descripción
 * y la fecha en `datos`, no un FK— así que no hay cascada. Un soft-delete
 * pediría un campo `eliminado` y un filtro en TODA lectura, presente y futura,
 * incluido el cron: el día que alguien agregue una lectura sin el filtro, los
 * plazos "borrados" vuelven a mandar emails.
 *
 * NO retracta las notificaciones ya emitidas por este plazo (siguen en el
 * historial del agente, con su copia de la descripción). Lo que corta es el
 * FUTURO: el cron no lo vuelve a ver. Es lo que se quiere — un aviso que ya se
 * mandó es un hecho, no un estado.
 *
 * NO es idempotente ante un plazo inexistente, a propósito: devolver `ok` en
 * silencio para "no existe" y `Error` para "ajeno" DISTINGUIRÍA los dos casos y
 * filtraría la existencia de plazos ajenos. La race real (otra pestaña ya lo
 * borró) es inofensiva: la live query ya sacó la fila del DOM.
 */
export const eliminar = mutation({
  args: { casoId: v.id("casos"), plazoId: v.id("plazos") },
  handler: async (ctx, { casoId, plazoId }) => {
    const { caso } = await plazoAutorizado(ctx, casoId, plazoId);

    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés eliminar plazos.");
    }

    await ctx.db.delete(plazoId);
    return { ok: true };
  },
});

/**
 * Corrige un plazo mal cargado: fecha de vencimiento y/o descripción.
 *
 * Set ABSOLUTO de los dos campos editables (la UI manda el form entero), igual
 * que `gestiones.editar`: un patch parcial con `v.optional` multiplicaría los
 * estados a validar sin ganar nada. `casoId` NO es editable — viaja como
 * argumento sólo para el guard de pertenencia, no para mover el plazo de caso.
 *
 * No existe "marcar cumplido" (alcance acotado por el usuario): la tabla no
 * tiene ningún campo de cumplimiento. Para dar de alta un plazo, `crear`; para
 * sacar uno que no corresponde, `eliminar` (los dos de REC-87).
 */
export const editar = mutation({
  args: {
    casoId: v.id("casos"),
    plazoId: v.id("plazos"),
    fechaVencimiento: v.string(),
    descripcion: v.string(),
  },
  handler: async (ctx, { casoId, plazoId, fechaVencimiento, descripcion }) => {
    // 1) Rol + pertenencia del caso Y del plazo, fail-closed y en un solo lugar
    //    (el mismo guard que usa `eliminar`).
    const { caso, plazo } = await plazoAutorizado(ctx, casoId, plazoId);

    // 2) Cerrado = congelado, como toda escritura del agente.
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés editar plazos.");
    }

    // 3) Validar SIEMPRE, y recién después comparar para el early-return de
    //    idempotencia. Nunca al revés: si el early-return fuera primero, una
    //    edición "sin cambios" sobre un dato viejo inválido se saltearía la
    //    validación entera (misma lección que `gestiones.editar`).
    //
    //    El ORDEN importa y es parte del contrato: fecha primero, descripción
    //    después. Con los dos campos mal, el cliente ve el error de la fecha.
    validarFechaVencimiento(fechaVencimiento);
    const texto = validarDescripcion(descripcion);

    // 4) Idempotente: sin cambios reales, no escribe (igual que `gestiones.editar`).
    const cambioFecha = plazo.fechaVencimiento !== fechaVencimiento;
    if (!cambioFecha && plazo.descripcion === texto) {
      return { plazoId };
    }

    // 5) Re-armado de la alerta SÓLO si cambió la fecha (decisión del usuario:
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
