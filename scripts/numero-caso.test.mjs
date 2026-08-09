/**
 * REC-99 · La elección del correlativo de `numeroCaso`, que es lo único de este
 * ticket que puede fallar EN SILENCIO.
 *
 * Por qué merece test:
 *
 *  1. El bug que este código repara ya estaba vivo: `generarNumeroCaso` calculaba
 *     el correlativo CONTANDO filas (`delAnio.length + 1`). Borrar un caso baja el
 *     conteo y el próximo alta REUSA un número ya emitido. **Convex no tiene
 *     índices únicos**, así que el duplicado entra sin que nada lo frene y quedan
 *     dos casos con el mismo `SIN-…` — uno de ellos ya archivado en la cabeza del
 *     cliente. No hay excepción, no hay log: la app anda.
 *  2. La primera corrección REINTRODUJO el bug por otra puerta (lo encontró
 *     auditoría): tomaba el último del rango y, si su sufijo no era numérico,
 *     caía a `0` → emitía `00001`, un número ya emitido. De ahí que `null` y `0`
 *     tengan que ser cosas distintas.
 *
 * **Qué malformado usar en los tests** (segunda observación de auditoría): la
 * query acota el rango a `< SIN-AAAA-999999`, así que un sufijo que arranca con
 * letra —`SIN-2026-zzz`— **nunca llega al helper**; usarlo de ejemplo prometía
 * una mecánica que no existe. Los malformados REALES son los que arrancan con
 * dígito y traen basura después (`SIN-2026-00012abc`, `SIN-2026-0001A`) y el
 * sufijo vacío (`SIN-2026-`). Verificado: los tres entran al rango y los tres
 * daban `NaN` o `0` en la versión anterior.
 *
 * `convex/lib.ts` no importa nada, que es lo que permite cargarlo desde `node
 * --test` (mismo motivo que `scripts/roles.test.mjs`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maximoCorrelativo, RE_CORRELATIVO } from "../convex/lib.ts";

const P = "SIN-2026-";

test("de una tanda descendente devuelve el mayor correlativo", () => {
  assert.equal(maximoCorrelativo([`${P}00010`, `${P}00009`, `${P}00001`], P), 10);
});

test("sin candidatos devuelve null (no 0): el llamador distingue vacío de corrupto", () => {
  assert.equal(maximoCorrelativo([], P), null);
});

test("EL CASO DE AUDITORÍA: un malformado por encima del máximo NO gana", () => {
  // `00012abc` ordena por encima de `00010` y da NaN: es exactamente el que hacía
  // caer al fallback de 0 → `00001`, un número ya emitido. Y a diferencia de
  // `${P}zzz`, éste SÍ entra al rango de la query.
  assert.equal(maximoCorrelativo([`${P}00012abc`, `${P}00010`, `${P}00009`], P), 10);
});

test("el sufijo VACÍO tampoco gana (daba 0, no NaN — otra puerta al mismo bug)", () => {
  assert.equal(maximoCorrelativo([`${P}00010`, `${P}`], P), 10);
});

test("varios malformados seguidos tampoco tapan al máximo válido", () => {
  assert.equal(
    maximoCorrelativo([`${P}00012abc`, `${P}0001A`, `${P}123`, `${P}00007`], P),
    7,
  );
});

test("si NINGUNO es válido devuelve null, para que el llamador falle cerrado", () => {
  assert.equal(maximoCorrelativo([`${P}00012abc`, `${P}0001A`], P), null);
});

test("un sufijo que no tiene 5 dígitos NO es un correlativo del sistema", () => {
  // Ni de menos ni de más: el formato es exacto, porque de él depende que el
  // orden lexicográfico coincida con el numérico.
  assert.equal(maximoCorrelativo([`${P}123`, `${P}00009`], P), 9);
  assert.equal(maximoCorrelativo([`${P}000100`, `${P}00009`], P), 9);
});

test("el correlativo se lee en base 10, no en octal", () => {
  // `Number("00008")` es 8; un `parseInt` descuidado con radix 8 daría NaN.
  assert.equal(maximoCorrelativo([`${P}00008`], P), 8);
  assert.equal(maximoCorrelativo([`${P}00010`], P), 10);
});

test("el regex del correlativo no acepta signos, espacios ni vacío", () => {
  for (const malo of ["", " 0001", "0001 ", "+0001", "-0001", "0001", "000001"]) {
    assert.equal(RE_CORRELATIVO.test(malo), false, `deberia rechazar ${JSON.stringify(malo)}`);
  }
  assert.equal(RE_CORRELATIVO.test("00001"), true);
});

test("el prefijo se recorta por longitud: otro año no contamina", () => {
  // La query ya acota el rango a un año; esto documenta que el helper asume ese
  // contrato y no re-valida el prefijo.
  assert.equal(maximoCorrelativo([`SIN-2027-00003`], "SIN-2027-"), 3);
});
