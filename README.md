# Amparo — CRM Siniestros AR

CRM que acompaña a personas damnificadas en su reclamo ante la aseguradora, y le da al agente las herramientas para gestionar múltiples casos. Dos roles: **Agente** (desktop, denso) y **Damnificado** (mobile, cálido).

- **Producto / PRD:** Notion → `crm - prd 2`
- **Tareas:** Linear → proyecto `CRM-MVP` (REC-16 a REC-38)
- **Diseño:** `Design/nuevo-prototipo-reclamos/` (prototipo Amparo, referencia visual) + `Design/Amparo-Design-System.md`

## Stack

- **Next.js 15** (App Router, TypeScript, `src/`)
- **Convex** — base de datos + backend reactivo
- **Tailwind CSS v4** + tokens del design system **Amparo** (CSS custom properties)
- **lucide-react** — íconos
- Deploy: **Railway** (Next.js) + **Convex Cloud** (base de datos)

## Puesta en marcha (local)

```bash
npm install

# 1) Convex: crea el proyecto/deployment y genera convex/_generated + la env.
#    Dejalo corriendo en una terminal (sincroniza el schema y las funciones).
npx convex dev

# 2) Next.js en otra terminal
npm run dev
```

Copiá `.env.example` a `.env.local`. `npx convex dev` completa `NEXT_PUBLIC_CONVEX_URL` automáticamente la primera vez.

## Arquitectura de deploy

**Convex** no se hostea en Railway: corre en **Convex Cloud**. **Railway** hostea la app **Next.js** y, en el mismo build, despliega las funciones de Convex.

### Los tres deployments

| Deployment | Tipo | Para qué | Quién lo despliega |
|---|---|---|---|
| producción | `prod` | Lo que usan los clientes (`portal-reclamos.com`) | **Railway**, en cada push a `main` |
| `staging` | `prod` | Probar cambios de backend **antes** de mergear | `npm run deploy:staging` |
| dev (`hardy-impala-296`) | `dev` | El sandbox de cada desarrollador | `npx convex dev` |

> **Regla: `npx convex dev` nunca toca producción.** Hasta REC-72 sí la tocaba — el deployment `dev` del desarrollador *era* el backend de producción. Si volvés a ver un `.env.local` apuntando al deployment que sirve a los clientes, algo se rompió.

### La invariante del deploy: front y backend, juntos o nada

El build corre `bash scripts/build.sh` (ver `railway.json`), que:

1. Con `CONVEX_DEPLOY_KEY` → despliega las funciones de Convex y buildea el front **contra ese mismo deployment** (`convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'`).
2. Sin ella → **falla**. A propósito.

Ese `exit 1` es el corazón de REC-72. Antes, el build sin deploy key buildeaba sólo el front y salía **verde**: cada push publicaba un front nuevo contra el backend viejo. Así se rompió el alta de casos al mergear REC-71 (una `useQuery` contra una función inexistente revienta el render). Un deploy a medias ya no puede pasar por silencio.

**Variables en el servicio de Railway** — las dos tienen que apuntar **al mismo deployment**:

- `CONVEX_DEPLOY_KEY` — a qué deployment se publican las funciones.
- `NEXT_PUBLIC_CONVEX_URL` — la que lee el **runtime** del server (`src/middleware.ts`). El bundle del cliente la recibe inyectada por el deploy; el server la lee del entorno. Si las dos no coinciden, **el cliente le habla a un backend y el middleware a otro**: `scripts/verificar-deploy.mjs` corre como `prebuild` y falla el build si eso pasa.
- `ALLOW_FRONTEND_ONLY_BUILD` — **escotilla de rollback, no un modo de operación.** Con `=1` el build vuelve a publicar sólo el front, sin backend. Existe para poder volver atrás un cutover; **borrala apenas termines**. El guard falla si la encuentra junto con `CONVEX_DEPLOY_KEY`.

**Variables en el deployment de Convex** (dashboard de Convex o `npx convex env set`, **no** Railway):

- Convex Auth: `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` (= dominio público). Se generan **por deployment** con `npx @convex-dev/auth`.
- Email: `RESEND_API_KEY`, `EMAIL_FROM` (remitente de un dominio verificado).
- `SILENCIAR_EMAILS_DAMNIFICADO` *(opcional, REC-71)* — `true` silencia los avisos automáticos por email al damnificado (caso abierto, avance de etapa, nuevo pedido, caso cerrado). Sirve para operar el CRM con datos reales sin escribirle solo al cliente. **Ausente = emails encendidos.** No afecta los emails al agente ni el reset de contraseña. **Sobre la invitación:** no la bloquea, pero define el default del checkbox del alta — con el flag puesto, un alta que no lo tilde no invita, y el damnificado queda sin acceso hasta que le mandes la invitación (o el link) desde la ficha. Una invitación explícita se envía siempre. Se prende y apaga sin redeploy: `npx convex env set|remove SILENCIAR_EMAILS_DAMNIFICADO`.
- **NO** setear `SEED_ENABLED` ni `DEPLOYMENT_ENV=dev` en producción: son el doble guard que bloquea el seed demo (`convex/seed.ts`). Por lo mismo, **nunca copies el env de un deployment a otro en bloque**.

> ⚠️ `npx convex env set` **sin flag de destino sigue al `.env.local`**. Poné siempre `--prod` o `--deployment <nombre>`. (Ojo: el CLI de `@convex-dev/auth` usa `--deployment-name`, no `--deployment`.)

### Probar un cambio de backend antes de mergear

`.env.staging.local` (no se versiona) tiene la deploy key de `staging`:

```bash
npm run deploy:staging                                              # publica las funciones a staging
NEXT_PUBLIC_CONVEX_URL=https://<staging>.convex.cloud npm run dev   # front local contra staging
```

Next no pisa las variables que ya vienen del shell, así que eso le gana al `.env.local` sin tener que tocarlo.

### Cutover a producción

El paso de "producción vive en un deployment `dev`" a la topología de arriba está en **[`docs/cutover-prod.md`](docs/cutover-prod.md)**: secuencia, landmines, rollback y verificación.

## Estructura

```
convex/                     # Backend Convex (base de datos)
  schema.ts                 # Esquema del MVP (REC-16) + authTables
  auth.ts, http.ts          # Convex Auth (provider Password) — REC-17
  users.ts                  # resolveRole + query `me` (rol por email)
  casos.ts                  # listMine (sesión) / get (ownership) / crearInterno
  seed.ts                   # Datos demo dev-only (doble guard)
  _generated/               # Lo (re)genera convex; versionado para typechecar
src/
  app/
    layout.tsx              # Fuentes (Inter/JetBrains Mono) + Convex Auth provider
    globals.css             # Tailwind v4 + tokens Amparo
    page.tsx                # Redirige a /login
    login/                  # REC-54 / REC-17
    (agente)/agente/        # Registro Agente (sidebar navy)
      casos/                # Lista · Nuevo · Ficha · Solicitar · Cerrar
    (damnificado)/damnificado/  # Registro Damnificado (mobile)
      onboarding/ mi-caso/ relato/ documentos/ pedido/[id]/
  components/
    providers/              # ConvexClientProvider
    ui/                     # Componentes del design system Amparo (a portar)
  lib/
    constants.ts            # Enums, labels, 7 preguntas del relato, rutas
    format.ts               # Fechas DD/MM/AAAA, estado de plazos, etc.
  styles/
    amparo.css              # Tokens + keyframes
    tokens/                 # colors, typography, spacing, radii, elevation…
```

## Mapa de pantallas → Linear

| Pantalla | Ruta | Issues |
|---|---|---|
| Login | `/login` | REC-54 · REC-17 |
| Lista de casos | `/agente/casos` | REC-55 · REC-18 · REC-36 |
| Nuevo caso | `/agente/casos/nuevo` | REC-57 · REC-19 · REC-38 |
| Ficha del caso | `/agente/casos/[id]` | REC-56 · REC-20 · REC-37 |
| Solicitar documentación | `/agente/casos/[id]/solicitar` | REC-58 · REC-24 |
| Cerrar caso | `/agente/casos/[id]/cerrar` | REC-59 · REC-30 |
| Onboarding | `/damnificado/onboarding` | REC-60 · REC-26 |
| Mi caso | `/damnificado/mi-caso` | REC-61 · REC-27 |
| Relato del siniestro | `/damnificado/relato` | REC-62 · REC-22 |
| Carga de documentos | `/damnificado/documentos` | REC-63 · REC-23 |
| Responder pedido | `/damnificado/pedido/[id]` | REC-64 · REC-25 |

## Estado

**Implementado (esta entrega):**
- **Autenticación** con **Convex Auth** (login por rol, protección de rutas, logout) — REC-17 core. Setup local en `convex/README.md`.
- **Pantalla principal del Agente**: Lista de casos con datos reales de Convex — REC-18.
- **Sidebar / navegación** del agente y componentes base del design system (Button, Input, Alert, Badge, EmptyState, Skeleton).

**Pendiente (próximos pasos):**
- Verificar un dominio propio en Resend para el email en producción — hoy el envío usa el remitente de prueba `onboarding@resend.dev` (sólo entrega a la casilla de la cuenta). Invitación, reset de contraseña y notificaciones ya están cableados con email real (REC-28 · REC-65).
- Resto de pantallas (ficha, nuevo caso, flujos del damnificado) reemplazando cada `Placeholder`.
