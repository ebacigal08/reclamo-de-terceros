/**
 * REC-154 · Guard: nunca puede haber DOS páginas resolviendo a `/`.
 *
 * `src/app/page.tsx` y `src/app/(marketing)/page.tsx` producen los dos la ruta
 * `/` —un route group entre paréntesis NO agrega segmento a la URL— y Next falla
 * el build con "two parallel pages resolve to the same path".
 *
 * El costo de ese error es que aparece TARDE: el typecheck y el lint pasan, y
 * revienta recién en `next build`, o peor, en Railway después del merge. Este
 * test lo baja a `npm test`, que corre en segundos.
 *
 * A propósito mira el FILESYSTEM y no invoca a Next: el objetivo es justamente
 * no depender del build para saber la respuesta. Si algún día se agrega un
 * tercer candidato a `/`, va en la lista de abajo.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Todo archivo que, de existir, sirve la ruta `/`. */
const CANDIDATOS_RAIZ = [
  "src/app/page.tsx",
  "src/app/(marketing)/page.tsx",
];

function existentes() {
  return CANDIDATOS_RAIZ.filter((rel) => existsSync(join(RAIZ, rel)));
}

test("exactamente UNA página resuelve a `/`", () => {
  const hay = existentes();
  assert.equal(
    hay.length,
    1,
    hay.length > 1
      ? `Dos páginas resuelven a "/" y el build de Next va a fallar con "two parallel pages resolve to the same path". Borrá una: ${hay.join(", ")}`
      : `Ninguna página resuelve a "/": la raíz del sitio quedaría en 404. Candidatos buscados: ${CANDIDATOS_RAIZ.join(", ")}`,
  );
});

test("el guard sigue vigilando los dos candidatos (control)", () => {
  // Un guard que compara una lista contra sí misma pasa siempre. Este control
  // fija el piso: con menos de dos candidatos, el test de arriba no puede
  // detectar una colisión ni aunque exista.
  assert.ok(CANDIDATOS_RAIZ.length >= 2, "el guard sólo tiene sentido con 2+ candidatos");
});
