/**
 * REC-84 · La casilla de copia se lee de una env var, y ESA lectura es el guard.
 *
 * Por qué merece test propio: la copia se manda a donde diga `EMAIL_COPIA_AVISOS`,
 * y un typo ahí (o una variable seteada a `"true"` por costumbre de la otra) haría
 * que el sistema empiece a mandar avisos a una dirección inválida. En la cuenta de
 * Resend eso se paga con rebotes y una supresión — literalmente la enfermedad de
 * REC-73, que dejó al agente meses sin recibir nada, en silencio.
 *
 * Corre con `npm test` (`node --test`), sin dependencias: Node ejecuta el módulo
 * TypeScript directo (type stripping nativo) y `convex/email.ts` no importa nada, así
 * que se puede cargar fuera del runtime de Convex. Que siga sin importar nada es
 * justamente lo que mantiene vivo este test.
 *
 * Vive en `scripts/` y NO en `convex/` a propósito: el bundler de Convex levanta
 * todo lo que hay en `convex/` al publicar, y un test que importa `node:test` ahí
 * adentro rompería el deploy. (Mismo criterio que `webhook-mapeo.test.mjs`.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { VAR_COPIA, direccionCopia } from "../convex/email.ts";

/** Corre `fn` con la env var en `valor` (`undefined` = ausente) y la restaura. */
function con(valor, fn) {
  const previo = process.env[VAR_COPIA];
  if (valor === undefined) delete process.env[VAR_COPIA];
  else process.env[VAR_COPIA] = valor;
  try {
    fn();
  } finally {
    if (previo === undefined) delete process.env[VAR_COPIA];
    else process.env[VAR_COPIA] = previo;
  }
}

test("sin la variable no hay copia: la feature es inerte", () => {
  // El default seguro. Es además el CONTROL de la verificación en staging: con la
  // variable sin setear, el comportamiento tiene que ser idéntico al de antes.
  con(undefined, () => assert.equal(direccionCopia(), null));
});

test("una variable vacía o en blanco tampoco es una casilla", () => {
  con("", () => assert.equal(direccionCopia(), null));
  con("   ", () => assert.equal(direccionCopia(), null));
});

test("se recorta el espacio de sobra (típico de copiar y pegar en la consola)", () => {
  // Sólo trim: bajar a minúsculas es tarea del único punto que COMPARA direcciones
  // (`enviarCopia`, que pasa las dos por `normalizeEmail`). Acá lo que importa es que
  // un espacio pegado de más no convierta la dirección en un destino inválido.
  con("  Respaldo@Estudio.com  ", () =>
    assert.equal(direccionCopia(), "Respaldo@Estudio.com"),
  );
});

test("lo que no parece una dirección NO se usa: ante la duda, sin copia", () => {
  // El caso peor: mandar avisos a un destino basura ensucia la cuenta de Resend con
  // rebotes y supresiones (REC-73). Perder la copia es siempre menos malo — la copia
  // es redundancia; la cuenta de correo, no.
  con("true", () => assert.equal(direccionCopia(), null));
  con("1", () => assert.equal(direccionCopia(), null));
  con("casilla-del-estudio", () => assert.equal(direccionCopia(), null));
});

test("una dirección válida se devuelve tal cual", () => {
  con("respaldo@estudio.com", () =>
    assert.equal(direccionCopia(), "respaldo@estudio.com"),
  );
});
