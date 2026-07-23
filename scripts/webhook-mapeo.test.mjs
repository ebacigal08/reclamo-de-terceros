/**
 * REC-74 · Mapeo de los tipos de evento del webhook de Resend.
 *
 * Corre con `npm test` (`node --test`). Sin dependencias: Node ejecuta el módulo
 * TypeScript directo (type stripping nativo), y `convex/resendWebhook.ts` no
 * importa nada, así que se puede cargar fuera del runtime de Convex.
 *
 * Vive en `scripts/` y NO en `convex/` a propósito: el bundler de Convex levanta
 * todo lo que hay en `convex/` al publicar, y un test que importa `node:test`
 * ahí adentro rompería el deploy.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { mapearTipo } from "../convex/resendWebhook.ts";

test("una casilla SUPRIMIDA cuenta como no-entrega (el caso de REC-73)", () => {
  // Este es el modo de falla que originó REC-74: Resend acepta el envío, devuelve
  // un id y descarta el mail en silencio. Si no se mapea, la fila de entrega queda
  // sin desenlace para siempre y NUNCA se dispara `AVISO_NO_ENTREGADO`.
  assert.equal(mapearTipo("email.suppressed"), "failed");
});

test("los desenlaces de Resend se mapean a nuestro tipo", () => {
  assert.equal(mapearTipo("email.delivered"), "delivered");
  assert.equal(mapearTipo("email.bounced"), "bounced");
  assert.equal(mapearTipo("email.complained"), "complained");
  assert.equal(mapearTipo("email.failed"), "failed");
});

test("lo irrelevante o ilegible se ignora, no se adivina", () => {
  // El handler responde 200 ante `null` para que Resend no reintente al pedo.
  assert.equal(mapearTipo("email.sent"), null);
  assert.equal(mapearTipo("email.opened"), null);
  assert.equal(mapearTipo("contact.created"), null);
  assert.equal(mapearTipo(undefined), null);
  assert.equal(mapearTipo(null), null);
  assert.equal(mapearTipo(42), null);
  assert.equal(mapearTipo({ type: "email.bounced" }), null);
});
