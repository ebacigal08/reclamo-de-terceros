/**
 * REC-163 · Lectura del export CSV de la cartera de FedPat. Lógica PURA.
 *
 * Vive separada de `importar-cartera.mjs` para que `cartera.test.mjs` la pruebe
 * sin conectarse a nada ni tocar el archivo real: el test le pasa texto
 * sintético y mira lo que sale.
 *
 * Cero dependencias, como el resto de `scripts/`.
 *
 * ⚠️ EL EXPORT NO ES RFC 4180. Escapa las comillas internas con backslash
 * (`"EDIFICIO \"X\""`), no duplicándolas (`""X""`). Un parser estándar cierra el
 * campo en la primera `\"`, parte esa fila en 21 campos en vez de 19 y corre
 * todas las columnas: la dirección cae en `CP`, la localidad en `Documento`, el
 * CUIT termina con un documento adentro. Las cinco "anomalías" que se anotaron
 * al principio en REC-163 eran esa única fila mal leída.
 *
 * Por eso el parser es propio y, sobre todo, ESTRICTO: ante cualquier cosa que
 * no entiende lanza nombrando la línea. Un parser que "se las arregla" es
 * justamente el modo de falla a impedir — escribe basura sin error.
 */

/** Las 19 columnas del export, en orden. Un header distinto aborta (C4). */
export const ENCABEZADOS = [
  "Matrícula",
  "Tipo",
  "Apellido y Nombre",
  "Garantiza Cobertura",
  "Sexo",
  "IVA",
  "Fecha Nac.",
  "Lugar Nacimiento",
  "Estado Civil",
  "Nacionalidad",
  "Dirección",
  "CP",
  "CPA",
  "Localidad",
  "Documento",
  "Teléfono",
  "CUIT/CUIL/CDI",
  "E-mail",
  "Cobrador",
];

/** Error de validación del archivo. Siempre nombra la línea física. */
export class ErrorCsv extends Error {
  constructor(linea, mensaje) {
    super(`línea ${linea}: ${mensaje}`);
    this.linea = linea;
  }
}

/**
 * Parte el texto en registros. Cada registro es `{ linea, campos }`, donde
 * `linea` es la línea física (1-based) donde EMPIEZA el registro.
 *
 * Reglas:
 *   - separador `,`, fin de registro `\n` o `\r\n`;
 *   - un campo que empieza con `"` es citado: dentro, `\"` es una comilla
 *     literal y `\\` una barra literal; la `"` sola cierra el campo, y lo que
 *     sigue tiene que ser `,` o fin de registro;
 *   - una `"` en medio de un campo sin citar, o una cita sin cerrar, lanzan.
 *
 * No valida la cantidad de campos: eso es `validarRegistros`, que conoce el
 * header.
 */
export function parsearCsv(texto) {
  // Un BOM al principio pegaría `﻿` al primer encabezado y el header
  // dejaría de coincidir por un carácter invisible. El export de hoy no trae
  // BOM; si el de mañana sí, no es motivo para abortar.
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);

  const registros = [];
  let campos = [];
  let campo = "";
  let linea = 1;
  let inicioRegistro = 1;
  let i = 0;
  const n = texto.length;

  const cerrarCampo = () => {
    campos.push(campo);
    campo = "";
  };
  const cerrarRegistro = () => {
    cerrarCampo();
    registros.push({ linea: inicioRegistro, campos });
    campos = [];
  };

  while (i < n) {
    const c = texto[i];

    if (c === '"' && campo === "") {
      // Campo citado.
      const lineaCita = linea;
      i++;
      let cerrado = false;
      while (i < n) {
        const d = texto[i];
        if (d === "\\" && (texto[i + 1] === '"' || texto[i + 1] === "\\")) {
          campo += texto[i + 1];
          i += 2;
          continue;
        }
        if (d === '"') {
          cerrado = true;
          i++;
          break;
        }
        if (d === "\n") linea++;
        campo += d;
        i++;
      }
      if (!cerrado) throw new ErrorCsv(lineaCita, "comilla sin cerrar");
      // Después de cerrar la cita sólo vale un terminador: `,`, `\n`, `\r\n`
      // o el fin del archivo. Un `\r` suelto NO: aceptarlo dejaba pasar
      // `"CALLE"\rTEXTO`, y el texto fuera de la cita terminaba pegado al campo
      // con 19 campos intactos — basura que supera la validación.
      const sig = texto[i];
      const terminador =
        i >= n || sig === "," || sig === "\n" || (sig === "\r" && texto[i + 1] === "\n");
      if (!terminador) {
        throw new ErrorCsv(
          linea,
          `después de cerrar un campo citado viene ${JSON.stringify(sig)} y no una coma ni un fin de línea: ` +
            `hay texto fuera de la cita (¿comillas duplicadas \`""\` en vez de \`\\"\`?)`,
        );
      }
      continue;
    }

    if (c === '"') {
      throw new ErrorCsv(linea, "comilla en medio de un campo sin citar");
    }

    if (c === ",") {
      cerrarCampo();
      i++;
      continue;
    }

    if (c === "\r" && texto[i + 1] === "\n") {
      i++;
      continue;
    }

    if (c === "\n") {
      cerrarRegistro();
      linea++;
      inicioRegistro = linea;
      i++;
      continue;
    }

    campo += c;
    i++;
  }

  // Último registro sin `\n` final. Un archivo que termina en `\n` no deja un
  // registro vacío colgando.
  if (campo !== "" || campos.length > 0) cerrarRegistro();

  return registros;
}

/**
 * Las tres validaciones de C4, sobre el archivo ENTERO y antes de escribir
 * nada. Lanza ante la primera violación; si vuelve, el archivo es cargable.
 *
 *   1. header exacto, en orden;
 *   2. 19 campos en cada fila;
 *   3. `Matrícula` no vacía y no repetida.
 *
 * Devuelve las filas de datos como objetos indexados por encabezado.
 */
export function validarRegistros(registros) {
  if (registros.length === 0) throw new ErrorCsv(1, "archivo vacío");

  const [header, ...datos] = registros;
  const esperado = ENCABEZADOS.join(" | ");
  const recibido = header.campos.join(" | ");
  if (esperado !== recibido) {
    throw new ErrorCsv(
      header.linea,
      `encabezados distintos a los esperados.\n  esperado: ${esperado}\n  recibido: ${recibido}`,
    );
  }

  if (datos.length === 0) throw new ErrorCsv(header.linea, "el archivo no tiene filas de datos");

  const vistas = new Map();
  return datos.map(({ linea, campos }) => {
    if (campos.length !== ENCABEZADOS.length) {
      throw new ErrorCsv(
        linea,
        `${campos.length} campos en vez de ${ENCABEZADOS.length}: las columnas quedarían corridas`,
      );
    }
    const fila = Object.fromEntries(ENCABEZADOS.map((h, k) => [h, campos[k]]));
    const matricula = fila["Matrícula"].trim();
    if (matricula === "") throw new ErrorCsv(linea, "Matrícula vacía");
    if (vistas.has(matricula)) {
      throw new ErrorCsv(
        linea,
        `Matrícula ${matricula} repetida (ya estaba en la línea ${vistas.get(matricula)})`,
      );
    }
    vistas.set(matricula, linea);
    return { linea, fila };
  });
}

/**
 * `N¿` → `N°`. El `¿` (U+00BF) es un `º` corrupto por encoding: en el export
 * aparece en prácticamente todas las direcciones, siempre pegado a una `N`
 * (`AYACUCHO N¿ 1217`). No es una fila sucia, es la columna entera.
 *
 * Sólo se reemplaza el patrón `N¿`: un `¿` en otra posición no tiene una
 * lectura obvia y se deja como viene (el resumen lo cuenta).
 */
export function normalizarDireccion(direccion) {
  return direccion.replace(/N¿/g, "N°");
}

/**
 * `"DNI 12345678"` → `{ tipoDocumento: "DNI", numeroDocumento: "12345678" }`.
 *
 * Se guardan separados desde el primer import porque la API los trae
 * separados (REC-159). El número queda `string`: ceros a la izquierda.
 *
 * Vacío ⇒ los dos `undefined` (las Personas Jurídicas no traen documento).
 * Cualquier otra forma lanza: es mejor enterarse en `--validar` que guardar un
 * documento partido mal.
 */
export function partirDocumento(documento, linea) {
  const d = documento.trim();
  if (d === "") return { tipoDocumento: undefined, numeroDocumento: undefined };
  const m = /^([A-Z]{1,4})\s+(\S+)$/.exec(d);
  if (!m) throw new ErrorCsv(linea, `Documento con forma inesperada: "${d}" (se esperaba "TIPO NÚMERO")`);
  return { tipoDocumento: m[1], numeroDocumento: m[2] };
}

/** Trim, y vacío ⇒ `undefined` (el campo no se guarda). */
function opcional(valor) {
  const t = valor.trim();
  return t === "" ? undefined : t;
}

/**
 * Fila del CSV → fila de `carteraClientes`, con la forma exacta de
 * `filaValidator` de `convex/cartera.ts`.
 *
 * Se importan 13 de las 19 columnas. Se omiten a propósito `Sexo`,
 * `Fecha Nac.`, `Lugar Nacimiento`, `Estado Civil`, `Nacionalidad` (nada de lo
 * planificado las usa, y no guardar es lo reversible) y `Garantiza Cobertura`
 * (no se sabe qué significa). Ver REC-161.
 *
 * `normalizarEmail` se inyecta para que esto use el MISMO `normalizeEmail` de
 * `convex/lib.ts` que el resto de Amparo, sin que este módulo dependa de TS.
 */
export function aFilaCartera({ linea, fila }, normalizarEmail) {
  const direccion = opcional(fila["Dirección"]);
  const email = opcional(fila["E-mail"]);
  const salida = {
    matricula: fila["Matrícula"].trim(),
    nombre: fila["Apellido y Nombre"].trim(),
    tipoPersona: opcional(fila["Tipo"]),
    iva: opcional(fila["IVA"]),
    direccion: direccion === undefined ? undefined : normalizarDireccion(direccion),
    cp: opcional(fila["CP"]),
    cpa: opcional(fila["CPA"]),
    localidad: opcional(fila["Localidad"]),
    ...partirDocumento(fila["Documento"], linea),
    telefono: opcional(fila["Teléfono"]),
    cuit: opcional(fila["CUIT/CUIL/CDI"]),
    email: email === undefined ? undefined : normalizarEmail(email),
    cobrador: opcional(fila["Cobrador"]),
  };
  if (salida.nombre === "") throw new ErrorCsv(linea, "Apellido y Nombre vacío");

  // Los `undefined` se SACAN del objeto: viajan como JSON por argv a
  // `npx convex run`, y `JSON.stringify` ya los omite, pero dejarlo explícito
  // evita que alguien los convierta en `null` (que el validador rechaza).
  // El vaciado de un campo existente lo resuelve `patchCompleto` del lado de
  // Convex, que pasa `undefined` en todo campo ausente.
  for (const k of Object.keys(salida)) if (salida[k] === undefined) delete salida[k];
  return salida;
}

/**
 * Lo que el archivo trae mal y se importa igual (no aborta). Las cuatro
 * primeras son las que guarda `carteraImports.anomalias`; el resto sólo se
 * imprime en el resumen.
 *
 * `emailDuplicado` cuenta VALORES repetidos (un email que aparece 8 veces suma
 * 1), no filas.
 */
export function contarAnomalias(filas, esEmailValido) {
  const porEmail = new Map();
  let sinEmail = 0;
  let sinDireccion = 0;
  let sinDocumento = 0;
  let signoResidual = 0;
  for (const f of filas) {
    if (f.email === undefined || !esEmailValido(f.email)) sinEmail++;
    if (f.email !== undefined) porEmail.set(f.email, (porEmail.get(f.email) ?? 0) + 1);
    if (f.direccion === undefined) sinDireccion++;
    else if (f.direccion.includes("¿")) signoResidual++;
    if (f.numeroDocumento === undefined) sinDocumento++;
  }
  const emailDuplicado = [...porEmail.values()].filter((c) => c > 1).length;
  return {
    guardadas: { sinEmail, emailDuplicado, sinDireccion, sinDocumento },
    signoResidual,
  };
}

/** Parte en lotes de `tamano`. */
export function enLotes(filas, tamano) {
  const lotes = [];
  for (let i = 0; i < filas.length; i += tamano) lotes.push(filas.slice(i, i + tamano));
  return lotes;
}
