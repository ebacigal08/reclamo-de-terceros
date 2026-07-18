/** Descarga de archivos en el cliente — Amparo CRM. */

/**
 * Descarga un archivo con su **nombre original**.
 *
 * Convex File Storage sirve los archivos *inline* (sin
 * `Content-Disposition: attachment`) y desde otro origen (`*.convex.cloud`),
 * donde el atributo `download` de un `<a>` **se ignora por ser cross-origin**.
 * Por eso bajamos el blob a memoria y creamos un objectURL *same-origin*
 * (`blob:`), sobre el que `download` sí renombra.
 *
 * Lanza un `Error` genérico si la descarga falla — **sin** incluir la URL de
 * storage en el mensaje (es dato sensible: no debe terminar en logs/UI). El
 * llamador captura y, como fallback, abre la URL en una pestaña.
 */
export async function descargarArchivo(url: string, nombreArchivo: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo descargar el archivo.");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = nombreArchivo.trim() || "documento";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revocar en un tick posterior: revocar sincrónicamente puede cancelar la
    // descarga en algunos navegadores antes de que arranque. El `finally`
    // garantiza que se libere aunque el bloque anterior lance (no leak).
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
