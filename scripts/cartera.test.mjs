/**
 * REC-163 / REC-160 · Las reglas del import de cartera que fallan EN SILENCIO.
 *
 *  1. El parser. El export escapa comillas con `\"` (no es RFC 4180). Un parser
 *     estándar no tira error: parte la fila en 21 campos, corre las columnas y
 *     guarda la localidad en el documento. Por eso el guard tiene CONTROL: un
 *     parse RFC 4180 del mismo texto tiene que dar ≠ 19, o el test no está
 *     probando nada.
 *  2. Las validaciones de C4 (header, 19 campos, matrícula), que tienen que
 *     ABORTAR, no "arreglarse".
 *  3. `N¿` → `N°` y la partición de `Documento`.
 *  4. Guards estáticos sobre `convex/cartera.ts`: las TRES mutations exigen la
 *     habilitación (C2) y el validador de Convex acepta exactamente lo que el
 *     script manda.
 *
 * ⚠️ FIXTURE SINTÉTICA. Personas inventadas, matrículas y documentos falsos.
 * Nunca se copian filas del CSV real a un archivo versionado: son datos
 * personales de personas que no son usuarias de Amparo.
 *
 * Cada guard lleva su control, la convención de `rutas.test.mjs`: un guard que
 * se compara consigo mismo pasa siempre.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeEmail, esEmailValido } from "../convex/lib.ts";
import {
  resolverDestino,
  ErrorDestino,
  VARIABLES_QUE_ELIGEN_DESTINO,
  parsearEnv,
} from "./convex-destino.mjs";
import {
  ENCABEZADOS,
  ErrorCsv,
  parsearCsv,
  validarRegistros,
  normalizarDireccion,
  partirDocumento,
  aFilaCartera,
  contarAnomalias,
  enLotes,
} from "./cartera-csv.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Fixture sintética ───────────────────────────────────────────────────────

const HEADER = ENCABEZADOS.join(",");

/** Fila de 19 campos con datos inventados; `cambios` pisa por encabezado. */
function fila(cambios = {}) {
  const base = {
    "Matrícula": "M-0000001",
    "Tipo": "Persona Física",
    "Apellido y Nombre": "PRUEBA INVENTADA UNO",
    "Garantiza Cobertura": "N",
    "Sexo": "Femenino",
    "IVA": "CONSUMIDOR FINAL",
    "Fecha Nac.": "1990-01-01",
    "Lugar Nacimiento": "CIUDAD FICTICIA",
    "Estado Civil": "SOLTERO",
    "Nacionalidad": "ARGENTINA",
    "Dirección": "CALLE FALSA N¿ 123",
    "CP": "1000",
    "CPA": "C1000AAA",
    "Localidad": "LOCALIDAD FICTICIA",
    "Documento": "DNI 00000001",
    "Teléfono": "000-0000-0000",
    "CUIT/CUIL/CDI": "20000000019",
    "E-mail": "Uno@Ejemplo.Invalid",
    "Cobrador": "1",
    ...cambios,
  };
  return ENCABEZADOS.map((h) => base[h]).join(",");
}

/**
 * La FORMA de la línea 821 del export real, con datos inventados: una
 * dirección citada con comillas escapadas por backslash y una coma adentro.
 */
const FILA_821 = fila({
  "Matrícula": "M-0000821",
  "Dirección": '"CASA 1, CALLE 2, SECTOR \\"J\\", TIRA 3, BARRIO N¿ 4"',
});

const csv = (...filas) => [HEADER, ...filas].join("\n") + "\n";

/**
 * Parser RFC 4180 de manual, con el comportamiento de una librería estándar
 * (p. ej. el `csv` de Python): una comilla sólo ABRE cita al principio del
 * campo; después de cerrarla, lo que sigue —incluida otra `"`— es literal.
 * Sólo existe como CONTROL: tiene que fallar sobre la forma de la línea 821.
 */
function parsearRfc4180(linea) {
  const campos = [];
  let campo = "";
  let citado = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (citado) {
      if (c === '"' && linea[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') citado = false;
      else campo += c;
    } else if (c === '"' && campo === "") citado = true;
    else if (c === ",") { campos.push(campo); campo = ""; }
    else campo += c;
  }
  campos.push(campo);
  return campos;
}

// ── 1. Parser ───────────────────────────────────────────────────────────────

test("la forma de la línea 821 da 19 campos y la dirección entera", () => {
  const [, r] = parsearCsv(csv(FILA_821));
  assert.equal(r.campos.length, 19);
  assert.equal(r.campos[ENCABEZADOS.indexOf("Dirección")], 'CASA 1, CALLE 2, SECTOR "J", TIRA 3, BARRIO N¿ 4');
  // Y la columna de al lado sigue siendo la que es: no se corrió nada.
  assert.equal(r.campos[ENCABEZADOS.indexOf("CP")], "1000");
});

test("CONTROL: un parser RFC 4180 sobre la misma fila NO da 19 campos", () => {
  // Si esto diera 19, la fixture dejó de reproducir el problema real y el
  // test de arriba pasaría por el motivo equivocado.
  // Con el export real da 21: la dirección se derrama dos columnas.
  assert.equal(parsearRfc4180(FILA_821).length, 21);
});

test("CRLF y archivo sin \\n final se leen igual", () => {
  const texto = [HEADER, fila()].join("\r\n");
  const regs = parsearCsv(texto);
  assert.equal(regs.length, 2);
  assert.equal(regs[1].campos.length, 19);
  assert.equal(regs[1].campos[18], "1"); // sin `\r` pegado al último campo
});

test("un BOM inicial no rompe el header", () => {
  assert.doesNotThrow(() => validarRegistros(parsearCsv("﻿" + csv(fila()))));
});

// ── 2. Validaciones que ABORTAN (C4) ────────────────────────────────────────

/** Valida el texto entero; devuelve el error o falla si no lanzó. */
function errorDe(texto) {
  try {
    validarRegistros(parsearCsv(texto));
  } catch (e) {
    assert.ok(e instanceof ErrorCsv, `lanzó algo que no es ErrorCsv: ${e}`);
    return e;
  }
  assert.fail("se esperaba que abortara y no abortó");
}

test("CONTROL: el archivo sintético válido NO aborta", () => {
  // Sin esto, los casos negativos de abajo podrían estar pasando porque la
  // fixture base ya es inválida.
  const v = validarRegistros(parsearCsv(csv(fila(), FILA_821)));
  assert.equal(v.length, 2);
});

test("encabezado cambiado → aborta", () => {
  const e = errorDe(csv(fila()).replace("Apellido y Nombre", "Nombre"));
  assert.equal(e.linea, 1);
});

test("comilla sin cerrar → aborta nombrando la línea", () => {
  const e = errorDe(csv(fila(), fila({ "Matrícula": "M-2", "Dirección": '"SIN CERRAR' })));
  assert.equal(e.linea, 3);
  assert.match(e.message, /comilla sin cerrar/);
});

test("comillas duplicadas estilo RFC 4180 → aborta, no adivina", () => {
  const e = errorDe(csv(fila({ "Dirección": '"EDIFICIO ""X"""' })));
  assert.equal(e.linea, 2);
});

test("M2: texto fuera de una cita cerrada tras un \\r suelto → aborta nombrando la línea", () => {
  // El caso que encontró la auditoría: antes se aceptaba cualquier `\r` como
  // terminador, el texto de afuera se pegaba al campo y la fila seguía teniendo
  // 19 campos — pasaba la validación con la dirección contaminada.
  const e = errorDe(csv(fila(), fila({ "Matrícula": "M-2", "Dirección": '"CALLE CORRECTA"\rTEXTO FUERA DE CITA' })));
  assert.equal(e.linea, 3);
  assert.match(e.message, /fuera de la cita/);
});

test("M2 CONTROL: la misma cita cerrada seguida de CRLF real SÍ es válida", () => {
  // Sin esto, el test de arriba podría pasar porque el parser rechaza
  // cualquier `\r` después de una cita — y un export con CRLF dejaría de leerse.
  const texto = [HEADER, fila({ "Dirección": '"CALLE CORRECTA"' }), fila({ "Matrícula": "M-2" })].join("\r\n");
  const v = validarRegistros(parsearCsv(texto));
  assert.equal(v.length, 2);
  assert.equal(v[0].fila["Dirección"], "CALLE CORRECTA");
});

test("una cita cerrada al final del archivo (sin terminador) es válida", () => {
  const ultima = ENCABEZADOS.map((h) => (h === "Matrícula" ? "M-9" : h === "Cobrador" ? '"7"' : "x")).join(",");
  const v = validarRegistros(parsearCsv(HEADER + "\n" + ultima));
  assert.equal(v[0].fila["Cobrador"], "7");
});

test("fila con campos de más → aborta nombrando la línea", () => {
  const e = errorDe(csv(fila(), fila({ "Matrícula": "M-2" }) + ",extra"));
  assert.equal(e.linea, 3);
  assert.match(e.message, /20 campos/);
});

test("fila con campos de menos → aborta", () => {
  const corta = fila({ "Matrícula": "M-2" }).split(",").slice(0, 18).join(",");
  assert.match(errorDe(csv(fila(), corta)).message, /18 campos/);
});

test("matrícula repetida → aborta, y dice dónde estaba la primera", () => {
  const e = errorDe(csv(fila(), fila()));
  assert.equal(e.linea, 3);
  assert.match(e.message, /línea 2/);
});

test("matrícula vacía → aborta", () => {
  errorDe(csv(fila({ "Matrícula": "  " })));
});

// ── 3. Normalización ────────────────────────────────────────────────────────

test("N¿ → N°", () => {
  const crudo = "AYACUCHO N¿ 1217";
  assert.ok(crudo.includes("¿"), "CONTROL: el input crudo tiene que traer el ¿");
  assert.equal(normalizarDireccion(crudo), "AYACUCHO N° 1217");
});

test("un ¿ que no sigue a una N se deja (no hay lectura obvia)", () => {
  assert.equal(normalizarDireccion("¿RARO?"), "¿RARO?");
});

test("Documento se parte en los cuatro tipos del archivo", () => {
  for (const tipo of ["DNI", "LE", "LC", "CI"]) {
    assert.deepEqual(partirDocumento(`${tipo} 01234567`, 1), {
      tipoDocumento: tipo,
      numeroDocumento: "01234567", // string: el cero a la izquierda sobrevive
    });
  }
});

test("Documento vacío ⇒ los dos ausentes; forma rara ⇒ aborta", () => {
  assert.deepEqual(partirDocumento("  ", 1), { tipoDocumento: undefined, numeroDocumento: undefined });
  assert.throws(() => partirDocumento("12345678", 7), /línea 7/);
});

test("aFilaCartera: 13 columnas, email normalizado, vacíos fuera del objeto", () => {
  const [v] = validarRegistros(parsearCsv(csv(fila({ "Teléfono": "", "CPA": "  " }))));
  const f = aFilaCartera(v, normalizeEmail);
  assert.equal(f.direccion, "CALLE FALSA N° 123");
  assert.equal(f.email, "uno@ejemplo.invalid");
  assert.equal(f.tipoDocumento, "DNI");
  assert.equal(f.numeroDocumento, "00000001");
  assert.ok(!("telefono" in f), "un campo vacío no viaja (ni como null)");
  assert.ok(!("cpa" in f), "sólo-espacios cuenta como vacío");
  // Las seis columnas omitidas no se cuelan con ningún nombre.
  for (const omitido of ["1990-01-01", "Femenino", "CIUDAD FICTICIA", "SOLTERO", "ARGENTINA"]) {
    assert.ok(!Object.values(f).includes(omitido), `se coló una columna omitida: ${omitido}`);
  }
});

test("contarAnomalias cuenta VALORES de email repetidos, no filas", () => {
  const filas = [
    { email: "a@x.com", direccion: "X", numeroDocumento: "1" },
    { email: "a@x.com", direccion: "X", numeroDocumento: "1" },
    { email: "a@x.com", direccion: undefined, numeroDocumento: undefined },
    { email: undefined, direccion: "X N¿", numeroDocumento: "1" },
  ];
  assert.deepEqual(contarAnomalias(filas, esEmailValido), {
    guardadas: { sinEmail: 1, emailDuplicado: 1, sinDireccion: 1, sinDocumento: 1 },
    signoResidual: 1,
  });
});

test("enLotes no pierde ni duplica filas", () => {
  const xs = Array.from({ length: 1471 }, (_, i) => i);
  const lotes = enLotes(xs, 100);
  assert.equal(lotes.length, 15);
  assert.equal(lotes.at(-1).length, 71);
  assert.deepEqual(lotes.flat(), xs);
});

// ── 4. Guards estáticos sobre convex/cartera.ts ─────────────────────────────

const FUENTE_CARTERA = readFileSync(join(RAIZ, "convex/cartera.ts"), "utf8");

/** El cuerpo de `export const <nombre> = internalMutation({ ... });`. */
function cuerpoDe(nombre) {
  const inicio = FUENTE_CARTERA.indexOf(`export const ${nombre} = `);
  assert.ok(inicio >= 0, `no encontré ${nombre} en convex/cartera.ts`);
  const fin = FUENTE_CARTERA.indexOf("\n});", inicio);
  return FUENTE_CARTERA.slice(inicio, fin);
}

const MUTATIONS = ["abrirImport", "upsertLote", "cerrarImport"];

test("C2: las TRES mutations llaman a exigirImportHabilitado", () => {
  for (const m of MUTATIONS) {
    assert.match(cuerpoDe(m), /exigirImportHabilitado\(\)/, `${m} escribe sin chequear la habilitación`);
  }
});

test("C2 CONTROL: las queries de lectura NO lo llaman (el guard distingue)", () => {
  // Si el regex matcheara cualquier cosa, también aparecería acá.
  for (const q of ["listar", "estadoCartera"]) {
    assert.doesNotMatch(cuerpoDe(q), /exigirImportHabilitado\(\)/);
  }
});

test("C2: la habilitación es CARTERA_IMPORT_ENABLED y no reusa DEPLOYMENT_ENV ni SEED_ENABLED", () => {
  assert.match(FUENTE_CARTERA, /const VAR_HABILITACION = "CARTERA_IMPORT_ENABLED"/);
  assert.doesNotMatch(FUENTE_CARTERA, /process\.env\.(DEPLOYMENT_ENV|SEED_ENABLED)/);
  assert.doesNotMatch(FUENTE_CARTERA, /process\.env\[["'](DEPLOYMENT_ENV|SEED_ENABLED)/);
});

/** Claves de `filaValidator` en convex/cartera.ts. */
function clavesDelValidador() {
  const m = /const filaValidator = v\.object\(\{([\s\S]*?)\}\);/.exec(FUENTE_CARTERA);
  assert.ok(m, "no encontré filaValidator");
  return [...m[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]).sort();
}

test("lo que manda el script es exactamente lo que acepta filaValidator", () => {
  // Con todas las columnas informadas, aFilaCartera produce todas sus claves.
  const [v] = validarRegistros(parsearCsv(csv(fila())));
  const claves = Object.keys(aFilaCartera(v, normalizeEmail)).sort();
  assert.deepEqual(claves, clavesDelValidador());
  assert.equal(claves.length, 14, "13 columnas, con Documento partido en dos");
});

test("patchCompleto reescribe TODOS los campos del validador (vaciar ≠ conservar)", () => {
  // Si alguien recorta el patch a "sólo los presentes", un teléfono que la
  // fuente vació quedaría vivo para siempre.
  const inicio = FUENTE_CARTERA.indexOf("await ctx.db.patch(id, {");
  assert.ok(inicio >= 0, "no encontré el patch de patchCompleto");
  const patch = FUENTE_CARTERA.slice(inicio, FUENTE_CARTERA.indexOf("});", inicio));
  for (const k of clavesDelValidador()) {
    assert.match(patch, new RegExp(`\\b${k}: fila\\.${k}\\b`), `patchCompleto no reescribe ${k}`);
  }
});

// ── 5. Destino del CLI (M1) ─────────────────────────────────────────────────

const ENV_LOCAL_DEV = "CONVEX_DEPLOYMENT=dev:perrito-inventado-123 # team: x, project: y\nNEXT_PUBLIC_CONVEX_URL=https://x\n";
const ARCHIVOS_DEV = { envLocal: ENV_LOCAL_DEV, env: null };

test("M1 CONTROL: config limpia en dev → destino explícito --deployment <nombre>", () => {
  // Sin este control, los rechazos de abajo podrían pasar porque la función
  // rechaza todo.
  const d = resolverDestino({ prod: false, entorno: { PATH: "/bin" }, archivos: ARCHIVOS_DEV });
  assert.deepEqual(d.flags, ["--deployment", "perrito-inventado-123"]);
  assert.match(d.anuncio, /^dev — perrito-inventado-123/);
  assert.equal(d.entornoHijo.PATH, "/bin", "el resto del entorno se conserva");
});

test("M1: con --prod el destino es --prod, explícito", () => {
  const d = resolverDestino({ prod: true, entorno: {}, archivos: ARCHIVOS_DEV });
  assert.deepEqual(d.flags, ["--prod"]);
  assert.match(d.anuncio, /PRODUCCIÓN/);
});

test("M1: el caso de la auditoría — .env.local en dev + CONVEX_DEPLOY_KEY heredada → rechaza", () => {
  assert.throws(
    () => resolverDestino({ prod: false, entorno: { CONVEX_DEPLOY_KEY: "prod:x|secreto" }, archivos: ARCHIVOS_DEV }),
    (e) => e instanceof ErrorDestino && /CONVEX_DEPLOY_KEY.*entorno del proceso/.test(e.message),
  );
});

test("M1: cualquier variable que elige destino, en cualquiera de las tres fuentes → rechaza", () => {
  for (const k of VARIABLES_QUE_ELIGEN_DESTINO) {
    const casos = [
      { entorno: { [k]: "valor" }, archivos: ARCHIVOS_DEV },
      { entorno: {}, archivos: { envLocal: ENV_LOCAL_DEV + `${k}=valor\n`, env: null } },
      { entorno: {}, archivos: { envLocal: ENV_LOCAL_DEV, env: `export ${k}="valor"\n` } },
      { entorno: {}, archivos: { envLocal: ENV_LOCAL_DEV, env: `${k}: valor\n` } },
    ];
    for (const c of casos) {
      assert.throws(() => resolverDestino({ prod: false, ...c }), ErrorDestino, `no rechazó ${k}`);
      // Y también con --prod: una deploy key de un deployment ignora --prod.
      assert.throws(() => resolverDestino({ prod: true, ...c }), ErrorDestino, `no rechazó ${k} con --prod`);
    }
  }
});

test("M1 (2ª ronda): el caso reproducido — .env con `CONVEX_DEPLOY_KEY: prod:...` → rechaza", () => {
  // Sintaxis con `:` y espacio: válida para el dotenv 16 del CLI, invisible
  // para un parser de `KEY=valor`. El guard ya no parsea: busca el nombre.
  const archivos = { envLocal: ENV_LOCAL_DEV, env: "CONVEX_DEPLOY_KEY: prod:inventado|falso\n" };
  assert.deepEqual(parsearEnv(archivos.env), {}, "CONTROL: mi parser NO la ve — por eso el guard no puede depender de él");
  assert.throws(() => resolverDestino({ prod: false, entorno: {}, archivos }), /\.env menciona CONVEX_DEPLOY_KEY/);
});

test("M1: la detección es por texto — una mención comentada también rechaza (fail-closed)", () => {
  const archivos = { envLocal: ENV_LOCAL_DEV + "# CONVEX_SELF_HOSTED_URL=https://x\n", env: null };
  assert.throws(() => resolverDestino({ prod: false, entorno: {}, archivos }), ErrorDestino);
});

test("M1 CONTROL: un .env con variables ajenas no rechaza", () => {
  const archivos = { envLocal: ENV_LOCAL_DEV, env: "OTRA_COSA: valor\nNEXT_PUBLIC_X=1\n" };
  assert.doesNotThrow(() => resolverDestino({ prod: false, entorno: {}, archivos }));
});

test("M1: el hijo recibe las variables de destino DEFINIDAS Y VACÍAS y CONVEX_DEPLOYMENT fijada", () => {
  // Vacías y no borradas: borradas, el `dotenv.config()` del CLI las
  // recargaría de los archivos; definidas, dotenv no las pisa.
  for (const prod of [false, true]) {
    const { entornoHijo } = resolverDestino({ prod, entorno: { PATH: "/bin" }, archivos: ARCHIVOS_DEV });
    for (const k of VARIABLES_QUE_ELIGEN_DESTINO) {
      assert.ok(Object.hasOwn(entornoHijo, k), `${k} tiene que estar DEFINIDA en el hijo`);
      assert.equal(entornoHijo[k], "");
    }
    assert.equal(entornoHijo.DOTENV_KEY, "");
    assert.equal(entornoHijo.CONVEX_DEPLOYMENT, "dev:perrito-inventado-123");
    assert.equal(entornoHijo.PATH, "/bin");
  }
});

test("M1: el CLI instalado sigue cargando los .env SIN override (lo que sostiene la capa 2)", () => {
  // Si un upgrade de `convex` pasara a `dotenv.config({ override: true })`,
  // las variables vacías del hijo dejarían de protegerlo. Este test se pone
  // rojo antes de que eso pase en silencio.
  const fuente = readFileSync(join(RAIZ, "node_modules/convex/src/cli/lib/deploymentSelection.ts"), "utf8");
  const llamadas = [...fuente.matchAll(/dotenv\.config\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(llamadas.length >= 2, "CONTROL: el regex tiene que encontrar las llamadas a dotenv.config");
  for (const args of llamadas) assert.doesNotMatch(args, /override/, `dotenv.config(${args}) usa override`);
  // Y el dotenv empaquetado sigue sin pisar claves existentes.
  const bundle = readFileSync(join(RAIZ, "node_modules/convex/dist/cli.bundle.cjs"), "utf8");
  assert.match(
    bundle,
    /if \(Object\.prototype\.hasOwnProperty\.call\(processEnv, key\)\) \{\s*if \(override === true\)/,
    "el populate de dotenv cambió: revisar la capa 2 de convex-destino.mjs",
  );
});

test("M1: una variable definida VACÍA no cuenta (el CLI tampoco la usa)", () => {
  assert.doesNotThrow(() =>
    resolverDestino({ prod: false, entorno: { CONVEX_DEPLOY_KEY: "" }, archivos: ARCHIVOS_DEV }),
  );
});

test("M1: CONVEX_DEPLOYMENT del proceso distinto al de .env.local → rechaza; igual → pasa", () => {
  assert.throws(
    () => resolverDestino({ prod: false, entorno: { CONVEX_DEPLOYMENT: "prod:otro-123" }, archivos: ARCHIVOS_DEV }),
    ErrorDestino,
  );
  assert.doesNotThrow(() =>
    resolverDestino({ prod: false, entorno: { CONVEX_DEPLOYMENT: "dev:perrito-inventado-123" }, archivos: ARCHIVOS_DEV }),
  );
});

test("M1: .env.local apuntando a prod sin --prod → rechaza", () => {
  assert.throws(
    () => resolverDestino({ prod: false, entorno: {}, archivos: { envLocal: "CONVEX_DEPLOYMENT=prod:algo-1\n", env: null } }),
    /PRODUCCIÓN/,
  );
});

test("M1: sin CONVEX_DEPLOYMENT en .env.local → rechaza", () => {
  assert.throws(() => resolverDestino({ prod: false, entorno: {}, archivos: { envLocal: null, env: null } }), ErrorDestino);
});

test("parsearEnv: comentarios, comillas, export y vacíos", () => {
  assert.deepEqual(
    parsearEnv("# nada\nA=1 # coment\nexport B=\"dos # no es comentario\"\nC=\nD='tres'\r\n"),
    { A: "1", B: "dos # no es comentario", D: "tres" },
  );
});

test("M1: el script usa resolverDestino, pasa sus flags y su entorno al hijo", () => {
  // Guard estático: que nadie vuelva a llamar al CLI eligiendo el destino por
  // su cuenta (el `if (prod) cli.push("--prod")` de antes).
  const script = readFileSync(join(RAIZ, "scripts/importar-cartera.mjs"), "utf8");
  assert.match(script, /resolverDestino\(/);
  assert.match(script, /\.\.\.destino\.flags/);
  assert.match(script, /env: destino\.entornoHijo/);
  assert.doesNotMatch(script, /cli\.push\("--prod"\)/);
});

// ── 6. Navegación (REC-160) ─────────────────────────────────────────────────

test("RUTAS.agente.cartera existe y su página también", () => {
  const constantes = readFileSync(join(RAIZ, "src/lib/constants.ts"), "utf8");
  assert.match(constantes, /cartera: "\/agente\/cartera"/);
  assert.ok(existsSync(join(RAIZ, "src/app/(agente)/agente/cartera/page.tsx")));
});
