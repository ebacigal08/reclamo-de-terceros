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
