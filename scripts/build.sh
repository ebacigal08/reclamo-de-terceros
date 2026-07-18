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
