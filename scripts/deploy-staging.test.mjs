/**
 * REC-88 · `npm run deploy:staging` no puede publicar en el lugar equivocado.
 *
 * Ejercita `scripts/deploy-staging.sh` de verdad, con `npx` reemplazado por un
 * stub que sólo imprime lo que se le pidió. Así se puede afirmar qué camino tomó
 * el script sin desplegar nada.
 *
 * Lo que protege: `convex deploy` elige el destino por CONVEX_DEPLOY_KEY y, si
 * no está, se va al PROD POR DEFECTO DEL PROYECTO. Con un `.env.staging.local`
 * que sólo tenía CONVEX_DEPLOYMENT, `deploy:staging` apuntaba a wary-oyster-919
 * (prod de amparo-e2e-rec71) en vez de a famous-clownfish-44.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directorio con un `npx` falso que sólo anuncia sus argumentos. */
function stubs() {
  const dir = mkdtempSync(join(tmpdir(), "deploy-staging-"));
  const p = join(dir, "npx");
  writeFileSync(p, `#!/bin/sh\necho "STUB npx $@"\n`);
  chmodSync(p, 0o755);
  return dir;
}

/** Escribe un env file temporal con el contenido dado y devuelve su ruta. */
function envFile(contenido) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-staging-env-"));
  const p = join(dir, ".env.staging.local");
  writeFileSync(p, contenido);
  return p;
}

/** Corre deploy-staging.sh contra el env file dado. Devuelve { status, salida }. */
function correr(rutaEnv) {
  const dir = stubs();
  try {
    const salida = execFileSync("bash", ["scripts/deploy-staging.sh", rutaEnv], {
      cwd: RAIZ,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: `${dir}:${process.env.PATH}`, HOME: process.env.HOME ?? "" },
    });
    return { status: 0, salida };
  } catch (err) {
    return { status: err.status, salida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("sin CONVEX_DEPLOY_KEY el deploy se cancela: es el bug de REC-88", () => {
  // El archivo exacto que había: sólo el nombre del deployment. `convex deploy`
  // lo habría interpretado como "andá al prod por defecto del proyecto".
  const { status, salida } = correr(envFile("CONVEX_DEPLOYMENT=dev:famous-clownfish-44\n"));

  assert.equal(status, 1, "tiene que fallar");
  assert.match(salida, /no tiene CONVEX_DEPLOY_KEY/);
  assert.doesNotMatch(salida, /STUB npx/, "NO puede haber llamado a convex deploy");
});

test("con CONVEX_DEPLOY_KEY sí despliega, y con el env file recibido", () => {
  const ruta = envFile("CONVEX_DEPLOYMENT=dev:famous-clownfish-44\nCONVEX_DEPLOY_KEY=clave-de-staging\n");
  const { status, salida } = correr(ruta);

  assert.equal(status, 0);
  assert.match(salida, /STUB npx convex deploy --env-file/);
  assert.match(salida, new RegExp(ruta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("una key vacía no cuenta como key", () => {
  // `CONVEX_DEPLOY_KEY=` a secas dejaría la variable definida pero sin valor, y
  // el CLI volvería a caer en la regla del prod por defecto.
  const { status, salida } = correr(envFile("CONVEX_DEPLOY_KEY=\n"));

  assert.equal(status, 1);
  assert.doesNotMatch(salida, /STUB npx/);
});

test("una key comentada no cuenta como key", () => {
  const { status, salida } = correr(envFile("# CONVEX_DEPLOY_KEY=la-que-borré\nCONVEX_DEPLOYMENT=dev:famous-clownfish-44\n"));

  assert.equal(status, 1);
  assert.doesNotMatch(salida, /STUB npx/);
});

test("si el env file no existe, se explica cómo crearlo y no se despliega", () => {
  const { status, salida } = correr("/tmp/no-existe-rec88/.env.staging.local");

  assert.equal(status, 1);
  assert.match(salida, /no existe/);
  assert.match(salida, /convex deployment token create/);
  assert.doesNotMatch(salida, /STUB npx/);
});
