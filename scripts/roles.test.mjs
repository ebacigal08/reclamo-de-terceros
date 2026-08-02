/**
 * REC-91 · Los defaults derivados de `rol` y `activo`, que son lo único de este
 * ticket que puede fallar EN SILENCIO.
 *
 * Los dos campos son `v.optional` en el schema y lo van a seguir siendo: Convex
 * valida contra los datos existentes al hacer push, así que requerirlos en una
 * tabla que ya tiene filas en prod y staging falla el push. Como no se rellenan
 * por migración, **el default ES el comportamiento** para toda fila anterior a
 * REC-91 — que hoy son TODAS las de los tres deployments.
 *
 * Por qué merecen test:
 *
 *  1. `esAgenteActivo` es **fail-OPEN** (ausente ⇒ activo), único en un repo que
 *     es fail-closed en todo lo demás. Es correcto —lo contrario le cierra la app
 *     al único agente de producción en el instante del deploy— pero es
 *     exactamente el tipo de cosa que un lector futuro "arregla" de buena fe.
 *     Este test es lo único que lo dice antes de que lo demuestre el deploy.
 *  2. `rolDeAgente` invertido regala la administración del estudio a todo el
 *     mundo el día que se publique el campo, sin un solo error que lo delate.
 *  3. Ninguna de las dos fallas tira una excepción: producen una app que anda,
 *     con los permisos al revés.
 *
 * Corre con `npm test` (`node --test`), sin dependencias: Node ejecuta el módulo
 * TypeScript directo y `convex/lib.ts` no importa nada, así que se puede cargar
 * fuera del runtime de Convex. Que `lib.ts` siga sin importar nada es lo que
 * mantiene vivo este test.
 *
 * Vive en `scripts/` y NO en `convex/` a propósito: el bundler de Convex levanta
 * todo lo que hay en `convex/` al publicar, y un test que importa `node:test` ahí
 * adentro rompería el deploy. (Mismo criterio que `clientes.test.mjs`.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { rolDeAgente, esAdmin, esAgenteActivo } from "../convex/lib.ts";

// ── rolDeAgente / esAdmin ────────────────────────────────────────

test("rolDeAgente: el campo AUSENTE deriva a 'agente', nunca a 'admin'", () => {
  // La fila de producción de hoy: nombre + email, y nada más. Si esto diera
  // "admin", publicar el campo repartiría la administración del estudio.
  assert.equal(rolDeAgente({}), "agente");
  assert.equal(esAdmin({}), false);
});

test("rolDeAgente: el campo PRESENTE manda (control de los de arriba)", () => {
  // Sin este control, un helper que devolviera "agente" SIEMPRE pasaría el test
  // anterior por el motivo equivocado.
  assert.equal(rolDeAgente({ rol: "admin" }), "admin");
  assert.equal(esAdmin({ rol: "admin" }), true);
  assert.equal(rolDeAgente({ rol: "agente" }), "agente");
  assert.equal(esAdmin({ rol: "agente" }), false);
});

test("esAdmin: los dos valores del rol son distinguibles entre sí", () => {
  // Que el ausente y el degradado a mano coincidan es correcto y esperado; lo que
  // no puede pasar es que admin y agente colapsen en el mismo booleano.
  assert.notEqual(esAdmin({ rol: "admin" }), esAdmin({ rol: "agente" }));
});

// ── esAgenteActivo ───────────────────────────────────────────────

test("esAgenteActivo: el campo AUSENTE deriva a ACTIVO (fail-open deliberado)", () => {
  // ⚠️ Si este test se pone rojo, NO lo ajustes al código: el código está mal.
  // Todas las filas de agentes de dev, staging y prod son anteriores a REC-91 y
  // no tienen `activo`. Un default `false` acá le cierra la app entera al único
  // agente de producción, en el mismo push, sin aviso y sin error.
  assert.equal(esAgenteActivo({}), true);
});

test("esAgenteActivo: sólo el `false` EXPLÍCITO cierra la puerta", () => {
  // El tratamiento del test anterior: si los dos dieran true, "ausente ⇒ activo"
  // estaría pasando por vacío y una desactivación real no haría nada.
  assert.equal(esAgenteActivo({ activo: false }), false);
  assert.equal(esAgenteActivo({ activo: true }), true);
});

test("esAgenteActivo: no es `!!activo` — el ausente y el false NO son lo mismo", () => {
  // La implementación ingenua (`!!agente.activo`) pasa los dos tests de arriba
  // salvo el del campo ausente. Esta aserción deja escrito el porqué: son dos
  // estados con significados opuestos, no dos formas de decir "no".
  assert.notEqual(esAgenteActivo({}), esAgenteActivo({ activo: false }));
});
