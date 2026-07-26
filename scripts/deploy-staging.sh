#!/usr/bin/env bash
#
# Publica las funciones de Convex en STAGING (REC-88).
#
# Antes esto era un one-liner en package.json —`convex deploy --env-file
# .env.staging.local`— y publicaba en el lugar EQUIVOCADO. El CLI elige el
# destino así:
#
#   • con CONVEX_DEPLOY_KEY  → el deployment asociado a esa key   ← lo que queremos
#   • con CONVEX_DEPLOYMENT  → el PROD POR DEFECTO DEL PROYECTO   ← lo que pasaba
#
# `.env.staging.local` tenía sólo CONVEX_DEPLOYMENT, así que caía en la segunda
# regla: un `npm run deploy:staging` apuntaba a wary-oyster-919, el prod del
# proyecto amparo-e2e-rec71. No era producción real (tame-cardinal-367), pero el
# script hacía algo distinto de lo que decía su nombre y nada lo detectaba. Sólo
# se salvó porque el prompt de confirmación no corre en terminal no interactiva;
# en una terminal normal, un `y` lo publicaba.
#
# Por eso este guard: si falta la key, se FALLA en vez de desplegar a ciegas. Es
# el mismo criterio que scripts/build.sh (REC-72/REC-85) — un deploy al lugar
# equivocado no puede pasar por silencio.
#
set -euo pipefail

ENV_FILE="${1:-.env.staging.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: no existe $ENV_FILE." >&2
  echo "" >&2
  echo "Ese archivo elige el deployment de staging y NO se versiona" >&2
  echo "(.gitignore). Crealo con la deploy key:" >&2
  echo "" >&2
  echo "  npx convex deployment token create staging \\" >&2
  echo "    --deployment famous-clownfish-44 --save-env $ENV_FILE" >&2
  exit 1
fi

# El guard. Se mira el ARCHIVO y no el entorno a propósito: `convex deploy
# --env-file` lee de ahí, así que es el archivo el que decide el destino.
if ! grep -qE '^[[:space:]]*CONVEX_DEPLOY_KEY=.' "$ENV_FILE"; then
  echo "ERROR: $ENV_FILE no tiene CONVEX_DEPLOY_KEY." >&2
  echo "" >&2
  echo "Sin esa key, 'convex deploy' NO publica en staging: se va al prod por" >&2
  echo "defecto del proyecto (REC-88). El deploy se cancela a propósito." >&2
  echo "" >&2
  echo "Arreglo — generá la key de staging (queda guardada en el archivo, que" >&2
  echo "está gitignored):" >&2
  echo "" >&2
  echo "  npx convex deployment token create staging \\" >&2
  echo "    --deployment famous-clownfish-44 --save-env $ENV_FILE" >&2
  echo "" >&2
  echo "Fallback manual, sin key: 'npx convex dev --once --env-file $ENV_FILE'" >&2
  echo "publica bien, pero REPUNTA .env.local al deployment de staging — hay que" >&2
  echo "respaldarlo y restaurarlo a mano." >&2
  exit 1
fi

echo "→ Publicando las funciones de Convex en staging ($ENV_FILE)."
exec npx convex deploy --env-file "$ENV_FILE"
