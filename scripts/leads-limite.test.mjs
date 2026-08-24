/**
 * REC-151 · La ventana deslizante del rate-limit del formulario público.
 *
 * Por qué merece test, y no es ceremonia:
 *
 *  1. **Un limiter roto no tira ninguna excepción.** Deja pasar todo, en silencio,
 *     y desde afuera se ve idéntico a uno que funciona — hasta el día que alguien
 *     te inunda la casilla o te quema la cuota de Resend. No hay ningún otro
 *     mecanismo en el sistema que avise de esto.
 *  2. **La frontera es una mutation PÚBLICA sin autenticar**, la primera del
 *     sistema. No hay sesión, no hay IP (`GenericMutationCtx` no expone nada de la
 *     request), no hay a quién responsabilizar: estos dos helpers son literalmente
 *     toda la defensa contra volumen.
 *  3. **Los dos bugs posibles son de un carácter**, `>` contra `>=`, y los dos son
 *     invisibles en producción: uno deja pasar un evento de más por ventana para
 *     siempre, el otro cuenta un evento ya vencido. Ninguno rompe nada visible.
 *
 * `convex/lib.ts` no importa nada, que es lo que permite cargarlo desde
 * `node --test` (mismo motivo que `scripts/numero-caso.test.mjs`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { podarEnvios, superaUmbral } from "../convex/lib.ts";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const AHORA = 1_700_000_000_000; // fijo: un limiter no se testea contra el reloj

// Los umbrales reales de `leads.crear`, para que el test hable del sistema y no
// de números inventados.
const UMBRALES_EMAIL = [
  { max: 2, ventanaMs: HORA },
  { max: 5, ventanaMs: DIA },
];

// ── podarEnvios ──────────────────────────────────────────────────────

test("poda lo que salió de la ventana y ordena ascendente", () => {
  const envios = [AHORA - 2 * HORA, AHORA - 10 * 1000, AHORA - 30 * HORA];
  assert.deepEqual(podarEnvios(envios, AHORA, DIA), [
    AHORA - 2 * HORA,
    AHORA - 10 * 1000,
  ]);
});

test("EL BORDE: un timestamp exactamente en el límite YA vencido no cuenta", () => {
  // Con `>=` en vez de `>` este evento seguiría contando un instante de más.
  // Es el bug de un carácter que ningún síntoma delata en producción.
  assert.deepEqual(podarEnvios([AHORA - DIA], AHORA, DIA), []);
  assert.deepEqual(podarEnvios([AHORA - DIA + 1], AHORA, DIA), [AHORA - DIA + 1]);
});

test("la lista queda acotada sola: la poda corre en cada intento, sin cron", () => {
  // 500 envíos viejos + 1 reciente ⇒ la fila que se persiste tiene 1, no 501.
  const viejos = Array.from({ length: 500 }, (_, i) => AHORA - DIA - i * 1000);
  assert.equal(podarEnvios([...viejos, AHORA - HORA], AHORA, DIA).length, 1);
});

// ── superaUmbral ─────────────────────────────────────────────────────

test("con menos envíos que el techo, deja pasar", () => {
  const envios = podarEnvios([AHORA - 10 * 1000], AHORA, DIA);
  assert.equal(superaUmbral(envios, AHORA, UMBRALES_EMAIL), false);
});

test("EL OTRO BORDE: con `max` envíos ya hechos, el que viene sería el max+1", () => {
  // Se evalúa ANTES de registrar el intento en curso, así que la comparación es
  // `>=`. Con `>` cada ventana dejaría pasar uno de más, para siempre.
  const dos = podarEnvios([AHORA - 20 * 1000, AHORA - 10 * 1000], AHORA, DIA);
  assert.equal(superaUmbral(dos, AHORA, UMBRALES_EMAIL), true);
});

test("la ventana corta corta aunque la diaria tenga lugar de sobra", () => {
  // 2 en la última hora ⇒ frenado por la de 1 h, con sólo 2 de 5 diarios usados.
  const envios = podarEnvios([AHORA - 30 * 60 * 1000, AHORA - 60 * 1000], AHORA, DIA);
  assert.equal(superaUmbral(envios, AHORA, UMBRALES_EMAIL), true);
});

test("la diaria corta el goteo lento que la ventana corta nunca vería", () => {
  // 5 envíos espaciados 3 h: ninguna hora tiene más de 1, y aun así está frenado.
  // Es exactamente el bombardeo espaciado que una sola ventana corta no atrapa.
  const goteo = [1, 2, 3, 4, 5].map((i) => AHORA - i * 3 * HORA);
  const envios = podarEnvios(goteo, AHORA, DIA);
  assert.equal(superaUmbral(envios, AHORA, [{ max: 2, ventanaMs: HORA }]), false);
  assert.equal(superaUmbral(envios, AHORA, UMBRALES_EMAIL), true);
});

test("la ventana desliza: pasada la hora, el mismo email vuelve a poder", () => {
  const envios = [AHORA - 2 * HORA, AHORA - 90 * 60 * 1000];
  const podados = podarEnvios(envios, AHORA, DIA);
  assert.equal(podados.length, 2, "siguen dentro de la ventana diaria");
  assert.equal(superaUmbral(podados, AHORA, UMBRALES_EMAIL), false);
});

// ── La asimetría del techo global ────────────────────────────────────
// Es la decisión de diseño menos obvia del ticket y la que más caro sale
// invertir: entre el techo blando y el duro se SIGUE guardando y se DEJA de
// mandar mail. Si alguien "unifica" los dos techos de buena fe, este test es lo
// único que lo dice antes de que un pico de tráfico haga desaparecer leads.

const TECHO_BLANDO = [{ max: 40, ventanaMs: HORA }];
const TECHO_DURO = [{ max: 300, ventanaMs: HORA }];

const enLaUltimaHora = (n) =>
  podarEnvios(
    Array.from({ length: n }, (_, i) => AHORA - (i + 1) * 1000),
    AHORA,
    HORA,
  );

test("bajo el techo blando: se guarda Y se avisa", () => {
  const envios = enLaUltimaHora(39);
  assert.equal(superaUmbral(envios, AHORA, TECHO_DURO), false, "se guarda");
  assert.equal(superaUmbral(envios, AHORA, TECHO_BLANDO), false, "se avisa");
});

test("entre blando y duro: SE GUARDA pero NO se avisa", () => {
  const envios = enLaUltimaHora(100);
  assert.equal(superaUmbral(envios, AHORA, TECHO_DURO), false, "se sigue guardando");
  assert.equal(superaUmbral(envios, AHORA, TECHO_BLANDO), true, "el aviso se apaga");
});

test("sobre el techo duro: tampoco se guarda", () => {
  const envios = enLaUltimaHora(300);
  assert.equal(superaUmbral(envios, AHORA, TECHO_DURO), true);
});
