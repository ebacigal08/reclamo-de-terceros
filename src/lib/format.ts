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

/**
 * Fecha LOCAL de hoy en formato YYYY-MM-DD (usa getters locales, no toISOString
 * —que es UTC—). Fuente de "hoy" para reglas de calendario local (ej. el corte
 * de "plazo inminente" que se envía a `casos.listMine`). Coherente con
 * `diasHasta`/`estadoPlazo`, que trabajan en medianoche local.
 */
export function hoyLocalISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Hora local en HH:MM (24h). Para los mensajes del chat (REC-34). */
export function formatHora(input: string | number | Date): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** ¿Los dos instantes caen el mismo día local? Separadores de día del chat. */
export function mismoDia(a: string | number | Date, b: string | number | Date): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
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

/**
 * Tamaño de archivo legible (ej: 348_500 → "340 KB"; 2_100_000 → "2 MB").
 * Tolera `null`/`undefined` porque `tamanoBytes` es opcional en `documentos`
 * (docs viejos podrían no tenerlo) → devuelve "" en ese caso. Base 1024,
 * separador decimal local (coma en es-AR) y sin decimales para bytes/KB enteros.
 */
export function formatTamano(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  // Hasta 1 decimal para MB; sin ".0" si es entero.
  const redondeado = Math.round(mb * 10) / 10;
  return `${redondeado.toLocaleString("es-AR")} MB`;
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
