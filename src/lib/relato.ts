import { RELATO_PREGUNTAS } from "./constants";
import { formatFecha } from "./format";

/**
 * REC-79 · Codec y display del relato, compartidos entre el wizard del damnificado
 * (`RelatoView`) y la card editable del agente (`RelatoCard`).
 *
 * Vive acá porque el formato persistido de `si_no_detalle` —`"Sí — <detalle>"`, con
 * em-dash y espacios— estaba codificado y decodificado a mano en el wizard, y la
 * card del agente habría sido la cuarta copia. Un carácter distinto en ese
 * separador no rompe nada visible: corrompe datos en silencio.
 *
 * Las respuestas se persisten como `{ pregunta: <TÍTULO literal>, respuesta }`; el
 * estado de los formularios, en cambio, es `Record<id, string>` (más `detalles`
 * aparte para el "¿con quién y cuándo?"). Estas funciones traducen entre las dos
 * formas y en ningún caso conocen Convex.
 */

export type PreguntaRelato = (typeof RELATO_PREGUNTAS)[number];
export type RespuestaRelato = { pregunta: string; respuesta: string };
/** Estado del form: valor por `id` de pregunta. */
export type ValoresRelato = Record<string, string>;

/** Fecha ISO YYYY-MM-DD → DD/MM/AAAA parseada en horario LOCAL (evita el -1 por UTC). */
export function mostrarFecha(iso: string): string {
  return iso ? formatFecha(`${iso}T00:00:00`) || iso : "";
}

/**
 * Respuestas persistidas → estado del form (`valores` + `detalles`), mapeando por
 * TÍTULO de pregunta.
 *
 * `fallbackPorIndice` es para la card del agente, que ya venía tolerando filas
 * históricas con títulos que cambiaron (`RelatoCard`); el wizard NO lo usa, para
 * no cambiarle el comportamiento a un flujo que ya está en producción.
 */
export function decodificarRespuestas(
  respuestas: readonly RespuestaRelato[],
  opciones: { fallbackPorIndice?: boolean } = {},
): { valores: ValoresRelato; detalles: ValoresRelato } {
  const valores: ValoresRelato = {};
  const detalles: ValoresRelato = {};

  RELATO_PREGUNTAS.forEach((q, i) => {
    const encontrada = respuestas.find((r) => r.pregunta === q.titulo);
    const found =
      encontrada ?? (opciones.fallbackPorIndice ? respuestas[i] : undefined);
    if (!found) return;

    if (q.tipo === "si_no_detalle") {
      // "No" | "Sí" (detalle vacío) | "Sí — <detalle>". Cualquier otra cosa se
      // ignora a propósito: no se inventa un valor para el selector.
      if (found.respuesta === "No") {
        valores[q.id] = "No";
      } else if (found.respuesta.startsWith("Sí")) {
        valores[q.id] = "Sí";
        detalles[q.id] =
          found.respuesta === "Sí"
            ? ""
            : found.respuesta.replace(/^Sí\s*—\s*/, "");
      }
    } else {
      valores[q.id] = found.respuesta;
    }
  });

  return { valores, detalles };
}

/**
 * Estado del form → payload del backend. Manda SIEMPRE las 7, en orden canónico y
 * con los títulos canónicos (incluso las vacías: el server decide si eso alcanza).
 * La fecha viaja en ISO `YYYY-MM-DD`, crudo del `<input type="date">`.
 */
export function codificarRespuestas(
  valores: ValoresRelato,
  detalles: ValoresRelato,
): RespuestaRelato[] {
  return RELATO_PREGUNTAS.map((q) => {
    const val = (valores[q.id] ?? "").trim();
    let respuesta = val;
    if (q.tipo === "si_no_detalle" && val === "Sí") {
      const det = (detalles[q.id] ?? "").trim();
      respuesta = det ? `Sí — ${det}` : "Sí";
    }
    return { pregunta: q.titulo, respuesta };
  });
}

/**
 * Una pregunta está "completa" si tiene respuesta. `algo_mas` es opcional; y si una
 * `si_no_detalle` (denuncia) es "Sí", el detalle es OBLIGATORIO. Espeja el criterio
 * que el server aplica en `convex/relato.ts` (`faltaParaEnviar`).
 */
export function respuestaCompleta(
  q: PreguntaRelato,
  valores: ValoresRelato,
  detalles: ValoresRelato,
): boolean {
  const val = (valores[q.id] ?? "").trim();
  if (q.id === "algo_mas") return true;
  if (!val) return false;
  if (q.tipo === "si_no_detalle" && val === "Sí") {
    return (detalles[q.id] ?? "").trim().length > 0;
  }
  return true;
}

/** `true` si falta alguna requerida (el guard de cliente antes de enviar/guardar). */
export function faltanRequeridas(
  valores: ValoresRelato,
  detalles: ValoresRelato,
): boolean {
  return RELATO_PREGUNTAS.some((q) => !respuestaCompleta(q, valores, detalles));
}

/** Texto legible desde el ESTADO DEL FORM (resumen del wizard). */
export function displayRespuesta(
  q: PreguntaRelato,
  valores: ValoresRelato,
  detalles: ValoresRelato,
): string {
  const val = (valores[q.id] ?? "").trim();
  if (!val) return "—";
  if (q.tipo === "fecha") return mostrarFecha(val);
  if (q.tipo === "si_no_detalle" && val === "Sí") {
    const det = (detalles[q.id] ?? "").trim();
    return det ? `Sí — ${det}` : "Sí";
  }
  return val;
}

/**
 * Texto legible desde una respuesta YA PERSISTIDA (lectura de la ficha). Vacío o
 * faltante → "—". Si una fecha no parsea, se muestra el crudo en vez de romper; el
 * resto (`"Sí — detalle"`, `"No"`, texto libre) va tal cual, sin re-parsear.
 */
export function textoMostrado(q: PreguntaRelato, respuesta: string): string {
  const val = respuesta.trim();
  if (!val) return "—";
  if (q.tipo === "fecha") return mostrarFecha(val);
  return val;
}
