/**
 * REC-164 · Lector ESTRICTO de un subconjunto de `.xlsx`. Cero dependencias.
 *
 * No es un lector de Excel en general. Lee lo que tiene el archivo de contactos
 * y aborta ante todo lo que no reconoce, con el mismo criterio que el parser de
 * `cartera-csv.mjs`: con datos personales, una lectura que "más o menos
 * funciona" corre una columna y guarda el teléfono en el email sin que nadie se
 * entere. Si falla, que falle fuerte.
 *
 * Lo que soporta:
 *   - ZIP con método 0 (stored) o 8 (deflate), sin cifrado y sin ZIP64.
 *   - N hojas, resueltas por `xl/workbook.xml` + `xl/_rels/workbook.xml.rels`,
 *     y NUNCA suponiendo que se llaman `sheetN.xml`.
 *   - Celdas `t="inlineStr"` (vacías o con `<is>`), con texto en un `<t>` o en
 *     varios runs `<r><t>`. Una celda sin `t` y sin contenido (`<c r="B4" s="1"/>`)
 *     cuenta como vacía: es formato, no un valor.
 *
 * Lo que rechaza:
 *   - `xl/sharedStrings.xml`: ese archivo cambia cómo se leen las celdas, y
 *     este lector no lo implementa.
 *   - Cualquier celda con otro `t` (`s`, `n`, `b`, `str`…) o con un `<v>`.
 *   - Cualquier fórmula `<f>`.
 *
 * Las celdas se ubican por su referencia `r="C12"` y no por su posición en la
 * fila: Excel omite las celdas vacías, y contarlas por orden correría las
 * columnas.
 */

import { inflateRawSync } from "node:zlib";

export class ErrorXlsx extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorXlsx";
  }
}

// ───────────────────────────── ZIP ─────────────────────────────

const FIRMA_EOCD = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

/**
 * Devuelve `Map<nombre, Buffer>` con el contenido descomprimido de cada
 * entrada. Lee el directorio central (la fuente de verdad del ZIP) y no los
 * headers locales en secuencia, que pueden traer tamaños en cero cuando el
 * archivo se escribió en streaming.
 */
export function leerZip(buf) {
  // El End Of Central Directory está al final, después de un comentario
  // opcional de hasta 65.535 bytes.
  let eocd = -1;
  const desde = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= desde; i--) {
    if (buf.readUInt32LE(i) === FIRMA_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ErrorXlsx("no es un ZIP: no encontré el directorio central");

  const entradas = buf.readUInt16LE(eocd + 10);
  const offsetCentral = buf.readUInt32LE(eocd + 16);
  if (entradas === 0xffff || offsetCentral === 0xffffffff) {
    throw new ErrorXlsx("ZIP64 no soportado");
  }

  const archivos = new Map();
  let p = offsetCentral;
  for (let k = 0; k < entradas; k++) {
    if (buf.readUInt32LE(p) !== FIRMA_CENTRAL) throw new ErrorXlsx("directorio central corrupto");
    const flags = buf.readUInt16LE(p + 8);
    const metodo = buf.readUInt16LE(p + 10);
    const tamComprimido = buf.readUInt32LE(p + 20);
    const tamReal = buf.readUInt32LE(p + 24);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const offsetLocal = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    p += 46 + largoNombre + largoExtra + largoComentario;

    if (flags & 0x1) throw new ErrorXlsx(`${nombre}: entrada cifrada`);
    if (tamComprimido === 0xffffffff || tamReal === 0xffffffff || offsetLocal === 0xffffffff) {
      throw new ErrorXlsx(`${nombre}: ZIP64 no soportado`);
    }
    if (nombre.endsWith("/")) continue; // directorio

    if (buf.readUInt32LE(offsetLocal) !== FIRMA_LOCAL) throw new ErrorXlsx(`${nombre}: header local corrupto`);
    const inicio = offsetLocal + 30 + buf.readUInt16LE(offsetLocal + 26) + buf.readUInt16LE(offsetLocal + 28);
    const crudo = buf.subarray(inicio, inicio + tamComprimido);

    let datos;
    if (metodo === 0) datos = Buffer.from(crudo);
    else if (metodo === 8) datos = inflateRawSync(crudo);
    else throw new ErrorXlsx(`${nombre}: método de compresión ${metodo} no soportado`);

    if (datos.length !== tamReal) {
      throw new ErrorXlsx(`${nombre}: tamaño descomprimido ${datos.length}, el ZIP declara ${tamReal}`);
    }
    archivos.set(nombre, datos);
  }
  return archivos;
}

// ───────────────────────────── XML mínimo ─────────────────────────────

/** `&amp; &lt; &gt; &quot; &apos; &#N; &#xH;`. Cualquier otra entidad aborta. */
export function decodificarEntidades(texto) {
  return texto.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (_, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(cp);
    }
    const nombradas = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (!(e in nombradas)) throw new ErrorXlsx(`entidad XML desconocida: &${e};`);
    return nombradas[e];
  });
}

/** Atributos de un tag de apertura, por nombre completo (con prefijo, ej. `r:id`). */
function atributos(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = decodificarEntidades(m[3] ?? m[4]);
  }
  return out;
}

function texto(archivos, nombre) {
  const b = archivos.get(nombre);
  if (!b) throw new ErrorXlsx(`falta ${nombre}`);
  return b.toString("utf8");
}

// ───────────────────────────── Hojas ─────────────────────────────

/**
 * `[{ nombre, ruta }]` en el orden del libro. La ruta sale de la relación, que
 * puede ser relativa a `xl/` (`worksheets/sheet1.xml`) o absoluta
 * (`/xl/worksheets/sheet1.xml`): el archivo real usa la absoluta.
 */
function hojasDelLibro(archivos) {
  const libro = texto(archivos, "xl/workbook.xml");
  const rels = texto(archivos, "xl/_rels/workbook.xml.rels");

  const destinos = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = atributos(m[0]);
    if (a.Id && a.Target) destinos.set(a.Id, a.Target);
  }

  const hojas = [];
  for (const m of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const a = atributos(m[0]);
    const rid = a["r:id"];
    if (!a.name || !rid) throw new ErrorXlsx("una <sheet> sin name o sin r:id");
    const target = destinos.get(rid);
    if (!target) throw new ErrorXlsx(`la hoja "${a.name}" apunta a ${rid}, que no está en las relaciones`);
    const ruta = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    hojas.push({ nombre: a.name, ruta });
  }
  if (hojas.length === 0) throw new ErrorXlsx("el libro no tiene hojas");
  return hojas;
}

/** `"C12"` → `{ col: "C", fila: 12 }`. */
function partirRef(ref) {
  const m = /^([A-Z]{1,3})([0-9]+)$/.exec(ref ?? "");
  if (!m) throw new ErrorXlsx(`referencia de celda inválida: ${ref}`);
  return { col: m[1], fila: Number(m[2]) };
}

/**
 * Las filas de una hoja: `[{ fila, celdas: { A: "…", C: "…" } }]`. Las celdas
 * vacías no aparecen en `celdas`.
 */
function leerHoja(xml, nombreHoja) {
  if (/<f[\s>/]/.test(xml)) throw new ErrorXlsx(`hoja "${nombreHoja}": tiene fórmulas`);
  if (/<v[\s>/]/.test(xml)) throw new ErrorXlsx(`hoja "${nombreHoja}": tiene celdas con <v> (no inlineStr)`);

  const filas = [];
  // Una celda es `<c …/>` o `<c …>…</c>`. `[^>]*?` no cruza el `>` del tag.
  const reCelda = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
  for (const mf of xml.matchAll(/<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g)) {
    const numFila = Number(atributos(mf[1]).r);
    if (!Number.isInteger(numFila) || numFila < 1) throw new ErrorXlsx(`hoja "${nombreHoja}": <row> sin r válido`);
    const celdas = {};
    for (const mc of (mf[3] ?? "").matchAll(reCelda)) {
      const a = atributos(mc[1]);
      const { col, fila } = partirRef(a.r);
      if (fila !== numFila) {
        throw new ErrorXlsx(`hoja "${nombreHoja}": la celda ${a.r} está dentro de la fila ${numFila}`);
      }
      const cuerpo = mc[3] ?? "";
      if (a.t === undefined && cuerpo.trim() === "") continue; // celda de formato, vacía
      if (a.t !== "inlineStr") {
        throw new ErrorXlsx(`hoja "${nombreHoja}", celda ${a.r}: tipo ${a.t ?? "(sin t)"}, sólo se acepta inlineStr`);
      }
      // Concatena TODOS los <t> (texto plano o runs con formato <r><t>).
      let valor = "";
      for (const mt of cuerpo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) {
        valor += decodificarEntidades(mt[1] ?? "");
      }
      if (col in celdas) throw new ErrorXlsx(`hoja "${nombreHoja}": celda ${a.r} repetida`);
      if (valor !== "") celdas[col] = valor;
    }
    filas.push({ fila: numFila, celdas });
  }
  return filas;
}

/**
 * El libro entero: `[{ hoja, filas: [{ fila, celdas }] }]`, en el orden de las
 * pestañas.
 */
export function leerXlsx(buf) {
  const archivos = leerZip(buf);
  if (archivos.has("xl/sharedStrings.xml")) {
    throw new ErrorXlsx("el libro tiene xl/sharedStrings.xml: este lector sólo admite celdas inlineStr");
  }
  return hojasDelLibro(archivos).map(({ nombre, ruta }) => ({
    hoja: nombre,
    filas: leerHoja(texto(archivos, ruta), nombre),
  }));
}
