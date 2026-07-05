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

## Puesta en marcha local (Auth + seed demo)

Requiere una cuenta de Convex. Pasos:

```bash
# 1) Conectá el deployment y generá _generated + .env.local
npx convex dev            # dejalo corriendo; setea NEXT_PUBLIC_CONVEX_URL / CONVEX_DEPLOYMENT

# 2) Configurá Convex Auth: genera y setea JWT_PRIVATE_KEY, JWKS y SITE_URL
#    en el env del deployment (NO en .env.local)
npx @convex-dev/auth

# 3) Habilitá el seed SÓLO en dev y sembrá datos demo
npx convex env set SEED_ENABLED true
npx convex env set DEPLOYMENT_ENV dev
# opcional: npx convex env set SEED_AGENT_PASSWORD <tu-pass-de-dev>
npx convex run seed:seedDemo

# 4) Levantá la app
npm run dev               # http://localhost:3000 → /login
```

Agente demo: **agente@amparo.ar** / `reclamo2026` (o `SEED_AGENT_PASSWORD`).

Verificación end-to-end:
- Login OK → `/agente/casos` con los casos sembrados (badges de etapa/prioridad, orden por prioridad, vencimiento próximo/vencido en color).
- Credenciales inválidas → "Email o contraseña incorrectos".
- Sin sesión, `/agente/casos` redirige a `/login`; logout desde el sidebar vuelve a `/login`.

## Convenciones

- Cada documento tiene `_id` y `_creationTime` automáticos (no definimos `id` ni la mayoría de los `creadoEn`).
- Los enums se modelan con `v.union(v.literal(...))` y deben coincidir con `src/lib/constants.ts`.
- Relaciones vía `v.id("tabla")` + índices `by_*` para las queries frecuentes.
