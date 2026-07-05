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
