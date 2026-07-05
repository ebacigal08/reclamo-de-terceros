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

- Variables en Railway:
  - `CONVEX_DEPLOY_KEY` — clave de deploy de producción de Convex (dashboard → Settings → Deploy Keys). El comando de arriba inyecta `NEXT_PUBLIC_CONVEX_URL` en el build.

### Pasos para publicar

1. `git push` a GitHub.
2. En Railway: New Project → Deploy from GitHub repo.
3. Setear `CONVEX_DEPLOY_KEY` en las variables del servicio.
4. Railway usa el build/start de `railway.json`. Listo.

## Estructura

```
convex/                     # Backend Convex (base de datos)
  schema.ts                 # Esquema completo del MVP (REC-16)
  casos.ts                  # Funciones de ejemplo (list / get / crear)
  _generated/               # Lo crea `npx convex dev` (no versionar)
src/
  app/
    layout.tsx              # Fuentes (Inter/JetBrains Mono) + ConvexProvider
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

## Pendiente (próximos pasos)

- **Autenticación** (REC-17): elegir approach (p. ej. Convex Auth con password) y wirearlo con las tablas `agentes` / `damnificados`. Hoy está stubeado.
- **Portar componentes Amparo** a `src/components/ui/` (Button, Badge, Input, Card, etc.).
- Construir cada pantalla reemplazando su `Placeholder`.
