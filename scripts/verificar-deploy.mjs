/**
 * Guard de coherencia front ↔ backend (REC-72). Corre como `prebuild`, o sea
 * DENTRO del `--cmd` de `convex deploy`, cuando las dos URLs ya conviven.
 *
 * Qué protege. `NEXT_PUBLIC_CONVEX_URL` se consume en DOS lugares distintos:
 *
 *   1. El BUNDLE del cliente: Next la inlinea en build-time. `convex deploy --cmd`
 *      la inyecta con la URL del deployment que acaba de desplegar.
 *   2. El RUNTIME del server: `src/middleware.ts` (convexAuthNextjsMiddleware) la
 *      lee del entorno del proceso, o sea la que está seteada en Railway.
 *
 * Si esas dos no son el mismo deployment, el cliente le habla a un backend y el
 * middleware a otro — y nada lo detecta: la app "anda" hasta que algo depende del
 * backend que quedó viejo. Ese fue el incidente de REC-71. Por eso build.sh captura
 * la URL de runtime en RAILWAY_CONVEX_URL antes de que el CLI la pise, y acá se
 * comparan.
 *
 * Fuera de CI/Railway no hace nada: el build local no se toca.
 */

const NORMAL = "\x1b[0m";
const ROJO = "\x1b[31m";

/** El build de Railway/CI. Fuera de acá, silencio absoluto. */
const enCI = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.CONVEX_DEPLOY_KEY || process.env.CI,
);
if (!enCI) process.exit(0);

const deployKey = process.env.CONVEX_DEPLOY_KEY;
const escotilla = process.env.ALLOW_FRONTEND_ONLY_BUILD === "1";

function fallar(titulo, detalle) {
  console.error(`\n${ROJO}✗ ${titulo}${NORMAL}\n`);
  console.error(detalle.trim());
  console.error("\nVer docs/cutover-prod.md (REC-72).\n");
  process.exit(1);
}

/** El deployment (`hardy-impala-296`) que hay detrás de una URL de Convex. */
function nombreDeployment(url) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return url;
  }
}

/** Sin la barra final ni mayúsculas: `https://X.convex.cloud/` === `https://x.convex.cloud`. */
function normalizar(url) {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

// ── La escotilla de rollback ────────────────────────────────────────────────
// Con ALLOW_FRONTEND_ONLY_BUILD el backend NO se despliega, así que no hay URL
// inyectada que comparar: si el guard exigiera las dos, ROMPERÍA el rollback,
// que es justo cuando más falta hace que el build salga. Se deja pasar, ruidoso.
if (escotilla && deployKey) {
  fallar(
    "ALLOW_FRONTEND_ONLY_BUILD y CONVEX_DEPLOY_KEY están las DOS seteadas.",
    `Es un estado sin sentido: o desplegás backend + front juntos (deploy key), o
buildeás sólo el front (escotilla de rollback). Las dos juntas significan, casi
seguro, que la escotilla quedó puesta de un rollback anterior y nadie la borró.

Arreglo: borrá ALLOW_FRONTEND_ONLY_BUILD del servicio de Railway.`,
  );
}

if (escotilla) {
  console.warn(
    "\n⚠ ALLOW_FRONTEND_ONLY_BUILD=1: build sólo del front, sin desplegar Convex.\n" +
      "⚠ Es una escotilla de rollback. Borrá la variable apenas termine.\n",
  );
  process.exit(0);
}

// ── Camino normal: nos invocó `convex deploy --cmd` ─────────────────────────
const inyectada = process.env.NEXT_PUBLIC_CONVEX_URL;
const runtime = process.env.RAILWAY_CONVEX_URL;

if (!inyectada) {
  fallar(
    "Falta NEXT_PUBLIC_CONVEX_URL en el build.",
    `La inyecta \`convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL\`.
Si no está, el bundle del cliente saldría sin URL de backend y la app no levanta.

Arreglo: buildear vía \`bash scripts/build.sh\` (es el buildCommand de railway.json).`,
  );
}

if (!runtime) {
  fallar(
    "Falta NEXT_PUBLIC_CONVEX_URL en el servicio de Railway.",
    `El bundle del cliente sí la tiene (la inyectó el deploy), pero el RUNTIME del
server la necesita también: \`src/middleware.ts\` la lee del entorno del proceso.
Sin ella, el middleware revienta en caliente y se cae la protección de rutas.

Arreglo: seteá NEXT_PUBLIC_CONVEX_URL en el servicio de Railway, con el MISMO
valor al que apunta CONVEX_DEPLOY_KEY: ${inyectada}`,
  );
}

if (normalizar(inyectada) !== normalizar(runtime)) {
  fallar(
    "El front y el backend apuntarían a deployments DISTINTOS.",
    `  backend desplegado (CONVEX_DEPLOY_KEY) → ${nombreDeployment(inyectada)}   ${inyectada}
  runtime del server (Railway)          → ${nombreDeployment(runtime)}   ${runtime}

El bundle del cliente hablaría con "${nombreDeployment(inyectada)}" y el middleware
del server con "${nombreDeployment(runtime)}". Es exactamente el desalineamiento que
rompió producción en REC-71, y es invisible hasta que algo falla.

Arreglo: que las DOS variables de Railway apunten al mismo deployment.`,
  );
}

console.log(`✓ Convex: front y backend en el mismo deployment (${nombreDeployment(inyectada)}).`);
