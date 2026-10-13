/**
 * REC-164 · Del Excel de contactos (prospectos) a los contactos que se cargan.
 * Lógica PURA, sin I/O y sin Convex: la usan `importar-contactos.mjs` y
 * `contactos.test.mjs`.
 *
 * El archivo es `API_FEDPAT/Contactos_Asegurados_Sole.xlsx`, armado a mano a
 * partir de capturas de pantalla. Tiene una hoja por productor, y cada hoja
 * tiene esta forma:
 *
 *   fila 1   título: "Asegurados con pólizas vigentes – Productor 21533 – Sole Leandro Hugo"
 *   fila 2   nota de transcripción (se ignora)
 *   fila 3   las 12 columnas de ENCABEZADOS, de A a L
 *   fila 4+  una persona por fila
 *
 * ⚠️ La calidad del archivo es BAJA: más de la mitad de las filas de la hoja
 * 21533 trae una observación del tipo "nombre cortado en la foto". Por eso el
 * import no corrige nada. Guarda lo que viene, lo marca y deja que el agente lo
 * vea ("A verificar").
 */

export class ErrorContactos extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorContactos";
  }
}

/** Las 12 columnas de la fila 3, de A a L. Un encabezado distinto aborta. */
export const ENCABEZADOS = [
  "Asegurado",
  "Cond. IVA",
  "Dirección",
  "Localidad",
  "Cód. Postal",
  "Tipo Doc.",
  "Nro. Documento",
  "CUIT / CUIL",
  "Teléfono",
  "Email",
  "Faltan datos obligatorios",
  "Observaciones",
];
const COLUMNAS = "ABCDEFGHIJKL".split("");

/** El guion es la raya `–` (U+2013) del archivo real. También se acepta `-`. */
const RE_TITULO = /Productor (\d+) [–-] (.+)$/;

/** Marcas automáticas. Las pinta la pantalla en lenguaje claro. */
export const MARCAS = {
  SIN_CUIT: "SIN_CUIT",
  SIN_IDENTIFICADOR: "SIN_IDENTIFICADOR",
  CUIT_COMPARTIDO: "CUIT_COMPARTIDO",
};

const opcional = (s) => {
  const t = (s ?? "").trim();
  return t === "" ? undefined : t;
};

/** Mayúsculas, sin espacios en los extremos y con los espacios internos colapsados. */
export function normalizarNombre(nombre) {
  return nombre.trim().replace(/\s+/g, " ").toUpperCase();
}

// ───────────────────────────── Validación ─────────────────────────────

/**
 * Valida el LIBRO ENTERO y devuelve las filas de datos en limpio. No devuelve
 * nada a medias: si una sola fila es inválida, aborta, porque una corrida que
 * escribiera el lote 1 y fallara en el 4 por algo detectable de antemano
 * dejaría una carga parcial evitable (C4 de cartera).
 *
 * Cada fila sale como `{ hoja, fila, productor, productorNombre, celdas }`.
 */
export function validarLibro(libro) {
  if (libro.length === 0) throw new ErrorContactos("el libro no tiene hojas");
  const salida = [];

  for (const { hoja, filas } of libro) {
    const donde = (n) => `hoja "${hoja}", fila ${n}`;
    const porNumero = new Map(filas.map((f) => [f.fila, f.celdas]));

    const titulo = (porNumero.get(1)?.A ?? "").trim();
    const m = RE_TITULO.exec(titulo);
    if (!m) {
      throw new ErrorContactos(`${donde(1)}: el título no dice "Productor <número> – <nombre>"`);
    }
    const productor = m[1];
    const productorNombre = m[2].trim();

    const enc = porNumero.get(3) ?? {};
    const vistos = Object.keys(enc).sort();
    if (
      vistos.length !== COLUMNAS.length ||
      COLUMNAS.some((c, i) => (enc[c] ?? "").trim() !== ENCABEZADOS[i])
    ) {
      throw new ErrorContactos(
        `${donde(3)}: los encabezados no son las 12 columnas esperadas (${ENCABEZADOS.join(" · ")})`,
      );
    }

    for (const { fila, celdas } of filas) {
      if (fila < 4) continue;

      const fuera = Object.keys(celdas).filter((c) => !COLUMNAS.includes(c));
      if (fuera.length) throw new ErrorContactos(`${donde(fila)}: hay datos fuera de las columnas A–L (${fuera.join(", ")})`);

      // Una fila totalmente vacía (Excel a veces deja una al final) no es una
      // persona y no aporta nada: se saltea.
      if (Object.keys(celdas).length === 0) continue;

      if (!opcional(celdas.A)) throw new ErrorContactos(`${donde(fila)}: falta el nombre del asegurado`);

      const cuit = opcional(celdas.H);
      if (cuit !== undefined && !/^\d{11}$/.test(cuit)) {
        throw new ErrorContactos(`${donde(fila)}: el CUIT no tiene 11 dígitos`);
      }
      const doc = opcional(celdas.G);
      if (doc !== undefined && !/^\d+$/.test(doc)) {
        throw new ErrorContactos(`${donde(fila)}: el número de documento no es numérico`);
      }
      const faltan = opcional(celdas.K);
      if (faltan !== undefined && faltan !== "Sí") {
        throw new ErrorContactos(`${donde(fila)}: "Faltan datos obligatorios" tiene que ser "Sí" o estar vacío`);
      }

      salida.push({ hoja, fila, productor, productorNombre, celdas });
    }
  }
  return salida;
}

// ───────────────────────────── Fila → contacto ─────────────────────────────

/**
 * La clave de la PERSONA. Es la clave del upsert, y por eso decide si un
 * re-import conserva el estado que marcó el agente.
 *
 *   hay CUIT          C:<cuit>|<NOMBRE>
 *   sólo documento    D:<tipo><nro>|<NOMBRE>
 *   ninguno           N:<NOMBRE>
 *
 * El nombre va en la clave porque el CUIT solo no alcanza: hay CUIT repetidos
 * con nombres distintos (error de transcripción probable), y fusionarlos
 * juntaría a dos personas en un mismo estado.
 *
 * Límite conocido: corregir un nombre en el Excel cambia la clave. El contacto
 * corregido entra como nuevo y el viejo queda con su estado. El resumen del
 * import lo informa en `noVinieron`, y no se borra nada.
 */
export function claveDe({ cuit, tipoDocumento, numeroDocumento, nombre }) {
  const n = normalizarNombre(nombre);
  if (cuit) return `C:${cuit}|${n}`;
  if (numeroDocumento) return `D:${tipoDocumento ?? ""}${numeroDocumento}|${n}`;
  return `N:${n}`;
}

/** Los campos de una fila tal cual vienen: vacío ⇒ ausente, email normalizado. */
function datosDeFila(celdas, normalizarEmail) {
  const email = opcional(celdas.J);
  return {
    nombre: celdas.A.trim(),
    condicionIva: opcional(celdas.B),
    direccion: opcional(celdas.C),
    localidad: opcional(celdas.D),
    codigoPostal: opcional(celdas.E),
    tipoDocumento: opcional(celdas.F),
    numeroDocumento: opcional(celdas.G),
    cuit: opcional(celdas.H),
    telefono: opcional(celdas.I),
    email: email === undefined ? undefined : normalizarEmail(email),
    faltanDatosObligatorios: opcional(celdas.K) === "Sí",
    observacion: opcional(celdas.L),
  };
}

/** Saca los `undefined` del objeto (viaja como JSON; ver `aFilaCartera`). */
function sinAusentes(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/**
 * Las filas validadas → contactos, uno por persona (por clave).
 *
 * Si una persona tiene varias filas (otra dirección, otro teléfono), la
 * PRIMERA va a los campos principales y cada una de las demás entra ENTERA en
 * `alternativos`, así no se descarta ningún domicilio ni teléfono.
 *
 * ⚠️ C2 de la auditoría: `aVerificar` es el OR de TODAS las filas de la
 * persona. Si sólo lo calculara la fila principal, una observación que viene en
 * la segunda fila quedaría escondida en un alternativo y el contacto se vería
 * limpio.
 */
export function aContactos(filasValidadas, normalizarEmail) {
  const porClave = new Map();
  for (const f of filasValidadas) {
    const datos = datosDeFila(f.celdas, normalizarEmail);
    const clave = claveDe(datos);
    const previo = porClave.get(clave);
    if (!previo) {
      porClave.set(clave, { clave, productor: f.productor, productorNombre: f.productorNombre, datos, alternativos: [], origen: f });
      continue;
    }
    // La misma persona en dos productores no aparece en el archivo de hoy. Si
    // apareciera, no hay una regla obvia para elegir el productor del contacto:
    // se frena en vez de elegir uno en silencio.
    if (previo.productor !== f.productor) {
      throw new ErrorContactos(
        `hoja "${f.hoja}", fila ${f.fila}: es la misma persona que la hoja "${previo.origen.hoja}", ` +
          `fila ${previo.origen.fila}, pero de otro productor`,
      );
    }
    previo.alternativos.push(datos);
  }

  // CUIT_COMPARTIDO: el mismo CUIT con más de un nombre normalizado.
  const nombresPorCuit = new Map();
  for (const c of porClave.values()) {
    if (!c.datos.cuit) continue;
    const s = nombresPorCuit.get(c.datos.cuit) ?? new Set();
    s.add(normalizarNombre(c.datos.nombre));
    nombresPorCuit.set(c.datos.cuit, s);
  }

  return [...porClave.values()].map(({ clave, productor, productorNombre, datos, alternativos }) => {
    const marcas = [];
    if (clave.startsWith("D:")) marcas.push(MARCAS.SIN_CUIT);
    if (clave.startsWith("N:")) marcas.push(MARCAS.SIN_CUIT, MARCAS.SIN_IDENTIFICADOR);
    if (datos.cuit && nombresPorCuit.get(datos.cuit).size > 1) marcas.push(MARCAS.CUIT_COMPARTIDO);

    const todas = [datos, ...alternativos];
    const aVerificar =
      marcas.length > 0 || todas.some((d) => d.faltanDatosObligatorios || d.observacion !== undefined);

    return sinAusentes({
      clave,
      nombre: datos.nombre,
      productor,
      productorNombre,
      cuit: datos.cuit,
      condicionIva: datos.condicionIva,
      direccion: datos.direccion,
      localidad: datos.localidad,
      codigoPostal: datos.codigoPostal,
      tipoDocumento: datos.tipoDocumento,
      numeroDocumento: datos.numeroDocumento,
      telefono: datos.telefono,
      email: datos.email,
      observacion: datos.observacion,
      faltanDatosObligatorios: datos.faltanDatosObligatorios,
      marcas,
      aVerificar,
      // Ausente (y no `[]`) cuando no hay: así un re-import que ya no trae la
      // segunda fila le pasa `undefined` al patch y Convex BORRA los
      // alternativos viejos (C4).
      alternativos: alternativos.length
        ? alternativos.map((a) =>
            sinAusentes({
              condicionIva: a.condicionIva,
              direccion: a.direccion,
              localidad: a.localidad,
              codigoPostal: a.codigoPostal,
              tipoDocumento: a.tipoDocumento,
              numeroDocumento: a.numeroDocumento,
              telefono: a.telefono,
              email: a.email,
              observacion: a.observacion,
              faltanDatosObligatorios: a.faltanDatosObligatorios,
            }),
          )
        : undefined,
    });
  });
}

/**
 * Lo que el archivo trae mal y se importa igual. Es lo que guarda
 * `contactosImports.anomalias`.
 *
 * Los conteos de FILAS y de CONTACTOS van separados a propósito (sugerencia de
 * la auditoría): "faltan datos" y "observación" son anotaciones del Excel, una
 * por fila, y una persona fusionada puede traer dos. Las marcas automáticas,
 * en cambio, son de la persona.
 */
export function contarAnomalias(filasValidadas, contactos) {
  const n = (pred) => contactos.filter(pred).length;
  return {
    filas: filasValidadas.length,
    filasFaltanDatos: filasValidadas.filter((f) => opcional(f.celdas.K) === "Sí").length,
    filasConObservacion: filasValidadas.filter((f) => opcional(f.celdas.L) !== undefined).length,
    contactos: contactos.length,
    fusionados: n((c) => c.alternativos !== undefined),
    sinCuit: n((c) => c.marcas.includes(MARCAS.SIN_CUIT)),
    sinIdentificador: n((c) => c.marcas.includes(MARCAS.SIN_IDENTIFICADOR)),
    cuitCompartido: n((c) => c.marcas.includes(MARCAS.CUIT_COMPARTIDO)),
    aVerificar: n((c) => c.aVerificar),
  };
}

/** Recuento por productor, para el resumen del CLI. */
export function porProductor(contactos) {
  const out = {};
  for (const c of contactos) {
    const k = `${c.productor} · ${c.productorNombre}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
