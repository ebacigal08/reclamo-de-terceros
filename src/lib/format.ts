/** Helpers de formato — Amparo CRM. */

/** Formatea una fecha a DD/MM/AAAA (convención del design system). */
export function formatFecha(input: string | number | Date): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Días entre hoy y una fecha (positivo = futuro). Útil para plazos. */
export function diasHasta(fecha: string | number | Date): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(fecha);
  objetivo.setHours(0, 0, 0, 0);
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
}

/** Estado visual de un plazo: "vencido" | "proximo" | "ok". */
export function estadoPlazo(fechaVencimiento: string | number | Date): "vencido" | "proximo" | "ok" {
  const dias = diasHasta(fechaVencimiento);
  if (dias < 0) return "vencido";
  if (dias <= 3) return "proximo";
  return "ok";
}

/** Iniciales para avatares (ej: "Lucía Fernández" → "LF"). */
export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
