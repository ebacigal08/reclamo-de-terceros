/**
 * Helpers puros compartidos por las funciones Convex.
 * (No pueden importar de `src/`: el bundle de Convex está aislado.)
 */

/**
 * Normaliza un email para lookups y unicidad global entre agentes/damnificados.
 * Se aplica en TODO punto que toque email (seed, resolveRole, escrituras).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A qué dirección se le manda un email AL AGENTE (REC-73).
 *
 * Es el ÚNICO lugar que decide el destino de un aviso al agente. Los tres
 * productores (`plazos`, `pedidos`, `mensajes`) pasan por acá; un cuarto que se
 * olvide vuelve, en silencio, a la dirección de identidad — que en producción es
 * `agente@amparo.ar`, inexistente y suprimida en Resend. "En silencio" es
 * exactamente la enfermedad que este helper cura, así que no lo inlinees.
 *
 * OJO con el `??`, que es la trampa obvia: `"" ?? email` devuelve `""`, no
 * `email` — el `??` sólo atrapa null/undefined. Una fila con la cadena vacía
 * mandaría los avisos a una dirección inválida: el mismo agujero, otro disfraz.
 * Por eso el chequeo es de TRUTHINESS, no de nulidad. (`configurarEmailNotificaciones`
 * ya rechaza la cadena vacía; esto es la segunda línea de defensa.)
 *
 * `email` (identidad) NO se toca acá: `resolveRole`, el guard de unicidad del
 * alta y `contarPorEmail` siguen usándolo. Eso es identidad, no entrega.
 */
export function emailDeAvisos(agente: {
  email: string;
  emailNotificaciones?: string;
}): string {
  const propio = agente.emailNotificaciones?.trim();
  return propio ? propio : agente.email;
}

// ── Fechas de calendario (ISO YYYY-MM-DD) ────────────────────────
// Viven acá, y no en el módulo que las estrenó (respuestasAseguradora, REC-31),
// porque las usan los guards de "fecha no futura" de VARIAS tablas y tienen que
// validar IDÉNTICO. Con una copia por módulo, la corrección del fallback de
// abajo se aplicaría en una y se olvidaría en la otra → dos fronteras de
// validación que deberían ser la misma, comportándose distinto.

export const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const TZ_AR = "America/Argentina/Buenos_Aires";

/**
 * "Hoy" del dominio (YYYY-MM-DD) en hora ARGENTINA, calculado en el SERVER.
 *
 * Por qué no el hoy UTC: Convex corre en UTC y el agente está en AR (UTC-3), así
 * que entre las 21:00 y la medianoche argentinas el UTC ya pasó de día → un hoy
 * UTC dejaría entrar el "mañana" del agente (fail-open). Y el `max` de un
 * `<input type="date">` es UX, no frontera: las mutations son API pública.
 *
 * Ruta principal: `Intl` con la zona IANA. Por spec, si el runtime no tiene datos
 * de zonas horarias, una `timeZone` no soportada TIRA `RangeError` (no cae en
 * silencio a UTC) → lo capturamos. `en-CA` produce YYYY-MM-DD; el regex blinda
 * contra un build sin datos de locale.
 *
 * Fallback: Argentina es UTC-3 FIJO (no observa horario de verano desde 2009), así
 * que restar 3 horas da la fecha local exacta. DEUDA: si algún día AR vuelve a
 * aplicar DST, esta rama queda corrida una hora y hay que BORRARLA — para entonces
 * el runtime de Convex debería soportar `Intl`, que es la ruta correcta igual.
 */
export function hoyEnArgentina(): string {
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
export function esFechaReal(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// ── Envío de invitación: estado y cooldown (REC-71) ──────────────
/** Ventana mínima entre dos envíos de invitación al MISMO damnificado. */
export const COOLDOWN_INVITACION_MS = 60_000;

/** Los tres timestamps del ciclo de vida de un envío (ver schema.ts). */
export type MarcasInvitacion = {
  invitacionIntentoEn?: number;
  invitacionEnviadaEn?: number;
  invitacionFalloEn?: number;
};

export type EstadoEnvioInvitacion =
  | "NUNCA" // no se intentó nunca
  | "ENTREGADA" // el último intento fue aceptado por Resend
  | "FALLIDA" // el último intento fue rechazado por Resend
  | "EN_CURSO"; // se intentó y todavía no se sabe (o la action murió)

/**
 * Deriva en qué estado quedó el ÚLTIMO intento de envío, comparándolo con sus dos
 * posibles desenlaces. Es la única fuente de esa lectura: la usan el cooldown, los
 * dos productores y la ficha, así que no puede haber dos interpretaciones distintas
 * de los mismos tres campos.
 */
export function estadoInvitacion(
  m: MarcasInvitacion,
  ahora: number = Date.now(),
): { estado: EstadoEnvioInvitacion; enCooldown: boolean } {
  const intento = m.invitacionIntentoEn;
  if (intento === undefined) return { estado: "NUNCA", enCooldown: false };

  const entregada = (m.invitacionEnviadaEn ?? 0) >= intento;
  const fallida = (m.invitacionFalloEn ?? 0) >= intento;

  const estado: EstadoEnvioInvitacion = entregada
    ? "ENTREGADA"
    : fallida
      ? "FALLIDA"
      : "EN_CURSO";

  // Un intento FALLIDO no consume cooldown: si Resend rechazó el email, el agente
  // tiene que poder reintentar YA — es lo que el propio mensaje de error le dice que
  // haga. Bloquearlo 60 s y encima contestarle "ya se le envió una invitación" sería
  // mentirle sobre un correo que nunca salió.
  //
  // Un intento EN CURSO sí bloquea: es lo que evita que dos llamadas concurrentes
  // (dos pestañas, dos POST al endpoint) manden dos emails. Si la action murió sin
  // resolver, el bloqueo se cura solo al vencer la ventana.
  //
  // Y una ENTREGA reciente también bloquea: no le llenamos la casilla al damnificado.
  const enCooldown =
    estado !== "FALLIDA" && ahora - intento < COOLDOWN_INVITACION_MS;

  return { estado, enCooldown };
}

/**
 * ¿Hay que bloquear un nuevo envío de invitación a este damnificado?
 *
 * Vive acá, y no en el módulo que lo estrenó, porque el claim del cooldown tiene
 * DOS productores —`casos.crearRegistro` (alta) e `invitaciones.prepararInvitacion`
 * (reenvío desde la ficha)— y ambos tienen que aplicar EXACTAMENTE la misma regla.
 * Con una copia por módulo, el rate-limit se puentea por el camino más trivial:
 * crearle un segundo caso a un damnificado sin activar recién invitado.
 *
 * Lo que difiere entre los dos productores es la REACCIÓN, no la regla: la ficha
 * lanza ConvexError (apretaste un botón que dice "enviar"), el alta lo reporta como
 * un estado más del resultado (pediste crear un caso; el email es un accesorio).
 *
 * El chequeo y la escritura del claim van en la MISMA mutation: es lo que lo hace
 * atómico contra dos llamadas concurrentes (una gana, la otra reintenta por OCC,
 * ve el timestamp nuevo y corta).
 */
export function enCooldownInvitacion(
  m: MarcasInvitacion,
  ahora: number,
): boolean {
  return estadoInvitacion(m, ahora).enCooldown;
}
