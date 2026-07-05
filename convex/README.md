# convex/ — Backend y base de datos

Funciones y esquema de [Convex](https://docs.convex.dev). La base de datos vive en Convex Cloud, no en Railway.

## Comandos

```bash
npx convex dev      # desarrollo: sincroniza schema + funciones, genera _generated/
npx convex deploy   # producción (lo corre Railway vía railway.json)
```

## Archivos

- `schema.ts` — esquema completo del MVP (tablas y enums). Espejo del modelo de datos del PRD / REC-16.
- `casos.ts` — funciones de ejemplo (`listByAgente`, `get`, `crear`) para arrancar.
- `_generated/` — **generado** por `npx convex dev`. No se versiona ni se edita a mano. Hasta correrlo por primera vez, los imports de `./_generated/*` marcan error de tipos: es esperado.

## Convenciones

- Cada documento tiene `_id` y `_creationTime` automáticos (no definimos `id` ni la mayoría de los `creadoEn`).
- Los enums se modelan con `v.union(v.literal(...))` y deben coincidir con `src/lib/constants.ts`.
- Relaciones vía `v.id("tabla")` + índices `by_*` para las queries frecuentes.
