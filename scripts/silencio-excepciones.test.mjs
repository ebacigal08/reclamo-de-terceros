/**
 * REC-149 · El interruptor de avisos al damnificado dejó de ser todo-o-nada: una lista
 * de motivos puede exceptuarse del silencio. Esa lectura ES el guard.
 *
 * Por qué merece test propio: la variable decide, para cada aviso, si le llega o no un
 * email a un CLIENTE REAL. Un error acá no se paga con un log raro, se paga escribiéndole
 * de más a alguien —y eso no se deshace—. Los dos invariantes que sostienen el diseño no
 * son evidentes leyendo el `||`, así que se fijan acá:
 *
 *   1. la lista SÓLO SUMA: con el interruptor maestro apagado nada puede silenciarse;
 *   2. un typo SILENCIA, no destapa: un motivo mal escrito se queda apagado.
 *
 * Corre con `npm test` (`node --test`), sin dependencias: Node ejecuta el módulo
 * TypeScript directo (type stripping nativo) y `convex/email.ts` no importa nada, así
 * que se puede cargar fuera del runtime de Convex. Que siga sin importar nada es
 * justamente lo que mantiene vivo este test.
 *
 * Vive en `scripts/` y NO en `convex/` a propósito: el bundler de Convex levanta todo lo
 * que hay en `convex/` al publicar, y un test que importa `node:test` ahí adentro
 * rompería el deploy. (Mismo criterio que `email-copia.test.mjs`.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  VAR_SILENCIO,
  VAR_EXCEPCIONES,
  avisoAlDamnificadoActivo,
} from "../convex/email.ts";

/** Los otros tres avisos automáticos al damnificado. Ninguno debe salir por accidente. */
const OTROS = ["CASO_ABIERTO", "AVANCE_ETAPA", "CASO_CERRADO"];

/**
 * Corre `fn` con las DOS variables seteadas (`undefined` = ausente) y las restaura.
 * Van juntas a propósito: lo que se prueba es siempre la combinación de las dos, nunca
 * una sola — el maestro es el que define si la lista tiene algo que hacer.
 */
function con({ silencio, excepto }, fn) {
  const previos = {
    [VAR_SILENCIO]: process.env[VAR_SILENCIO],
    [VAR_EXCEPCIONES]: process.env[VAR_EXCEPCIONES],
  };
  const setear = (nombre, valor) => {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  };
  setear(VAR_SILENCIO, silencio);
  setear(VAR_EXCEPCIONES, excepto);
  try {
    fn();
  } finally {
    setear(VAR_SILENCIO, previos[VAR_SILENCIO]);
    setear(VAR_EXCEPCIONES, previos[VAR_EXCEPCIONES]);
  }
}

test("sin la variable de excepciones, el silencio sigue siendo total: la feature es inerte", () => {
  // El default seguro, y el CONTROL de la verificación: con el código desplegado pero la
  // variable sin setear, el comportamiento tiene que ser idéntico al de antes de REC-149.
  con({ silencio: "true", excepto: undefined }, () => {
    assert.equal(avisoAlDamnificadoActivo("NUEVO_PEDIDO"), false);
    for (const motivo of OTROS) assert.equal(avisoAlDamnificadoActivo(motivo), false);
  });
});

test("una lista vacía, en blanco o de puras comas tampoco exceptúa nada", () => {
  for (const excepto of ["", "   ", ",", " , , "]) {
    con({ silencio: "true", excepto }, () =>
      assert.equal(avisoAlDamnificadoActivo("NUEVO_PEDIDO"), false),
    );
  }
});

test("exceptuar NUEVO_PEDIDO deja pasar ESE aviso y ningún otro", () => {
  // El caso de producción. El valor de esta feature está tanto en lo que enciende como
  // en lo que sigue apagado: si los otros tres salieran, sería lo mismo que borrar el
  // interruptor maestro y no haría falta nada de esto.
  con({ silencio: "true", excepto: "NUEVO_PEDIDO" }, () => {
    assert.equal(avisoAlDamnificadoActivo("NUEVO_PEDIDO"), true);
    for (const motivo of OTROS) assert.equal(avisoAlDamnificadoActivo(motivo), false);
  });
});

test("tolera espacios y minúsculas, y acepta varios motivos", () => {
  // Se escribe a mano en una consola (`npx convex env set --prod ...`): el formato exacto
  // no puede ser la diferencia entre avisar y no avisar.
  con({ silencio: "true", excepto: " nuevo_pedido , CASO_CERRADO " }, () => {
    assert.equal(avisoAlDamnificadoActivo("NUEVO_PEDIDO"), true);
    assert.equal(avisoAlDamnificadoActivo("CASO_CERRADO"), true);
    assert.equal(avisoAlDamnificadoActivo("CASO_ABIERTO"), false);
    assert.equal(avisoAlDamnificadoActivo("AVANCE_ETAPA"), false);
  });
});

test("un typo SILENCIA, no destapa: ante la duda no le escribimos al cliente", () => {
  // La dirección de falla es al revés que la de `emailsAlDamnificadoActivos` (que ante un
  // valor irreconocible asume ACTIVOS, para caer en el comportamiento histórico). Acá el
  // default seguro es el otro: un dedazo no puede estrenar un email contra un cliente real.
  for (const excepto of ["NUEVO_PEDIDOS", "nuevo pedido", "true", "NUEVO-PEDIDO"]) {
    con({ silencio: "true", excepto }, () =>
      assert.equal(avisoAlDamnificadoActivo("NUEVO_PEDIDO"), false),
    );
  }
});

test("la lista SÓLO SUMA: con el interruptor maestro apagado no silencia nada", () => {
  // El riesgo conceptual más importante de la feature. Una lista poblada NO puede leerse
  // como "mandá solamente estos": si el maestro no está puesto, los cuatro avisos salen,
  // estén o no en la lista. Que sea un `||` y no un `&&` es exactamente esto.
  for (const silencio of [undefined, "false", "0", ""]) {
    con({ silencio, excepto: "NUEVO_PEDIDO" }, () => {
      assert.equal(avisoAlDamnificadoActivo("NUEVO_PEDIDO"), true);
      for (const motivo of OTROS) assert.equal(avisoAlDamnificadoActivo(motivo), true);
    });
  }
});
