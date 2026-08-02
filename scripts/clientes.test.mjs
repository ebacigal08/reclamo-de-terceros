/**
 * REC-90 · Las tres reglas de la sección Clientes que pueden fallar EN SILENCIO.
 *
 * Ninguna de las tres tira un error cuando se rompe, y ése es exactamente el
 * motivo por el que merecen test:
 *
 *  1. `agruparClientes` — un cliente cuyo último caso se cerró tiene que SEGUIR
 *     en la agenda. Si el llamador consulta `casos.by_agente` con
 *     `.eq("cerrado", false)` (copiando `casos.listMine`), la persona desaparece
 *     de la lista sin ningún síntoma. Es la regresión más probable de la feature.
 *  2. `resolucionEmail` — el guard de identidad. Un falso `BLOQUEADO` rompe el
 *     guardado de nombre y teléfono, que están permitidos siempre; un falso
 *     `CAMBIA` deja mover el login de una cuenta activada, que es el modo de
 *     falla feo (el damnificado entra y ve la app entera cerrada).
 *  3. `conflictoDeEmail` — copiar el `length > 1` del alta daría verde sobre el
 *     propio email por el motivo equivocado, y dejaría pasar el pisotón de uno
 *     ajeno.
 *
 * Corre con `npm test` (`node --test`), sin dependencias: Node ejecuta el módulo
 * TypeScript directo y `convex/lib.ts` no importa nada, así que se puede cargar
 * fuera del runtime de Convex. Que `lib.ts` siga sin importar nada es lo que
 * mantiene vivo este test.
 *
 * Vive en `scripts/` y NO en `convex/` a propósito: el bundler de Convex levanta
 * todo lo que hay en `convex/` al publicar, y un test que importa `node:test` ahí
 * adentro rompería el deploy. (Mismo criterio que `email-copia.test.mjs`.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  agruparClientes,
  conflictoDeEmail,
  esEmailValido,
  resolucionEmail,
} from "../convex/lib.ts";

// ── agruparClientes ──────────────────────────────────────────────

/** Caso mínimo con la forma que consume el helper. */
function caso(damnificadoId, cerrado, creadoEn) {
  return { damnificadoId, cerrado, _creationTime: creadoEn };
}

test("un cliente con SÓLO casos cerrados sigue siendo un cliente", () => {
  // LA aserción de la feature. Una agenda que pierde gente al cerrarle el último
  // caso es peor que no tener agenda: el agente confía en que están todos.
  const r = agruparClientes([caso("dam1", true, 100), caso("dam1", true, 200)]);

  assert.equal(r.size, 1);
  assert.deepEqual(r.get("dam1"), {
    abiertos: 0,
    cerrados: 2,
    ultimoCasoEn: 200,
  });
});

test("cuenta abiertos y cerrados por separado, y agrupa por persona", () => {
  const r = agruparClientes([
    caso("dam1", false, 300),
    caso("dam1", true, 100),
    caso("dam2", false, 200),
  ]);

  assert.equal(r.size, 2);
  assert.deepEqual(r.get("dam1"), {
    abiertos: 1,
    cerrados: 1,
    ultimoCasoEn: 300,
  });
  assert.deepEqual(r.get("dam2"), {
    abiertos: 1,
    cerrados: 0,
    ultimoCasoEn: 200,
  });
});

test("ultimoCasoEn es el MÁXIMO, no el último que llegó en el array", () => {
  // El índice `by_agente` no ordena por fecha de creación, así que los casos
  // llegan en cualquier orden. Quedarse con el `_creationTime` del último
  // elemento daría una fecha arbitraria y desordenaría la lista entera.
  const r = agruparClientes([
    caso("dam1", false, 500),
    caso("dam1", false, 100),
  ]);

  assert.equal(r.get("dam1").ultimoCasoEn, 500);
});

test("sin casos no hay clientes (el agente nuevo ve la lista vacía)", () => {
  assert.equal(agruparClientes([]).size, 0);
});

// ── resolucionEmail ──────────────────────────────────────────────

test("cuenta activada + email DISTINTO = bloqueado (el guard de identidad)", () => {
  assert.equal(
    resolucionEmail({
      cuentaActivada: true,
      emailActual: "juan@mail.com",
      emailNuevo: "juan.nuevo@mail.com",
    }),
    "BLOQUEADO_CUENTA_ACTIVADA",
  );
});

test("cuenta activada + email IGUAL = sin cambio, NO bloqueado", () => {
  // El caso que parece un detalle y no lo es: una pestaña abierta desde antes de
  // la activación manda el email tal cual lo leyó. Tratarlo como intento de
  // cambio rompería el guardado de nombre y teléfono, que sí se pueden editar
  // siempre. El control está en el test de arriba: con un email distinto SÍ
  // bloquea, así que este verde no es por "nunca bloquea".
  assert.equal(
    resolucionEmail({
      cuentaActivada: true,
      emailActual: "juan@mail.com",
      emailNuevo: "juan@mail.com",
    }),
    "SIN_CAMBIO",
  );
});

test("email omitido = 'no lo toqué', con la cuenta activada o sin activar", () => {
  for (const cuentaActivada of [true, false]) {
    assert.equal(
      resolucionEmail({ cuentaActivada, emailActual: "juan@mail.com" }),
      "SIN_CAMBIO",
    );
  }
});

test("sin activar + email distinto = cambia (el caso que el ticket viene a resolver)", () => {
  // Corregir un email mal tipeado en el alta. Acá no hay `authAccounts` ni
  // `users` que migrar, que es lo que lo hace barato y seguro.
  assert.equal(
    resolucionEmail({
      cuentaActivada: false,
      emailActual: "jaun@mail.com",
      emailNuevo: "juan@mail.com",
    }),
    "CAMBIA",
  );
});

// ── conflictoDeEmail ─────────────────────────────────────────────

test("mi propio email no es conflicto conmigo mismo (guardado idempotente)", () => {
  assert.equal(
    conflictoDeEmail({
      agentesConEseEmail: 0,
      damnificadosConEseEmail: ["dam1"],
      propioId: "dam1",
    }),
    null,
  );
});

test("el email de OTRO damnificado sí es conflicto", () => {
  // Mismo input que el test de arriba salvo el dueño de la fila: es el par
  // control/tratamiento sobre el mismo mecanismo.
  assert.equal(
    conflictoDeEmail({
      agentesConEseEmail: 0,
      damnificadosConEseEmail: ["dam2"],
      propioId: "dam1",
    }),
    "OTRO_DAMNIFICADO",
  );
});

test("un email de agente gana sobre todo lo demás", () => {
  // La unicidad es GLOBAL entre las dos tablas: es el invariante que sostiene
  // `resolveRole`, que hace fail-closed si un email matchea en las dos.
  assert.equal(
    conflictoDeEmail({
      agentesConEseEmail: 1,
      damnificadosConEseEmail: ["dam1"],
      propioId: "dam1",
    }),
    "AGENTE",
  );
});

test("un email libre no es conflicto", () => {
  assert.equal(
    conflictoDeEmail({
      agentesConEseEmail: 0,
      damnificadosConEseEmail: [],
      propioId: "dam1",
    }),
    null,
  );
});

test("un duplicado preexistente entre damnificados se detecta igual", () => {
  // La tabla no tiene unicidad forzada por índice, sólo guards de aplicación, así
  // que una fila duplicada heredada no puede hacer pasar la edición por válida.
  assert.equal(
    conflictoDeEmail({
      agentesConEseEmail: 0,
      damnificadosConEseEmail: ["dam1", "dam2"],
      propioId: "dam1",
    }),
    "OTRO_DAMNIFICADO",
  );
});

// ── esEmailValido ────────────────────────────────────────────────

test("acepta lo que aceptaba el alta y rechaza lo mismo que rechazaba", () => {
  // Este regex ahora es COMPARTIDO con `casos.crearRegistro`: el test fija que la
  // extracción no cambió el criterio de la frontera que ya estaba en producción.
  for (const ok of ["juan@mail.com", "a.b+c@sub.dominio.com.ar"]) {
    assert.equal(esEmailValido(ok), true, ok);
  }
  for (const mal of ["", "pepe", "pepe@sinpunto", "pepe @mail.com", "@mail.com"]) {
    assert.equal(esEmailValido(mal), false, mal);
  }
});
