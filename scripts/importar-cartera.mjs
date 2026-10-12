/**
 * REC-163 · Import de la cartera de FedPat desde el export CSV.
 *
 *   node scripts/importar-cartera.mjs --validar [archivo]
 *   node scripts/importar-cartera.mjs --simular [archivo] [--prod]
 *   node scripts/importar-cartera.mjs --aplicar [archivo] [--prod]
 *
 * `archivo` por defecto: `API_FEDPAT/export.csv` (ignorado por git: son datos
 * personales de personas reales).
 *
 * Los tres modos (C3 de la auditoría) son pasos DISTINTOS:
 *
 *   --validar  100% local. Parsea, chequea header, 19 campos y matrículas,
 *              cuenta anomalías e imprime el resumen. NO se conecta a ningún
 *              deployment. Es lo primero que se corre y donde corta un
 *              archivo malo.
 *   --simular  Contra un deployment. Abre una corrida `SIMULACION` y manda los
 *              lotes con `dryRun: true`: cuenta qué crearía y qué actualizaría
 *              sin escribir ningún cliente. Deja su fila en `carteraImports`,
 *              que el cartel de la pantalla nunca muestra.
 *   --aplicar  La corrida real.
 *
 * Sin modo no hace nada: una carga de 1.471 personas no se dispara por omitir
 * un argumento (mismo criterio que el `dryRun` sin default de `limpieza.ts`).
 *
 * ⚠️ DESTINO. Sin `--prod`, escribe en el deployment dev de `CONVEX_DEPLOYMENT`
 * de `.env.local`, pasado al CLI como `--deployment <nombre>`. Con `--prod`,
 * en producción: sólo con OK explícito. Aborta antes de abrir la corrida si
 * hay cualquier variable (deploy key, self-hosted, un `CONVEX_DEPLOYMENT`
 * distinto en el entorno) que pudiera mandar el CLI a otro lado — ver
 * `convex-destino.mjs`. El destino se imprime ANTES de escribir.
 *
 * ⚠️ HABILITACIÓN. Las mutations rechazan todo si el deployment no tiene
 * `CARTERA_IMPORT_ENABLED=true` (ver la cabecera de `convex/cartera.ts`, y por
 * qué NO es `DEPLOYMENT_ENV`). Se setea antes, y se REMUEVE después:
 *
 *   npx convex env set    CARTERA_IMPORT_ENABLED true
 *   node scripts/importar-cartera.mjs --simular
 *   node scripts/importar-cartera.mjs --aplicar
 *   npx convex env remove CARTERA_IMPORT_ENABLED
 *
 * El archivo se valida ENTERO antes del primer lote (C4): si el lote 1 entrara
 * y el 4 fallara por algo detectable de antemano, quedaría una carga parcial
 * evitable. Si la corrida se corta a la mitad igual (red, Ctrl-C), queda sin
 * `completadoEn` y la pantalla la muestra como carga incompleta; se arregla
 * re-corriendo `--aplicar`, que es idempotente (upsert por matrícula).
 */

import { readFileSync, existsSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { normalizeEmail, esEmailValido } from "../convex/lib.ts";
import {
  parsearCsv,
  validarRegistros,
  aFilaCartera,
  contarAnomalias,
  enLotes,
  ErrorCsv,
} from "./cartera-csv.mjs";
import { resolverDestino, ErrorDestino } from "./convex-destino.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVO_DEFAULT = join(RAIZ, "API_FEDPAT", "export.csv");

/**
 * 100 filas por lote. `npx convex run` toma los args SÓLO por argv (no hay
 * `--args-file` ni stdin), y 100 filas son ~30 KB de JSON: lejos del límite de
 * argv y de los de escritura de una mutation (100 lecturas por índice + 100
 * escrituras).
 */
const TAMANO_LOTE = 100;

const MODOS = ["--validar", "--simular", "--aplicar"];

function uso(mensaje) {
  if (mensaje) console.error(`✗ ${mensaje}\n`);
  console.error(
    "Uso: node scripts/importar-cartera.mjs (--validar | --simular | --aplicar) [archivo.csv] [--prod]",
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

// ── 1. Leer, parsear y validar el archivo ENTERO (local) ────────────────────

if (!existsSync(archivo)) uso(`no existe ${archivo}`);

let filas;
try {
  const registros = parsearCsv(readFileSync(archivo, "utf8"));
  const validadas = validarRegistros(registros);
  filas = validadas.map((r) => aFilaCartera(r, normalizeEmail));
} catch (e) {
  if (e instanceof ErrorCsv) {
    console.error(`✗ El archivo no es cargable — no se escribió nada.\n  ${e.message}`);
    process.exit(1);
  }
  throw e;
}

const { guardadas: anomalias, signoResidual } = contarAnomalias(filas, esEmailValido);
const tiposDoc = {};
for (const f of filas) if (f.tipoDocumento) tiposDoc[f.tipoDocumento] = (tiposDoc[f.tipoDocumento] ?? 0) + 1;
const lotes = enLotes(filas, TAMANO_LOTE);

console.log(`Archivo: ${archivo}`);
console.log(`  ✓ encabezados: las ${19} columnas esperadas, en orden`);
console.log(`  ✓ ${filas.length} filas, 19 campos en todas, matrículas únicas y no vacías`);
console.log(`  · tipos de documento: ${JSON.stringify(tiposDoc)}`);
console.log("  · anomalías (se importan igual):");
console.log(`      sin email válido ........ ${anomalias.sinEmail}`);
console.log(`      emails repetidos ........ ${anomalias.emailDuplicado} valores`);
console.log(`      sin dirección ........... ${anomalias.sinDireccion}`);
console.log(`      sin documento ........... ${anomalias.sinDocumento}`);
console.log(`      "¿" que quedó sin normalizar (no venía después de una N): ${signoResidual}`);
console.log(`  · ${lotes.length} lotes de hasta ${TAMANO_LOTE}`);

if (modo === "--validar") {
  console.log("\n--validar: no se conectó a ningún deployment. Nada escrito.");
  process.exit(0);
}

// ── 2. Destino ──────────────────────────────────────────────────────────────

// Se resuelve ANTES de abrir la corrida y rechaza cualquier configuración en
// la que el CLI pudiera elegir otro deployment que el anunciado (M1). Ver la
// cabecera de `convex-destino.mjs`.
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
console.log(`Modo:    ${real ? "REAL — escribe clientes" : "SIMULACION — no escribe clientes"}\n`);

// ── 3. Llamados a Convex ────────────────────────────────────────────────────

/**
 * `npx convex run <fn> <json> <destino explícito>`. `execFileSync` con array:
 * sin shell, así que ningún nombre o dirección del CSV se interpreta como
 * comando.
 *
 * El destino va SIEMPRE explícito (`--deployment <nombre>` o `--prod`) y el
 * hijo corre sin las variables que podrían pisarlo (`destino.entornoHijo`).
 *
 * El CLI imprime el valor de retorno como JSON en stdout.
 */
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

const importId = convexRun("cartera:abrirImport", {
  archivo: basename(archivo),
  modo: real ? "REAL" : "SIMULACION",
  filasEsperadas: filas.length,
});
console.log(`Corrida abierta: ${importId}`);

let creadas = 0;
let actualizadas = 0;
for (const [k, lote] of lotes.entries()) {
  const r = convexRun("cartera:upsertLote", { importId, filas: lote, dryRun: !real });
  creadas += r.creadas;
  actualizadas += r.actualizadas;
  console.log(
    `  lote ${String(k + 1).padStart(2)}/${lotes.length}: ` +
      `+${r.creadas} nuevas, ${r.actualizadas} actualizadas` +
      (real ? "" : " (simulado)"),
  );
}

const cierre = convexRun("cartera:cerrarImport", { importId, anomalias });

console.log(
  `\n${real ? "Escritas" : "Se escribirían"}: ${creadas} nuevas + ${actualizadas} actualizadas = ` +
    `${creadas + actualizadas} de ${filas.length}`,
);
if (cierre.completado) {
  console.log(`✓ Corrida ${real ? "REAL" : "SIMULACION"} cerrada como COMPLETA.`);
} else {
  console.error(`✗ La corrida quedó INCOMPLETA: ${cierre.desvio}`);
  process.exit(1);
}
console.log("\nRecordá remover la habilitación:  npx convex env remove CARTERA_IMPORT_ENABLED" + (prod ? " --prod" : ""));
