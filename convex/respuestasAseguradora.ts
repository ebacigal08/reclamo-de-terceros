import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { resolveRole } from "./users";

/**
 * REC-31 · "Registro de respuesta de la aseguradora" — bitácora INTERNA del
 * agente con lo que la aseguradora ofreció o resolvió en cada instancia de la
 * negociación (oferta, rechazo, contraoferta, pendiente de resolución).
 *
 * Seguridad — SÓLO AGENTE. Vive en su propio módulo, y NO como un campo de
 * `casos.get`, a propósito: `casos.get` es una query DUAL-ROL (autoriza al
 * agente O al damnificado dueño) que hace spread del caso. Colgar esta tabla de
 * ahí dejaría la no-visibilidad del damnificado a merced de un `if` interno que
 * cualquier refactor futuro puede romper en silencio. Acá la frontera es la
 * función entera: esta tabla se lee por UNA query y esa query exige rol agente.
 *
 * Reglas del módulo (iguales a `pedidos.ts`): la identidad se DERIVA de la
 * sesión con `resolveRole` (nunca se acepta `agenteId` del cliente); `Error` para
 * los guards de sesión/pertenencia, `ConvexError` (mensaje legible en el cliente)
 * para la validación de formulario/negocio.
 *
 * NO notifica ni manda email: es información interna del agente, el damnificado
 * está excluido del canal (mismo criterio explícito que `casos.cambiarPrioridad`).
 */

// Mirror local de la union `tipoRespuesta` de convex/schema.ts (el bundle de
// Convex no puede importar de `src/`). MANTENER SINCRONIZADO con schema.ts y con
// `TIPOS_RESPUESTA` de src/lib/constants.ts.
const tipoRespuesta = v.union(
  v.literal("OFERTA"),
  v.literal("RECHAZO"),
  v.literal("CONTRAOFERTA"),
  v.literal("PENDIENTE"),
);

// Más largo que los 500 de un pedido: acá se transcribe una oferta real, con
// rubros, montos y condiciones (el relato ya usa 1200 para `que_paso`).
const MAX_TEXTO = 2000;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const TZ_AR = "America/Argentina/Buenos_Aires";

/**
 * "Hoy" del dominio (YYYY-MM-DD) en hora ARGENTINA, calculado en el SERVER.
 *
 * Por qué no el hoy UTC: Convex corre en UTC y el agente está en AR (UTC-3), así
 * que entre las 21:00 y la medianoche argentinas el UTC ya pasó de día → un hoy
 * UTC dejaría entrar el "mañana" del agente (fail-open). Y el `max` del
 * `<input type="date">` es UX, no frontera: `registrar` es una API pública.
 *
 * Ruta principal: `Intl` con la zona IANA. Por spec, si el runtime no tiene datos
 * de zonas horarias, una `timeZone` no soportada TIRA `RangeError` (no cae en
 * silencio a UTC) → lo capturamos. `en-CA` produce YYYY-MM-DD; el regex blinda
 * contra un build sin datos de locale.
 *
 * Fallback: Argentina es UTC-3 FIJO (no observa horario de verano desde 2009), así
 * que restar 3 horas da la fecha local exacta. DEUDA: si AR volviera a aplicar DST,
 * esta rama quedaría corrida una hora y hay que borrarla — para entonces el runtime
 * de Convex debería soportar `Intl`, que es la ruta correcta de todos modos.
 */
function hoyEnArgentina(): string {
  try {
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_AR,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (RE_FECHA.test(iso)) return iso;
  } catch {
    // Runtime sin datos de zonas horarias → cae al fallback determinístico.
  }
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Descarta fechas con formato válido pero inexistentes (ej. 2026-02-31). */
function esFechaReal(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Historial de respuestas de un caso, en orden cronológico ASCENDENTE (lo da el
 * índice `by_caso_fecha`; el orden canónico queda en el server y la UI lo
 * invierte para mostrar lo más reciente arriba).
 *
 * Fail-closed: sin sesión de agente, o caso inexistente/ajeno → `null` (mismo
 * trato para "no existe" y "no es tuyo" → no se filtra la existencia de casos
 * ajenos). `[]` = autorizado, todavía sin respuestas.
 */
export const listPorCaso = query({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") return null;

    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) return null;

    const respuestas = await ctx.db
      .query("respuestasAseguradora")
      .withIndex("by_caso_fecha", (q) => q.eq("casoId", casoId))
      .collect();

    return respuestas.map((r) => ({
      _id: r._id,
      texto: r.texto,
      tipo: r.tipo,
      fecha: r.fecha,
      registradoEn: r._creationTime, // el `registradoAt` del issue
    }));
  },
});

/**
 * Registra una respuesta de la aseguradora en el caso.
 *
 * ORDEN (fijo, igual que `pedidos.crear`): auth → pertenencia → cerrado →
 * validación → insert → return. No hay notificación ni destinatario que cargar:
 * nada de esto sale del ámbito del agente.
 */
export const registrar = mutation({
  args: {
    casoId: v.id("casos"),
    texto: v.string(),
    tipo: tipoRespuesta,
    fecha: v.string(), // ISO YYYY-MM-DD; `v.string()` no alcanza → se valida abajo
  },
  handler: async (ctx, { casoId, texto, tipo, fecha }) => {
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

    // 3) Guard de negocio + validación (ConvexError legible en el cliente).
    //    Cerrado = congelado: invariante uniforme del módulo (pedidos.crear,
    //    cambiarPrioridad, avanzarEtapa). Trade-off asumido: un caso cerrado
    //    EN_APELACION podría seguir recibiendo respuestas reales, pero hoy no
    //    existe "reabrir caso" en el MVP; si se agrega, el guard se revisa ahí
    //    con criterio explícito, no por goteo desde acá.
    if (caso.cerrado) {
      throw new ConvexError(
        "El caso está cerrado; no podés registrar nuevas respuestas.",
      );
    }
    const contenido = texto.trim();
    if (!contenido) {
      throw new ConvexError("Escribí qué respondió la aseguradora.");
    }
    if (contenido.length > MAX_TEXTO) {
      throw new ConvexError(
        `La respuesta es demasiado larga (máx. ${MAX_TEXTO} caracteres).`,
      );
    }
    if (!RE_FECHA.test(fecha) || !esFechaReal(fecha)) {
      throw new ConvexError("La fecha de la respuesta no es válida.");
    }
    // `fecha` es cuándo se RECIBIÓ la respuesta → en el futuro es un error de
    // tipeo por definición. Comparación lexicográfica de ISO (mismo criterio que
    // `plazos`), contra el hoy ARGENTINO del server (ver `hoyEnArgentina`).
    if (fecha > hoyEnArgentina()) {
      throw new ConvexError("La fecha de la respuesta no puede ser futura.");
    }

    // 4) Alta. `registradoAt` = `_creationTime`, no se persiste a mano.
    const respuestaId = await ctx.db.insert("respuestasAseguradora", {
      casoId,
      texto: contenido,
      tipo,
      fecha,
    });

    return { respuestaId };
  },
});
