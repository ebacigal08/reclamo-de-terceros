/**
 * REC-150 · Modo pruebas: mientras `EMAILS_DAMNIFICADO_SOLO_A` esté puesta, los avisos
 * automáticos al damnificado salen SÓLO a esas casillas. Esa lectura ES el guard.
 *
 * Por qué merece test propio: producción está en pruebas CON UN CLIENTE REAL ADENTRO
 * (`Way Maker`, SIN-2026-00010, conviviendo con el damnificado de prueba). Lo que este
 * archivo protege es que ese cliente no reciba un email mientras se prueba la
 * plataforma — y un email mandado no se deshace.
 *
 * Los dos invariantes, que no se leen solos en un `size === 0 ||`:
 *
 *   1. la variable AUSENTE no restringe nada (no es "no recibe nadie");
 *   2. es una ALLOWLIST: un typo deja a esa persona SIN aviso, nunca se lo manda a
 *      quien no correspondía. La dirección de falla es todo el diseño.
 *
 * Corre con `npm test` (`node --test`), sin dependencias, por la misma razón que
 * `email-copia.test.mjs`: `convex/email.ts` no importa nada. Vive en `scripts/` y no en
 * `convex/` porque el bundler de Convex levanta todo lo que hay ahí al publicar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { VAR_SOLO_A, damnificadoPuedeRecibir } from "../convex/email.ts";

const CLIENTE_REAL = "asesoresbeps@gmail.com"; // Way Maker — el que NO debe recibir
const DE_PRUEBA = "ebacigalpsn@gmail.com"; // Esteban — el que SÍ

/** Corre `fn` con la env var en `valor` (`undefined` = ausente) y la restaura. */
function con(valor, fn) {
  const previo = process.env[VAR_SOLO_A];
  if (valor === undefined) delete process.env[VAR_SOLO_A];
  else process.env[VAR_SOLO_A] = valor;
  try {
    fn();
  } finally {
    if (previo === undefined) delete process.env[VAR_SOLO_A];
    else process.env[VAR_SOLO_A] = previo;
  }
}

test("sin la variable NO se restringe a nadie: la feature es inerte", () => {
  // La asimetría que hay que fijar: set vacío significa "sin restricción", NO "no recibe
  // nadie". Si se invirtiera, la variable ausente apagaría los avisos de todo el sistema.
  con(undefined, () => {
    assert.equal(damnificadoPuedeRecibir(DE_PRUEBA), true);
    assert.equal(damnificadoPuedeRecibir(CLIENTE_REAL), true);
  });
});

test("una lista vacía o de puras comas tampoco restringe", () => {
  for (const v of ["", "   ", ",", " , , "]) {
    con(v, () => assert.equal(damnificadoPuedeRecibir(CLIENTE_REAL), true));
  }
});

test("con la lista puesta, sólo recibe quien está en ella", () => {
  // El caso de producción, y el motivo entero de la issue.
  con(DE_PRUEBA, () => {
    assert.equal(damnificadoPuedeRecibir(DE_PRUEBA), true);
    assert.equal(damnificadoPuedeRecibir(CLIENTE_REAL), false);
  });
});

test("tolera espacios, mayúsculas y varias casillas", () => {
  // Se escribe a mano en una consola: el formato exacto no puede decidir quién recibe.
  con(`  ${DE_PRUEBA.toUpperCase()} , otro@estudio.com `, () => {
    assert.equal(damnificadoPuedeRecibir(DE_PRUEBA), true);
    assert.equal(damnificadoPuedeRecibir(" Otro@Estudio.com "), true);
    assert.equal(damnificadoPuedeRecibir(CLIENTE_REAL), false);
  });
});

test("un typo deja SIN aviso al de prueba; NUNCA se lo manda al cliente real", () => {
  // La propiedad que justifica que sea allowlist y no blocklist. Con una blocklist, este
  // mismo typo se lo mandaba al cliente real: silencioso e irreversible. Acá el error se
  // paga con un aviso que no llega, que se nota y se arregla.
  con("ebacigalpsn@gmial.com", () => {
    assert.equal(damnificadoPuedeRecibir(DE_PRUEBA), false);
    assert.equal(damnificadoPuedeRecibir(CLIENTE_REAL), false);
  });
});
