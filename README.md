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

- **Convex** NO se hostea en Railway: corre en **Convex Cloud**. Se despliega con `npx convex deploy`.
- **Railway** hostea la app **Next.js**. El build de producción despliega Convex y luego buildea Next en un solo paso:

  ```
  npx convex deploy --cmd 'npm run build'
  ```

  (ya configurado en `railway.json`).

- **Variables en Railway** (servicio):
  - `CONVEX_DEPLOY_KEY` — clave de deploy de **producción** de Convex (dashboard → Settings → Deploy Keys). El build (`convex deploy --cmd`) la usa e inyecta `NEXT_PUBLIC_CONVEX_URL` en el build.
  - `NEXT_PUBLIC_CONVEX_URL` — URL del deployment de **producción** de Convex (persistente, la usa el runtime de middleware/server).
- **Variables en el deployment de PRODUCCIÓN de Convex** (dashboard de Convex, NO Railway):
  - Convex Auth: `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` (= dominio público de Railway). Se generan con `npx @convex-dev/auth` apuntando a producción.
  - **NO** setear `SEED_ENABLED` ni `DEPLOYMENT_ENV=dev`: así el seed demo (`convex/seed.ts`) queda bloqueado en prod.

### Pasos para publicar

1. `git push` a GitHub (rama `main`).
2. Convex **producción**: `npx convex deploy` una vez y `npx @convex-dev/auth` (genera claves de auth + `SITE_URL` = dominio de Railway).
3. En Railway: New Project → Deploy from GitHub repo (rama `main`).
4. Setear en el servicio `CONVEX_DEPLOY_KEY` y `NEXT_PUBLIC_CONVEX_URL` (URL de Convex prod).
5. Railway usa el build/start de `railway.json`. A partir de ahí, **auto-deploy en cada push a `main`**.

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
