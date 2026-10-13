/**
 * REC-164 · Import de contactos (prospectos) desde el Excel de los productores.
 *
 *   node scripts/importar-contactos.mjs --validar [archivo]
 *   node scripts/importar-contactos.mjs --simular [archivo] [--prod]
 *   node scripts/importar-contactos.mjs --aplicar [archivo] [--prod]
 *
 * `archivo` por defecto: `API_FEDPAT/Contactos_Asegurados_Sole.xlsx` (ignorado
 * por git: son datos personales de personas reales).
 *
 * Espejo de `importar-cartera.mjs`, ya auditado. Ver su cabecera para el
 * porqué de cada paso. En resumen:
 *
 *   --validar  100% local. Lee el Excel, valida el libro ENTERO, arma los
 *              contactos e imprime el resumen. No se conecta a nada.
 *   --simular  Abre una corrida SIMULACION y manda los lotes con dryRun: cuenta
 *              qué crearía y qué actualizaría sin escribir ningún contacto.
 *   --aplicar  La corrida real.
 *
 * ⚠️ DESTINO. Lo resuelve `convex-destino.mjs`, el mismo guard de cartera: sin
 * `--prod` va al deployment dev de `.env.local`, y aborta ante cualquier
 * variable que pudiera mandar el CLI a otro lado.
 *
 * ⚠️ HABILITACIÓN. `CONTACTOS_IMPORT_ENABLED=true` en el deployment, se setea
 * antes y se REMUEVE después (ver la cabecera de `convex/contactos.ts`).
 *
 * ⚠️ PRODUCCIÓN. Estas personas no dieron consentimiento para que el estudio
 * las contacte (Ley 25.326). `--prod` se corre sólo con el OK explícito del
 * usuario sobre ese punto.
 */

import { readFileSync, existsSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { normalizeEmail } from "../convex/lib.ts";
import { leerXlsx, ErrorXlsx } from "./xlsx-mini.mjs";
import { validarLibro, aContactos, contarAnomalias, porProductor, ErrorContactos } from "./contactos-xlsx.mjs";
import { enLotes } from "./cartera-csv.mjs";
import { resolverDestino, ErrorDestino } from "./convex-destino.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVO_DEFAULT = join(RAIZ, "API_FEDPAT", "Contactos_Asegurados_Sole.xlsx");

/** 100 contactos por lote son ~50 KB de JSON por argv: holgado. */
const TAMANO_LOTE = 100;

const MODOS = ["--validar", "--simular", "--aplicar"];

function uso(mensaje) {
  if (mensaje) console.error(`✗ ${mensaje}\n`);
  console.error(
    "Uso: node scripts/importar-contactos.mjs (--validar | --simular | --aplicar) [archivo.xlsx] [--prod]",
  );
  process.exit(2);
}

// ── Argumentos ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const modos = argv.filter((a) => MODOS.includes(a));
if (modos.length !== 1) uso(modos.length === 0 ? "falta el modo" : "un solo modo por corrida");
const modo = modos[0];
const prod = argv.includes("--prod");
const desconocidos = argv.filter((a) => a.startsWith("--") && !MODOS.includes(a) && a !== "--prod");
if (desconocidos.length) uso(`flag desconocido: ${desconocidos.join(" ")}`);
const posicionales = argv.filter((a) => !a.startsWith("--"));
if (posicionales.length > 1) uso("un solo archivo");
const archivo = posicionales[0] ?? ARCHIVO_DEFAULT;
if (prod && modo === "--validar") uso("--validar no se conecta a nada: --prod no aplica");

// ── 1. Leer y validar el libro ENTERO (local) ───────────────────────────────

if (!existsSync(archivo)) uso(`no existe ${archivo}`);

let filas;
let contactos;
try {
  filas = validarLibro(leerXlsx(readFileSync(archivo)));
  contactos = aContactos(filas, normalizeEmail);
} catch (e) {
  if (e instanceof ErrorXlsx || e instanceof ErrorContactos) {
    console.error(`✗ El archivo no es cargable — no se escribió nada.\n  ${e.message}`);
    process.exit(1);
  }
  throw e;
}

const anomalias = contarAnomalias(filas, contactos);
const lotes = enLotes(contactos, TAMANO_LOTE);

// Sólo conteos: nunca se imprime una fila (son datos personales).
console.log(`Archivo: ${archivo}`);
console.log(`  ✓ ${anomalias.filas} filas válidas → ${anomalias.contactos} contactos`);
for (const [p, n] of Object.entries(porProductor(contactos))) console.log(`      productor ${p}: ${n}`);
console.log("  · marcas (se importan igual):");
console.log(`      fusionados (una persona, varias filas) ... ${anomalias.fusionados}`);
console.log(`      sin CUIT ................................. ${anomalias.sinCuit}`);
console.log(`      sin ningún identificador ................. ${anomalias.sinIdentificador}`);
console.log(`      CUIT compartido con otro nombre .......... ${anomalias.cuitCompartido}`);
console.log(`      filas con "faltan datos obligatorios" .... ${anomalias.filasFaltanDatos}`);
console.log(`      filas con observación .................... ${anomalias.filasConObservacion}`);
console.log(`      contactos "A verificar" .................. ${anomalias.aVerificar}`);
console.log(`  · ${lotes.length} lotes de hasta ${TAMANO_LOTE}`);

if (modo === "--validar") {
  console.log("\n--validar: no se conectó a ningún deployment. Nada escrito.");
  process.exit(0);
}

// ── 2. Destino ──────────────────────────────────────────────────────────────

const leerSiExiste = (rel) => {
  const p = join(RAIZ, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
let destino;
try {
  destino = resolverDestino({
    prod,
    entorno: process.env,
    archivos: { envLocal: leerSiExiste(".env.local"), env: leerSiExiste(".env") },
  });
} catch (e) {
  if (e instanceof ErrorDestino) {
    console.error(`\n✗ Destino inseguro — no se abrió ninguna corrida.\n  ${e.message}`);
    process.exit(1);
  }
  throw e;
}

const real = modo === "--aplicar";
console.log(`\nDestino: ${destino.anuncio}`);
console.log(`Modo:    ${real ? "REAL — escribe contactos" : "SIMULACION — no escribe contactos"}\n`);

// ── 3. Llamados a Convex ────────────────────────────────────────────────────

/** Sin shell, destino explícito, entorno del hijo saneado. Ver importar-cartera. */
function convexRun(fn, args) {
  const cli = ["convex", "run", fn, JSON.stringify(args), ...destino.flags];
  const out = execFileSync("npx", cli, {
    cwd: RAIZ,
    env: destino.entornoHijo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
  const texto = out.trim();
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`respuesta no-JSON de ${fn}: ${texto.slice(0, 300)}`);
  }
}

const importId = convexRun("contactos:abrirImport", {
  archivo: basename(archivo),
  modo: real ? "REAL" : "SIMULACION",
  filasEsperadas: contactos.length,
  anomalias,
});
console.log(`Corrida abierta: ${importId}`);

let creadas = 0;
let actualizadas = 0;
for (const [k, lote] of lotes.entries()) {
  const r = convexRun("contactos:upsertLote", { importId, contactos: lote, dryRun: !real });
  creadas += r.creadas;
  actualizadas += r.actualizadas;
  console.log(
    `  lote ${String(k + 1).padStart(2)}/${lotes.length}: ` +
      `+${r.creadas} nuevos, ${r.actualizadas} actualizados` +
      (real ? "" : " (simulado)"),
  );
}

const cierre = convexRun("contactos:cerrarImport", {
  importId,
  claves: contactos.map((c) => c.clave),
});

console.log(
  `\n${real ? "Escritos" : "Se escribirían"}: ${creadas} nuevos + ${actualizadas} actualizados = ` +
    `${creadas + actualizadas} de ${contactos.length}`,
);
if (cierre.completado) {
  console.log(`✓ Corrida ${real ? "REAL" : "SIMULACION"} cerrada como COMPLETA.`);
  console.log(
    `  ${cierre.noVinieron} contactos de la base no vinieron en este archivo` +
      (cierre.noVinieron ? " (no se borraron: conservan su estado)." : "."),
  );
} else {
  console.error(`✗ La corrida quedó INCOMPLETA: ${cierre.desvio}`);
  process.exit(1);
}
console.log("\nRecordá remover la habilitación:  npx convex env remove CONTACTOS_IMPORT_ENABLED" + (prod ? " --prod" : ""));
