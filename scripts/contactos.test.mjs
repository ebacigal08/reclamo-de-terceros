/**
 * REC-164 · Las reglas del import de contactos que fallan EN SILENCIO.
 *
 *  1. El lector `.xlsx`: tiene que leer lo que el archivo trae y RECHAZAR lo
 *     que no entiende (sharedStrings, otro tipo de celda, fórmulas). Si no, una
 *     columna corrida pasa sin que nadie lo note.
 *  2. La validación del libro entero, que tiene que ABORTAR.
 *  3. La clave de la persona y la fusión, incluido C2 de la auditoría: una
 *     anomalía que viene sólo en la SEGUNDA fila igual marca al contacto.
 *  4. Guards estáticos sobre `convex/contactos.ts`: la habilitación, que el
 *     patch del re-import NO toca el `estado`, y que el contrato sea el mismo
 *     en el script, el validador, el schema y la proyección (C4).
 *
 * ⚠️ FIXTURE SINTÉTICA. Personas, CUIT y documentos inventados. Nunca se copian
 * filas del Excel real a un archivo versionado.
 *
 * Cada guard lleva su control (la convención de `rutas.test.mjs`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

import { normalizeEmail, esNombreNoVisible, compararNombresContacto } from "../convex/lib.ts";
import { leerXlsx, decodificarEntidades, ErrorXlsx } from "./xlsx-mini.mjs";
import {
  ENCABEZADOS,
  MARCAS,
  ErrorContactos,
  validarLibro,
  aContactos,
  claveDe,
  normalizarNombre,
  contarAnomalias,
} from "./contactos-xlsx.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Fixture: un .xlsx armado en memoria ─────────────────────────────────────

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** ZIP mínimo. `metodo` 0 = stored, 8 = deflate. */
function zip(archivos, metodo = 8) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido, "utf8");
    const comp = metodo === 8 ? deflateRawSync(datos) : datos;
    const n = Buffer.from(nombre, "utf8");
    const crc = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(n.length, 26);
    locales.push(local, n, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, n);

    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrales);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(archivos).length, 8);
  eocd.writeUInt16LE(Object.keys(archivos).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, cd, eocd]);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const celda = (ref, valor) =>
  valor === undefined || valor === ""
    ? `<c r="${ref}" s="1" t="inlineStr"></c>`
    : `<c r="${ref}" s="1" t="inlineStr"><is><t>${esc(valor)}</t></is></c>`;

/** Una fila de datos (12 columnas A–L) a partir de un objeto por encabezado. */
function filaXml(n, valores) {
  return `<row r="${n}">${"ABCDEFGHIJKL"
    .split("")
    .map((col, i) => celda(`${col}${n}`, valores[ENCABEZADOS[i]]))
    .join("")}</row>`;
}

function persona(cambios = {}) {
  return {
    "Asegurado": "PRUEBA INVENTADA UNO",
    "Cond. IVA": "CF",
    "Dirección": "CALLE FALSA N° 123",
    "Localidad": "LOCALIDAD FICTICIA",
    "Cód. Postal": "1000",
    "Tipo Doc.": "DNI",
    "Nro. Documento": "10000001",
    "CUIT / CUIL": "20100000011",
    "Teléfono": "000-0000",
    "Email": "Uno@Ejemplo.Invalid",
    "Faltan datos obligatorios": "",
    "Observaciones": "",
    ...cambios,
  };
}

/** XML de una hoja con título, nota, encabezado y las personas dadas. */
function hojaXml({ titulo = "Asegurados con pólizas vigentes – Productor 11111 – Productor Ficticio", encabezados = ENCABEZADOS, personas = [persona()], extraFilas = "" } = {}) {
  const enc = `<row r="3">${"ABCDEFGHIJKL".split("").map((c, i) => celda(`${c}3`, encabezados[i])).join("")}</row>`;
  const datos = personas.map((p, i) => filaXml(4 + i, p)).join("");
  return (
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    `<row r="1">${celda("A1", titulo)}</row><row r="2">${celda("A2", "nota")}</row>${enc}${datos}${extraFilas}` +
    `</sheetData></worksheet>`
  );
}

/**
 * Un libro con N hojas. Las rutas de las hojas son deliberadamente RARAS
 * (`hojas/datos-<k>.xml`) para probar que se resuelven por las relaciones.
 */
function libro(hojas, { metodo = 8, extra = {} } = {}) {
  const sheets = hojas.map((h, k) => `<sheet name="${esc(h.nombre)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join("");
  const rels = hojas
    .map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/hojas/datos-${k + 1}.xml"/>`)
    .join("");
  const archivos = {
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships>${rels}</Relationships>`,
    ...extra,
  };
  hojas.forEach((h, k) => (archivos[`xl/hojas/datos-${k + 1}.xml`] = h.xml));
  return zip(archivos, metodo);
}

const DOS_HOJAS = [
  { nombre: "Productor 11111", xml: hojaXml() },
  {
    nombre: "Productor 22222",
    xml: hojaXml({
      titulo: "Asegurados con pólizas vigentes – Productor 22222 – Otra Organización S.A.",
      personas: [persona({ "Asegurado": "PRUEBA INVENTADA DOS", "CUIT / CUIL": "20200000022", "Nro. Documento": "20000002" })],
    }),
  },
];

const contactosDe = (buf) => aContactos(validarLibro(leerXlsx(buf)), normalizeEmail);

// ── 1. Lector ───────────────────────────────────────────────────────────────

test("lee un libro sintético de 2 hojas, con sus nombres y en orden", () => {
  const l = leerXlsx(libro(DOS_HOJAS));
  assert.deepEqual(l.map((h) => h.hoja), ["Productor 11111", "Productor 22222"]);
  assert.equal(l[0].filas.find((f) => f.fila === 4).celdas.A, "PRUEBA INVENTADA UNO");
  assert.equal(l[1].filas.find((f) => f.fila === 4).celdas.H, "20200000022");
});

test("CONTROL: la versión sin comprimir da exactamente lo mismo que la deflate", () => {
  assert.deepEqual(leerXlsx(libro(DOS_HOJAS, { metodo: 0 })), leerXlsx(libro(DOS_HOJAS, { metodo: 8 })));
});

test("la hoja se resuelve por workbook.xml.rels aunque no se llame sheetN.xml", () => {
  // `libro()` guarda las hojas en xl/hojas/datos-N.xml: si el lector supusiera
  // xl/worksheets/sheetN.xml, ni siquiera encontraría el archivo.
  assert.equal(leerXlsx(libro(DOS_HOJAS)).length, 2);
});

test("rechaza un libro con sharedStrings", () => {
  assert.throws(() => leerXlsx(libro(DOS_HOJAS, { extra: { "xl/sharedStrings.xml": "<sst/>" } })), (e) => e instanceof ErrorXlsx && /sharedStrings/.test(e.message));
});

test("rechaza una celda que no es inlineStr", () => {
  const xml = hojaXml().replace('<c r="A4" s="1" t="inlineStr">', '<c r="A4" s="1" t="str">');
  assert.throws(() => leerXlsx(libro([{ nombre: "x", xml }])), (e) => e instanceof ErrorXlsx && /A4.*inlineStr/.test(e.message));
});

test("rechaza una fórmula", () => {
  const xml = hojaXml().replace("</sheetData>", '<row r="99"><c r="A99" t="inlineStr"><f>1+1</f><is><t>2</t></is></c></row></sheetData>');
  assert.throws(() => leerXlsx(libro([{ nombre: "x", xml }])), (e) => e instanceof ErrorXlsx && /fórmulas/.test(e.message));
});

test("ubica cada celda por su referencia aunque falten las intermedias", () => {
  const fila = `<row r="9"><c r="A9" t="inlineStr"><is><t>NOMBRE</t></is></c><c r="H9" t="inlineStr"><is><t>20000000001</t></is></c></row>`;
  const xml = hojaXml().replace("</sheetData>", `${fila}</sheetData>`);
  const f = leerXlsx(libro([{ nombre: "x", xml }]))[0].filas.find((x) => x.fila === 9);
  assert.deepEqual(f.celdas, { A: "NOMBRE", H: "20000000001" });
});

test("concatena los runs con formato y decodifica las entidades", () => {
  const fila = `<row r="9"><c r="A9" t="inlineStr"><is><r><t>PÉREZ &amp; </t></r><r><t>HIJ&#79;S &#x2013; N&#176;</t></r></is></c></row>`;
  const xml = hojaXml().replace("</sheetData>", `${fila}</sheetData>`);
  const f = leerXlsx(libro([{ nombre: "x", xml }]))[0].filas.find((x) => x.fila === 9);
  assert.equal(f.celdas.A, "PÉREZ & HIJOS – N°");
});

test("decodificarEntidades: una entidad desconocida aborta en vez de quedar literal", () => {
  assert.equal(decodificarEntidades("&lt;a&gt; &quot;b&quot; &apos;c&apos;"), `<a> "b" 'c'`);
  assert.throws(() => decodificarEntidades("&nbsp;"), ErrorXlsx);
});

// ── 2. Validación del libro ─────────────────────────────────────────────────

test("CONTROL: el libro sintético válido NO aborta", () => {
  assert.equal(contactosDe(libro(DOS_HOJAS)).length, 2);
});

test("encabezado distinto → aborta", () => {
  const enc = [...ENCABEZADOS];
  enc[7] = "CUIT";
  assert.throws(() => contactosDe(libro([{ nombre: "x", xml: hojaXml({ encabezados: enc }) }])), (e) => e instanceof ErrorContactos && /encabezados/.test(e.message));
});

test("título sin 'Productor <n> – <nombre>' → aborta", () => {
  assert.throws(() => contactosDe(libro([{ nombre: "x", xml: hojaXml({ titulo: "Asegurados varios" }) }])), (e) => e instanceof ErrorContactos && /título/.test(e.message));
});

test("CUIT de 10 dígitos → aborta nombrando hoja y fila", () => {
  const xml = hojaXml({ personas: [persona(), persona({ "Asegurado": "OTRA", "CUIT / CUIL": "2010000001" })] });
  assert.throws(() => contactosDe(libro([{ nombre: "Hoja X", xml }])), (e) => e instanceof ErrorContactos && /hoja "Hoja X", fila 5.*CUIT/.test(e.message));
});

test("falta el nombre → aborta", () => {
  assert.throws(() => contactosDe(libro([{ nombre: "x", xml: hojaXml({ personas: [persona({ "Asegurado": "" })] }) }])), (e) => e instanceof ErrorContactos && /nombre/.test(e.message));
});

test("documento no numérico y 'Faltan datos' distinto de Sí → abortan", () => {
  assert.throws(() => contactosDe(libro([{ nombre: "x", xml: hojaXml({ personas: [persona({ "Nro. Documento": "10.000.001" })] }) }])), ErrorContactos);
  assert.throws(() => contactosDe(libro([{ nombre: "x", xml: hojaXml({ personas: [persona({ "Faltan datos obligatorios": "No" })] }) }])), ErrorContactos);
});

test("datos fuera de las columnas A–L → aborta", () => {
  const xml = hojaXml().replace('</row><row r="4">', '</row><row r="4"><c r="M4" t="inlineStr"><is><t>x</t></is></c>');
  // la celda M4 queda al principio de la fila 4: igual se ubica por referencia
  assert.throws(() => contactosDe(libro([{ nombre: "x", xml }])), (e) => e instanceof ErrorContactos && /A–L/.test(e.message));
});

// ── 3. Clave, fusión y marcas ───────────────────────────────────────────────

const unaHoja = (personas) => libro([{ nombre: "x", xml: hojaXml({ personas }) }]);

test("mismo CUIT y mismo nombre → un contacto, la 2ª fila en alternativos", () => {
  const cs = contactosDe(unaHoja([persona(), persona({ "Teléfono": "111-1111", "Dirección": "OTRA CALLE 1" })]));
  assert.equal(cs.length, 1);
  assert.equal(cs[0].telefono, "000-0000");
  assert.equal(cs[0].alternativos.length, 1);
  assert.equal(cs[0].alternativos[0].telefono, "111-1111");
  assert.equal(cs[0].alternativos[0].direccion, "OTRA CALLE 1");
});

test("CONTROL: mismo CUIT con otro nombre → 2 contactos, los dos CUIT_COMPARTIDO", () => {
  const cs = contactosDe(unaHoja([persona(), persona({ "Asegurado": "PRUEBA INVENTADA DISTINTA" })]));
  assert.equal(cs.length, 2);
  for (const c of cs) assert.deepEqual(c.marcas, [MARCAS.CUIT_COMPARTIDO]);
  for (const c of cs) assert.equal(c.aVerificar, true);
});

test("sin CUIT pero con documento → clave D: y marca SIN_CUIT", () => {
  const [c] = contactosDe(unaHoja([persona({ "CUIT / CUIL": "" })]));
  assert.equal(c.clave, "D:DNI10000001|PRUEBA INVENTADA UNO");
  assert.deepEqual(c.marcas, [MARCAS.SIN_CUIT]);
  assert.equal(c.cuit, undefined);
});

test("sin CUIT ni documento → clave N: y marcas SIN_CUIT + SIN_IDENTIFICADOR", () => {
  const [c] = contactosDe(unaHoja([persona({ "CUIT / CUIL": "", "Nro. Documento": "", "Tipo Doc.": "" })]));
  assert.equal(c.clave, "N:PRUEBA INVENTADA UNO");
  assert.deepEqual(c.marcas, [MARCAS.SIN_CUIT, MARCAS.SIN_IDENTIFICADOR]);
});

test("nombres con otros espacios o mayúsculas → la misma clave", () => {
  assert.equal(normalizarNombre("  Prueba   inventada uno "), "PRUEBA INVENTADA UNO");
  const cs = contactosDe(unaHoja([persona(), persona({ "Asegurado": " prueba  Inventada UNO" })]));
  assert.equal(cs.length, 1);
});

test("C2: una anomalía SÓLO en la segunda fila igual deja el contacto A verificar", () => {
  const cs = contactosDe(unaHoja([persona(), persona({ "Observaciones": "nombre cortado en la foto (verificar)" })]));
  assert.equal(cs.length, 1);
  assert.equal(cs[0].observacion, undefined, "la principal no tiene observación");
  assert.equal(cs[0].aVerificar, true);
  assert.equal(cs[0].alternativos[0].observacion, "nombre cortado en la foto (verificar)");

  const [faltan] = contactosDe(unaHoja([persona(), persona({ "Faltan datos obligatorios": "Sí" })]));
  assert.equal(faltan.faltanDatosObligatorios, false);
  assert.equal(faltan.aVerificar, true);
});

test("C2 CONTROL: un contacto fusionado sin ninguna anomalía NO queda A verificar", () => {
  const [c] = contactosDe(unaHoja([persona(), persona({ "Teléfono": "111-1111" })]));
  assert.equal(c.aVerificar, false);
  assert.deepEqual(c.marcas, []);
});

test("la misma persona en dos productores → aborta (no se elige productor en silencio)", () => {
  const otra = hojaXml({ titulo: "Asegurados con pólizas vigentes – Productor 22222 – Otro" });
  assert.throws(() => contactosDe(libro([{ nombre: "a", xml: hojaXml() }, { nombre: "b", xml: otra }])), (e) => e instanceof ErrorContactos && /otro productor/.test(e.message));
});

test("productor y nombre del productor salen del título de cada hoja", () => {
  const cs = contactosDe(libro(DOS_HOJAS));
  assert.deepEqual(cs.map((c) => [c.productor, c.productorNombre]), [["11111", "Productor Ficticio"], ["22222", "Otra Organización S.A."]]);
});

test("email normalizado y vacíos fuera del objeto; sin alternativos ⇒ campo AUSENTE (no [])", () => {
  const [c] = contactosDe(unaHoja([persona({ "Teléfono": "" })]));
  assert.equal(c.email, "uno@ejemplo.invalid");
  assert.ok(!("telefono" in c));
  // C4: ausente, para que el patch del re-import BORRE alternativos viejos.
  assert.ok(!("alternativos" in c));
});

test("contarAnomalias separa conteos de filas y de contactos", () => {
  const filas = validarLibro(
    leerXlsx(unaHoja([persona({ "Observaciones": "x" }), persona({ "Observaciones": "y", "Faltan datos obligatorios": "Sí" }), persona({ "Asegurado": "OTRO", "CUIT / CUIL": "", "Nro. Documento": "" })])),
  );
  const cs = aContactos(filas, normalizeEmail);
  assert.deepEqual(contarAnomalias(filas, cs), {
    filas: 3,
    filasFaltanDatos: 1,
    filasConObservacion: 2,
    contactos: 2,
    fusionados: 1,
    sinCuit: 1,
    sinIdentificador: 1,
    cuitCompartido: 0,
    aVerificar: 2,
  });
});

test("claveDe: CUIT gana sobre documento", () => {
  assert.equal(claveDe({ cuit: "20000000001", numeroDocumento: "1", nombre: "a" }), "C:20000000001|A");
});

// ── 3b. Orden: los "(nombre no visible)" al final ──────────────────────────

test("esNombreNoVisible: las formas del archivo sí, un nombre normal no", () => {
  for (const n of ["(nombre no visible)", "… (nombre no visible)", "PEREZ … (nombre no visible)", "GOMEZ G… (Nombre No Visible)"]) {
    assert.equal(esNombreNoVisible(n), true, n);
  }
  // CONTROL: un nombre real, y uno que dice "no visible" sin el marcador.
  for (const n of ["PRUEBA INVENTADA UNO", "NOMBRE NO VISIBLE SRL"]) {
    assert.equal(esNombreNoVisible(n), false, n);
  }
});

test("los '(nombre no visible)' van AL FINAL; el resto, alfabético", () => {
  const nombres = ["ZETA", "(nombre no visible)", "ALFA", "… (nombre no visible)", "BETA … (nombre no visible)", "MEDIO"];
  assert.deepEqual([...nombres].sort(compararNombresContacto), [
    "ALFA",
    "MEDIO",
    "ZETA",
    "(nombre no visible)",
    "BETA … (nombre no visible)",
    "… (nombre no visible)",
  ]);
  // CONTROL: el orden alfabético puro los pone PRIMERO (el bug que se arregla).
  assert.equal([...nombres].sort()[0], "(nombre no visible)");
});

test("listar ordena con compararNombresContacto, no con un sort propio", () => {
  const fuente = readFileSync(join(RAIZ, "convex/contactos.ts"), "utf8");
  const ini = fuente.indexOf("export const listar = ");
  const cuerpo = fuente.slice(ini, fuente.indexOf("\n});", ini));
  assert.match(cuerpo, /contactos\.sort\(\(a, b\) => compararNombresContacto\(a\.nombre, b\.nombre\)\)/);
});

// ── 4. Guards estáticos sobre convex/contactos.ts ──────────────────────────

const FUENTE = readFileSync(join(RAIZ, "convex/contactos.ts"), "utf8");
const SCHEMA = readFileSync(join(RAIZ, "convex/schema.ts"), "utf8");

function cuerpoDe(nombre) {
  const inicio = FUENTE.indexOf(`export const ${nombre} = `);
  assert.ok(inicio >= 0, `no encontré ${nombre} en convex/contactos.ts`);
  return FUENTE.slice(inicio, FUENTE.indexOf("\n});", inicio));
}

test("las TRES mutations de carga llaman a exigirImportHabilitado", () => {
  for (const m of ["abrirImport", "upsertLote", "cerrarImport"]) {
    assert.match(cuerpoDe(m), /exigirImportHabilitado\(\)/, `${m} escribe sin chequear la habilitación`);
  }
});

test("CONTROL: cambiarEstado y las queries NO piden la habilitación", () => {
  for (const f of ["cambiarEstado", "listar", "estadoLista"]) {
    assert.doesNotMatch(cuerpoDe(f), /exigirImportHabilitado\(\)/);
  }
});

test("C5: las dos queries y cambiarEstado exigen sesión de agente", () => {
  for (const f of ["listar", "estadoLista", "cambiarEstado"]) {
    assert.match(cuerpoDe(f), /await exigirAgente\(ctx\)/, `${f} no exige agente`);
  }
  // CONTROL: las internas no (las corre el CLI, sin sesión).
  assert.doesNotMatch(cuerpoDe("upsertLote"), /exigirAgente/);
});

test("la habilitación es CONTACTOS_IMPORT_ENABLED, ni la de cartera ni DEPLOYMENT_ENV/SEED_ENABLED", () => {
  assert.match(FUENTE, /const VAR_HABILITACION = "CONTACTOS_IMPORT_ENABLED"/);
  // Sobre los USOS de process.env, no sobre el texto: la cabecera los nombra
  // para explicar por qué no se usan.
  assert.doesNotMatch(FUENTE, /process\.env\.(CARTERA_IMPORT_ENABLED|DEPLOYMENT_ENV|SEED_ENABLED)/);
  assert.doesNotMatch(FUENTE, /process\.env\[["'](CARTERA_IMPORT_ENABLED|DEPLOYMENT_ENV|SEED_ENABLED)/);
  assert.doesNotMatch(FUENTE, /"CARTERA_IMPORT_ENABLED"/);
});

/** Claves de un `v.object({...})` asignado a `const <nombre>` en un fuente. */
function clavesDe(fuente, re) {
  const m = re.exec(fuente);
  assert.ok(m, `no encontré ${re}`);
  return [...m[1].matchAll(/^\s{2}(\w+):/gm)].map((x) => x[1]).sort();
}
const clavesValidador = () => clavesDe(FUENTE, /const contactoValidator = v\.object\(\{([\s\S]*?)\n\}\);/);
const clavesAlternativo = () => clavesDe(FUENTE, /const alternativoValidator = v\.object\(\{([\s\S]*?)\n\}\);/);

/** Un contacto con TODOS los campos informados, fusionado y con marca. */
function contactoCompleto() {
  const [c] = contactosDe(
    unaHoja([
      persona({ "Observaciones": "obs", "Faltan datos obligatorios": "Sí" }),
      persona({ "Observaciones": "obs 2", "Faltan datos obligatorios": "Sí" }),
    ]),
  );
  return c;
}

test("C4: lo que manda el script es exactamente lo que acepta contactoValidator", () => {
  const c = contactoCompleto();
  assert.deepEqual(Object.keys(c).sort(), clavesValidador());
  assert.deepEqual(Object.keys(c.alternativos[0]).sort(), clavesAlternativo());
  for (const k of ["clave", "nombre", "productor", "productorNombre"]) assert.ok(clavesValidador().includes(k));
  assert.ok(!clavesValidador().includes("estado"), "el estado no viene del archivo");
});

test("C4: el schema de `contactos` tiene cada campo del validador, más estado e importId", () => {
  const inicio = SCHEMA.indexOf("  contactos: defineTable({");
  assert.ok(inicio >= 0);
  const tabla = SCHEMA.slice(inicio, SCHEMA.indexOf("\n  })", inicio));
  for (const k of [...clavesValidador(), "estado", "estadoActualizadoEn", "importId"]) {
    assert.match(tabla, new RegExp(`^\\s{4}${k}:`, "m"), `el schema no tiene ${k}`);
  }
  for (const k of clavesAlternativo()) assert.match(tabla, new RegExp(`^\\s{10}${k}:`, "m"), `alternativos del schema sin ${k}`);
});

test("C4: el patch del re-import reescribe TODOS los campos del archivo (vaciar ≠ conservar)", () => {
  const inicio = FUENTE.indexOf("await ctx.db.patch(id, {");
  assert.ok(inicio >= 0, "no encontré el patch de patchDelArchivo");
  const patch = FUENTE.slice(inicio, FUENTE.indexOf("});", inicio));
  for (const k of clavesValidador()) {
    assert.match(patch, new RegExp(`\\b${k}: contacto\\.${k}\\b`), `el patch no reescribe ${k}`);
  }
});

test("el patch del re-import NO toca estado ni estadoActualizadoEn; el insert sí pone 'pendiente'", () => {
  const inicio = FUENTE.indexOf("await ctx.db.patch(id, {");
  const patch = FUENTE.slice(inicio, FUENTE.indexOf("});", inicio));
  assert.doesNotMatch(patch, /\bestado/);
  // CONTROL: el mismo regex sí encuentra el estado en el insert.
  const insert = cuerpoDe("upsertLote").slice(cuerpoDe("upsertLote").indexOf('ctx.db.insert("contactos"'));
  assert.match(insert, /estado: "pendiente"/);
});

test("C4: listar proyecta los campos del validador (salvo la clave) más estado", () => {
  const cuerpo = cuerpoDe("listar");
  for (const k of [...clavesValidador().filter((k) => k !== "clave"), "estado", "estadoActualizadoEn"]) {
    assert.match(cuerpo, new RegExp(`\\b${k}: c\\.${k}\\b`), `listar no proyecta ${k}`);
  }
  assert.doesNotMatch(cuerpo, /\.\.\.c\b|importId: c\./);
});

test("C3: noVinieron se calcula contra las claves del archivo, no por importId, y sólo al cerrar completa", () => {
  const cuerpo = cuerpoDe("cerrarImport");
  assert.match(cuerpo, /new Set\(args\.claves\)/);
  assert.match(cuerpo, /!delArchivo\.has\(c\.clave\)/);
  assert.doesNotMatch(cuerpo, /c\.importId/);
  // La rama incompleta (el primer patch) no escribe noVinieron.
  const incompleta = cuerpo.slice(cuerpo.indexOf("const desvio"), cuerpo.indexOf("return { completado: false"));
  assert.doesNotMatch(incompleta, /noVinieron/);
});

test("cambiarEstado es idempotente: el mismo estado no escribe", () => {
  const cuerpo = cuerpoDe("cambiarEstado");
  const corte = cuerpo.indexOf("contacto.estado === args.estado");
  assert.ok(corte >= 0);
  assert.ok(corte < cuerpo.indexOf("ctx.db.patch"), "el chequeo tiene que ir antes del patch");
});

// ── 5. Navegación y privacidad ──────────────────────────────────────────────

test("RUTAS.agente.contactos existe y su página también", () => {
  const constantes = readFileSync(join(RAIZ, "src/lib/constants.ts"), "utf8");
  assert.match(constantes, /contactos: "\/agente\/contactos"/);
  assert.ok(existsSync(join(RAIZ, "src/app/(agente)/agente/contactos/page.tsx")));
});

test("C1: el .gitignore excluye los .xlsx de API_FEDPAT", () => {
  assert.match(readFileSync(join(RAIZ, ".gitignore"), "utf8"), /^\/API_FEDPAT\/\*\.xlsx$/m);
});
