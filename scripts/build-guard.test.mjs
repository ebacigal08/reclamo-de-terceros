/**
 * REC-85 · El build NO despliega el backend de Convex desde un PR environment.
 *
 * Ejercita `scripts/build.sh` de verdad, con `npm`/`npx` reemplazados por stubs
 * que sólo imprimen lo que se les pidió. Así se puede afirmar qué camino tomó el
 * script sin buildear nada ni —sobre todo— desplegar nada.
 *
 * Lo que protege: el environment efímero que Railway crea por PR hereda
 * CONVEX_DEPLOY_KEY de production, así que `convex deploy` publicaba el backend
 * EN PRODUCCIÓN en cada push a la rama, sin merge.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directorio con `npm` y `npx` falsos que sólo anuncian sus argumentos. */
function stubs() {
  const dir = mkdtempSync(join(tmpdir(), "build-guard-"));
  for (const cmd of ["npm", "npx"]) {
    const p = join(dir, cmd);
    writeFileSync(p, `#!/bin/sh\necho "STUB ${cmd} $@"\n`);
    chmodSync(p, 0o755);
  }
  return dir;
}

/** Corre build.sh con el entorno dado. Devuelve { status, salida }. */
function correrBuild(env) {
  const dir = stubs();
  try {
    const salida = execFileSync("bash", ["scripts/build.sh"], {
      cwd: RAIZ,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        HOME: process.env.HOME ?? "",
        ...env,
      },
    });
    return { status: 0, salida };
  } catch (err) {
    return { status: err.status, salida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("en un PR environment NO se despliega el backend, aunque haya deploy key", () => {
  // El caso exacto del incidente: Railway clona las variables de production en
  // el environment del PR, así que la deploy key ESTÁ presente.
  const { status, salida } = correrBuild({
    RAILWAY_ENVIRONMENT_NAME: "reclamo-de-terceros-pr-99",
    CONVEX_DEPLOY_KEY: "clave-de-produccion-heredada",
    NEXT_PUBLIC_CONVEX_URL: "https://tame-cardinal-367.convex.cloud",
  });

  assert.equal(status, 0, "el build del PR no debe fallar (un check rojo empuja a devolver la key)");
  assert.match(salida, /STUB npm run build/, "debe buildear el front");
  assert.doesNotMatch(salida, /convex deploy/, "NO debe desplegar el backend");
});

test("en production se sigue desplegando backend + front juntos", () => {
  // El control del test anterior: si esto se rompe, el guard habría cortado los
  // deploys reales y nadie publicaría nunca más.
  const { status, salida } = correrBuild({
    RAILWAY_ENVIRONMENT_NAME: "production",
    CONVEX_DEPLOY_KEY: "clave",
    NEXT_PUBLIC_CONVEX_URL: "https://tame-cardinal-367.convex.cloud",
  });

  assert.equal(status, 0);
  assert.match(salida, /STUB npx convex deploy/, "debe desplegar Convex");
  assert.match(salida, /--cmd/, "y buildear el front dentro del mismo comando");
});

test("sin RAILWAY_ENVIRONMENT_NAME el comportamiento no cambia", () => {
  // Build local o Railway renombrando la variable: sólo se saltea el deploy
  // cuando SABEMOS que el environment no es production.
  const { status, salida } = correrBuild({ CONVEX_DEPLOY_KEY: "clave" });

  assert.equal(status, 0);
  assert.match(salida, /STUB npx convex deploy/);
});

test("un PR environment sin deploy key tampoco falla el build", () => {
  const { status, salida } = correrBuild({
    RAILWAY_ENVIRONMENT_NAME: "reclamo-de-terceros-pr-99",
  });

  assert.equal(status, 0);
  assert.match(salida, /STUB npm run build/);
});

/** Corre el guard de coherencia (`prebuild`) con el entorno dado. */
function correrVerificar(env) {
  try {
    execFileSync("node", ["scripts/verificar-deploy.mjs"], {
      cwd: RAIZ,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH, ...env },
    });
    return { status: 0 };
  } catch (err) {
    return { status: err.status, salida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("el guard de coherencia se saltea en un PR environment", () => {
  // Sin esto el build del PR fallaría por la razón EQUIVOCADA: corre como
  // prebuild de `npm run build`, o sea fuera de `convex deploy --cmd`, así que
  // no existe la URL inyectada que el guard compara. Y como el PR environment
  // hereda deploy key Y escotilla, además dispararía el "estado sin sentido".
  const { status } = correrVerificar({
    RAILWAY_ENVIRONMENT_NAME: "reclamo-de-terceros-pr-99",
    CONVEX_DEPLOY_KEY: "clave-heredada",
    ALLOW_FRONTEND_ONLY_BUILD: "1",
    NEXT_PUBLIC_CONVEX_URL: "https://tame-cardinal-367.convex.cloud",
  });

  assert.equal(status, 0);
});

test("en production el guard de coherencia sigue siendo implacable", () => {
  // Control: el desalineamiento front↔backend que rompió prod en REC-71 se
  // tiene que seguir detectando.
  const { status, salida } = correrVerificar({
    RAILWAY_ENVIRONMENT_NAME: "production",
    CONVEX_DEPLOY_KEY: "clave",
    NEXT_PUBLIC_CONVEX_URL: "https://tame-cardinal-367.convex.cloud",
    RAILWAY_CONVEX_URL: "https://hardy-impala-296.convex.cloud",
  });

  assert.equal(status, 1);
  assert.match(salida, /deployments DISTINTOS/);
});

test("fuera de un PR, sin deploy key, el build sigue fallando a propósito", () => {
  // La protección de REC-72 no se debilita: sin key y sin escotilla, un build a
  // medias (front nuevo contra backend viejo) rompe producción.
  const { status, salida } = correrBuild({});

  assert.equal(status, 1);
  assert.match(salida, /falta CONVEX_DEPLOY_KEY/i);
});
