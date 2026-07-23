#!/usr/bin/env bash
#
# Build de Railway (REC-72). Regla: se despliegan FRONT Y BACKEND JUNTOS, o no se
# despliega nada.
#
# Antes, este archivo era un one-liner dentro de railway.json que, si faltaba
# CONVEX_DEPLOY_KEY, buildeaba SOLO el front y salía verde. Eso hacía que cada push
# publicara un front nuevo contra el backend viejo: así se rompió el alta de casos
# al mergear REC-71 (una useQuery contra una función inexistente revienta el render).
# Un deploy a medias no vuelve a pasar por silencio: ahora falla.
#
set -euo pipefail

# ── Guard de PR environments (REC-85) ───────────────────────────────────────
# Railway crea un environment EFÍMERO por cada PR, y nace clonando las variables
# de production — CONVEX_DEPLOY_KEY incluida. Sin este guard, cada push a una
# rama con PR abierto corría `convex deploy` y publicaba el backend EN
# PRODUCCIÓN: sin merge, sin revisión y sin que nadie lo notara. No es teórico —
# el backend de REC-74 estuvo vivo en prod dos días antes de mergearse, y se
# descubrió de casualidad. Salió gratis porque su schema era aditivo; un cambio
# de firma habría roto el front de prod, que es el incidente de REC-71.
#
# Acá se buildea SÓLO el front: es lo correcto para un preview, que además
# apunta al backend de prod por la NEXT_PUBLIC_CONVEX_URL que heredó. NO se
# falla a propósito (como sí se hace cuando falta la deploy key): un check rojo
# en el PR empuja a "arreglarlo" devolviendo la key, que es justo lo que este
# guard existe para evitar.
#
# Si RAILWAY_ENVIRONMENT_NAME no está (build local, o Railway renombra la
# variable), no se cambia nada: sólo se saltea el deploy cuando SABEMOS que el
# environment no es production. El toggle de PR environments de Railway se puede
# volver a prender en cualquier momento; esto vive en el repo y no.
if [ -n "${RAILWAY_ENVIRONMENT_NAME:-}" ] && [ "${RAILWAY_ENVIRONMENT_NAME}" != "production" ]; then
  echo "→ Environment '${RAILWAY_ENVIRONMENT_NAME}' ≠ production: build SOLO del front."
  echo "→ El backend de Convex NO se despliega desde un PR environment (REC-85)."
  exec npm run build
fi

if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  # La URL de RUNTIME (la que Railway tiene seteada y que lee el middleware del
  # server) hay que capturarla ACÁ, porque `convex deploy --cmd-url-env-var-name`
  # pisa NEXT_PUBLIC_CONVEX_URL con la del deployment que acaba de desplegar.
  # Sin esta captura, verificar-deploy.mjs no tiene contra qué comparar y el
  # desalineamiento front/backend vuelve a ser invisible.
  export RAILWAY_CONVEX_URL="${NEXT_PUBLIC_CONVEX_URL:-}"

  echo "→ Desplegando Convex + buildeando el front (deploy key presente)."
  exec npx convex deploy \
    --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL \
    --cmd 'npm run build'
fi

if [ "${ALLOW_FRONTEND_ONLY_BUILD:-}" = "1" ]; then
  # Escotilla de ROLLBACK, no modo de operación. Ver README (§ Rollback).
  echo "AVISO: build SOLO del front (ALLOW_FRONTEND_ONLY_BUILD=1)." >&2
  echo "AVISO: el backend de Convex NO se despliega. Es una escotilla temporal:" >&2
  echo "AVISO: borrá la variable apenas termines el rollback." >&2
  exec npm run build
fi

echo "ERROR: falta CONVEX_DEPLOY_KEY." >&2
echo "" >&2
echo "Sin esa variable el backend de Convex NO se despliega, y el front quedaría" >&2
echo "corriendo contra las funciones viejas (REC-72: así se rompió producción al" >&2
echo "mergear REC-71). El build falla a propósito en vez de publicar a medias." >&2
echo "" >&2
echo "Arreglo: seteá CONVEX_DEPLOY_KEY en el servicio de Railway, apuntando al" >&2
echo "MISMO deployment que NEXT_PUBLIC_CONVEX_URL. Ver docs/cutover-prod.md." >&2
exit 1
