/**
 * REC-163 · A qué deployment le va a escribir `npx convex run`. Lógica PURA.
 *
 * ⚠️ EL PROBLEMA (M1 de la auditoría). El script anunciaba el
 * `CONVEX_DEPLOYMENT` de `.env.local`, pero el CLI no elige el destino sólo
 * por ahí. Leído en `node_modules/convex/src/cli/lib/deploymentSelection.ts`:
 *
 *   - Carga `.env.local` y después `.env`, SIN pisar lo que ya está en el
 *     entorno del proceso: una variable exportada en la terminal le gana al
 *     archivo.
 *   - `CONVEX_DEPLOY_KEY` le gana a `CONVEX_DEPLOYMENT`. Si es la key de un
 *     deployment, "selectors like `--prod` / `--preview-name` will be
 *     ignored": va a ESE deployment pase lo que pase en la línea de comando.
 *   - `CONVEX_SELF_HOSTED_URL` + `_ADMIN_KEY` y `CONVEX_DEPLOYMENT_TOKEN`
 *     también seleccionan destino.
 *
 * Así que con `.env.local` en dev y una `CONVEX_DEPLOY_KEY` de prod heredada
 * del shell, el script anunciaba dev y el CLI escribía en prod sin `--prod`.
 *
 * LA CORRECCIÓN, en dos capas que NO dependen de parsear igual que el CLI.
 *
 * (La primera versión parseaba `.env` con un parser propio y la auditoría
 * mostró que diverge del dotenv del CLI: `CONVEX_DEPLOY_KEY: prod:x` es válido
 * para dotenv 16 y mi parser no lo veía. El dotenv del CLI viene EMPAQUETADO en
 * `convex/dist/cli.bundle.cjs`, así que no se puede importar para usar el
 * mismo. La conclusión es no depender de la equivalencia.)
 *
 *   1. DETECTAR por TEXTO, no por parseo: si el nombre de una variable que
 *      elige destino aparece en cualquier parte de `.env.local` o `.env`
 *      —asignada con `=`, con `:`, comentada, lo que sea— se rechaza antes de
 *      abrir la corrida. Es un superconjunto de lo que cualquier parser puede
 *      cargar. Un comentario que la nombra también rechaza: falso positivo
 *      barato, a propósito. En el entorno del proceso, rechaza si no está vacía.
 *
 *   2. AISLAR al hijo: se le pasan esas variables DEFINIDAS Y VACÍAS, y
 *      `CONVEX_DEPLOYMENT` fijada al valor anunciado. Funciona porque el CLI
 *      llama `dotenv.config()` sin `override`, y el `populate` de dotenv salta
 *      toda clave que ya existe en `process.env` (también la ruta de
 *      `.env.vault`). Y el CLI trata una variable vacía como ausente. O sea: el
 *      hijo NO PUEDE recargar una deploy key de ningún archivo, la haya visto
 *      el guard o no. `cartera.test.mjs` vigila que el CLI instalado siga
 *      cargando así.
 *
 * Y el destino nunca lo elige el CLI: va siempre explícito
 * (`--deployment <nombre>` o `--prod`).
 */

/** Variables que el CLI usa para elegir destino por encima de `--deployment`/`--prod`. */
export const VARIABLES_QUE_ELIGEN_DESTINO = [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
];

export class ErrorDestino extends Error {}

/**
 * Parser mínimo de un `.env` con la semántica de dotenv que importa acá:
 * `KEY=valor`, `export` opcional, comillas opcionales, comentario `#` al final
 * de un valor sin comillas. Vacío ⇒ no definido (igual que el CLI).
 */
export function parsearEnv(texto) {
  const salida = {};
  for (const cruda of texto.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(cruda);
    if (!m) continue;
    let valor = m[2].trim();
    const q = /^(['"])(.*)\1$/.exec(valor);
    if (q) valor = q[2];
    else valor = valor.replace(/\s+#.*$/, "").trim();
    if (valor !== "") salida[m[1]] = valor;
  }
  return salida;
}

/**
 * Decide el destino o lanza. Recibe todo por parámetro para poder probarlo.
 *
 * @param {object} p
 * @param {boolean} p.prod             se pasó `--prod`
 * @param {Record<string,string|undefined>} p.entorno   `process.env`
 * @param {{ envLocal: string|null, env: string|null }} p.archivos  contenido de `.env.local` y `.env`
 * @returns {{ anuncio: string, flags: string[], entornoHijo: Record<string,string> }}
 */
export function resolverDestino({ prod, entorno, archivos }) {
  // ── Capa 1: nada que pueda elegir otro destino ──
  for (const k of VARIABLES_QUE_ELIGEN_DESTINO) {
    if (entorno[k] !== undefined && entorno[k] !== "") {
      throw new ErrorDestino(
        `${k} está definida en el entorno del proceso. El CLI de Convex la usa por encima de ` +
          `--deployment/--prod, así que el destino efectivo podría no ser el anunciado ` +
          `(con una key de prod, escribiría en PRODUCCIÓN). Sacala y volvé a correr.`,
      );
    }
    for (const [donde, texto] of [[".env.local", archivos.envLocal], [".env", archivos.env]]) {
      if (texto !== null && new RegExp(`\\b${k}\\b`).test(texto)) {
        throw new ErrorDestino(
          `${donde} menciona ${k}. Se rechaza por TEXTO, no por parseo: si el CLI de Convex la ` +
            `carga, le gana a --deployment/--prod (aunque esté escrita con ":" o sea un ` +
            `comentario, se rechaza igual). Sacala del archivo y volvé a correr.`,
        );
      }
    }
  }

  // Si `.env.local` no está escrito en la forma `CONVEX_DEPLOYMENT=...` que
  // entiende `parsearEnv`, esto da undefined y se RECHAZA (fail-closed). Y
  // aunque el CLI lo leyera distinto, al hijo le llega fijado el valor de acá.
  const deploymentArchivo =
    archivos.envLocal === null ? undefined : parsearEnv(archivos.envLocal).CONVEX_DEPLOYMENT;
  if (deploymentArchivo === undefined) {
    throw new ErrorDestino("No hay CONVEX_DEPLOYMENT en .env.local: no sé a qué deployment apunta este repo.");
  }

  // El CLI no pisa el entorno con el archivo: si difieren, gana el del proceso.
  const deploymentEntorno = entorno.CONVEX_DEPLOYMENT;
  if (deploymentEntorno !== undefined && deploymentEntorno !== "" && deploymentEntorno !== deploymentArchivo) {
    throw new ErrorDestino(
      `CONVEX_DEPLOYMENT del entorno del proceso (${deploymentEntorno}) no coincide con el de .env.local ` +
        `(${deploymentArchivo}). El CLI usaría el del proceso. Sacala del entorno o alineá los dos.`,
    );
  }

  // ── Capa 2: el hijo no puede recargar nada de los archivos ──
  // Definidas y VACÍAS, no borradas: borradas, el `dotenv.config()` del CLI las
  // volvería a cargar de `.env`/`.env.local`; definidas, `populate` las salta.
  // `DOTENV_KEY` vacía apaga la ruta de `.env.vault`.
  const entornoHijo = { ...entorno, DOTENV_KEY: "", CONVEX_DEPLOYMENT: deploymentArchivo };
  for (const k of VARIABLES_QUE_ELIGEN_DESTINO) entornoHijo[k] = "";

  if (prod) {
    return {
      anuncio: "PRODUCCIÓN — el deployment de producción por defecto del proyecto (--prod)",
      flags: ["--prod"],
      entornoHijo,
    };
  }

  const m = /^(dev|prod|preview|local):([a-z0-9-]+)$/.exec(deploymentArchivo);
  if (!m) throw new ErrorDestino(`CONVEX_DEPLOYMENT de .env.local con forma inesperada: ${deploymentArchivo}`);
  if (m[1] === "prod") {
    throw new ErrorDestino(
      `.env.local apunta a un deployment de PRODUCCIÓN (${deploymentArchivo}). ` +
        `Producción sólo se toca pasando --prod a propósito.`,
    );
  }
  if (m[1] !== "dev") {
    throw new ErrorDestino(`.env.local apunta a un deployment ${m[1]} (${deploymentArchivo}): este script sólo escribe en dev o con --prod.`);
  }
  return {
    anuncio: `dev — ${m[2]} (de .env.local)`,
    flags: ["--deployment", m[2]],
    entornoHijo,
  };
}
