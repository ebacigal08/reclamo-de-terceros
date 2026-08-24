/**
 * Taxonomía de tipos de siniestro. **Fuente ÚNICA**, compartida por el backend
 * Convex (`./tiposSiniestro`) y el front (`@convex/tiposSiniestro`, re-exportado
 * desde `src/lib/constants.ts`). Mismo patrón —y mismo motivo— que
 * `tiposDocumento.ts`.
 *
 * REC-151 · Nace de una duplicación real que ya estaba viva: el mismo `v.union`
 * de cinco literales estaba escrito DOS veces en el backend —`convex/schema.ts`
 * y `convex/casos.ts`— más una tercera copia de la lista con labels en
 * `src/lib/constants.ts`. Tres fuentes para una taxonomía que tiene que ser una.
 *
 * Por qué importa y no es prolijidad: agregar un sexto tipo de siniestro exigía
 * acordarse de los tres lugares, y **el typecheck no decía nada si te olvidabas
 * de uno**. El validador del schema y el de `casos` podían divergir y la mutation
 * seguía compilando: el arg entraba por el validador de `casos`, la escritura
 * chocaba contra el del schema y el alta fallaba en RUNTIME, en producción, con
 * un error de validación de documento. Con una sola fuente eso deja de ser
 * posible por construcción.
 *
 * Módulo PLANO a propósito: sólo importa `v`/`Infer` de `convex/values`
 * (isomórfico, browser-safe) — **nada de `convex/server` ni runtime de Convex** —
 * para que el bundle del navegador sea seguro.
 */
import { v, type Infer } from "convex/values";

/** Orden de presentación: es el que ve el agente en el alta y el visitante en la landing. */
export const TIPOS_SINIESTRO = [
  { value: "ACCIDENTE", label: "Accidente" },
  { value: "ROBO", label: "Robo" },
  { value: "INCENDIO", label: "Incendio" },
  { value: "INUNDACION", label: "Inundación" },
  { value: "OTRO", label: "Otro" },
] as const;

export type TipoSiniestro = (typeof TIPOS_SINIESTRO)[number]["value"];

/** `value → label`, para mostrar un tipo ya guardado sin recorrer la lista. */
export const TIPO_SINIESTRO_LABEL = Object.fromEntries(
  TIPOS_SINIESTRO.map((t) => [t.value, t.label]),
) as Record<TipoSiniestro, string>;

// Validador explícito (convención del repo — tipos limpios).
export const tipoSiniestroValidator = v.union(
  v.literal("ACCIDENTE"),
  v.literal("ROBO"),
  v.literal("INCENDIO"),
  v.literal("INUNDACION"),
  v.literal("OTRO"),
);

// Check de sincronía en COMPILACIÓN: si `tipoSiniestroValidator` y
// `TIPOS_SINIESTRO` divergen (en cualquier sentido), este `true` deja de tipar y
// `npm run typecheck` falla. Mismo patrón que `tiposDocumento.ts`.
type _SyncTipoSin = [TipoSiniestro] extends [Infer<typeof tipoSiniestroValidator>]
  ? [Infer<typeof tipoSiniestroValidator>] extends [TipoSiniestro]
    ? true
    : never
  : never;
const _tipoSinSync: _SyncTipoSin = true;
void _tipoSinSync;
