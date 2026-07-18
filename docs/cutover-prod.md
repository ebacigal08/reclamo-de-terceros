# Cutover a un deployment de producción de Convex (REC-72)

Runbook operativo. Se ejecuta **una vez**. Después de esto, Railway despliega front
y backend juntos y `hardy-impala-296` vuelve a ser un deployment de desarrollo.

## Por qué

Hoy producción corre sobre **`hardy-impala-296`, que es un deployment de tipo `dev`**
— el mismo al que apunta el `.env.local` del desarrollador. De ahí salen dos cosas:

1. **Railway nunca desplegó el backend.** El build viejo, si no encontraba
   `CONVEX_DEPLOY_KEY`, buildeaba sólo el front y salía **verde**. La variable nunca
   se seteó. Las funciones sólo llegaban a producción cuando alguien las publicaba a
   mano. Al mergear REC-71, Railway subió el front nuevo contra el backend viejo y
   `/agente/casos/nuevo` empezó a tirar un client-side exception: una `useQuery`
   contra una función inexistente **revienta el render**.
2. **Un `npx convex dev` local escribe en el backend que usan los clientes.**

`npx convex deploy` **no puede** apuntar a un deployment `dev` (su destino es el
deployment de producción del proyecto, o el de la deploy key). Por eso no alcanza con
"arreglar el deploy": hay que **migrar** a un deployment de producción de verdad.

---

## Antes de empezar

- [ ] **Estás en la rama de REC-72**, no en `main`. El deployment nuevo necesita las
      funciones con el fix de URLs de documentos (si no, ver "Landmines").
- [ ] Sabés el valor de `EMAIL_FROM` que hoy tiene `hardy-impala-296`.
- [ ] **Railway: no hay PR environments** que hereden `CONVEX_DEPLOY_KEY`. Si los
      hubiera, un build de PR publicaría funciones **en producción**.
- [ ] Elegiste el horario: **justo después de las 12:00 UTC** (ver "El doble cron").

> **Los flags de destino NO se llaman igual en todos los CLIs.** `convex env`,
> `export`, `import`, `run` y `data` usan **`--deployment <nombre>`** (o `--prod`).
> El CLI de `@convex-dev/auth` usa **`--deployment-name <nombre>`** (o `--prod`).
> Y `convex env` **sin flag sigue al `.env.local`** — durante el cutover vas a estar
> cambiando de lado, así que **poné el destino explícito en todos los comandos**.

---

## Landmines

Cosas que, si se olvidan, rompen **en silencio**.

| Variable (en el prod nuevo) | Valor | Si falta |
|---|---|---|
| `SILENCIAR_EMAILS_DAMNIFICADO` | `true` | 💣💣 **Ausente = emails ENCENDIDOS** (`convex/email.ts:70-77`; el default es fail-safe a propósito). El deployment nuevo empieza a mandarle los 4 avisos automáticos a **damnificados reales**. No se puede deshacer. **Es el riesgo #1 de este cutover.** |
| `SITE_URL` | `https://portal-reclamos.com` | 💣 Cae a `http://localhost:3000` (`convex/email.ts:36`) → **todos** los links de invitación, reset y notificación quedan inservibles. |
| `EMAIL_FROM` | el mismo valor que hardy | 💣 Cae a `onboarding@resend.dev`, que sólo entrega a la casilla dueña de la cuenta. |
| `RESEND_API_KEY` | el mismo valor que hardy | 💣 Las notificaciones **degradan a log en silencio**; el reset y la invitación fallan visiblemente (`sendEmailOrThrow`). |
| `JWT_PRIVATE_KEY` + `JWKS` | **generadas nuevas** | 💣 Auth muerta: tira en cada login. **Copiarlas de hardy no sirve**: el JWT se firma con el `CONVEX_SITE_URL` del deployment, así que los tokens viejos no validan igual. |
| `CONVEX_SITE_URL` | *(no tocar)* | La inyecta Convex sola (`convex/auth.config.ts:9`). |
| `SEED_ENABLED` · `DEPLOYMENT_ENV` | **NO SETEAR** | 💣 Arman `seed:seedDemo` (`convex/seed.ts:73-79`) y `generarInvitacionDemo` (`convex/invitaciones.ts:530`) **contra los datos reales**. Por esto **no se copia el env de un deployment a otro en bloque**. |

Y dos más, de procedimiento:

- 💣 **El export tiene que llevar `--include-file-storage`.** La app sube documentos a
  Convex File Storage. Sin ese flag, los blobs no viajan y los documentos migrados
  quedan rotos.
- 💣 **`NEXT_PUBLIC_CONVEX_URL` es build-time.** Cambiarla en Railway **sin rebuild**
  no hace absolutamente nada.

### Qué pasa con los usuarios

- **Las contraseñas sobreviven.** Los hashes viven en `authAccounts` (tabla normal,
  scrypt con el salt embebido) y viajan en el snapshot.
- **Las sesiones NO sobreviven.** Todos quedan deslogueados y tienen que volver a
  entrar. Es inevitable: el JWT se firma con el `CONVEX_SITE_URL` del deployment, y el
  cliente guarda el token indexado por la URL de Convex. **Avisales.**

---

## 0. Reconocimiento (no publica nada)

```bash
npx convex env list --prod --names-only    # ¿ya existe el prod? ¿está vacío?
npx convex deploy --dry-run                # imprime a QUÉ deployment iría, sin publicar
```

`--dry-run` es la red de seguridad. **Usalo antes de cada `deploy`.**

## 1. Desarmar el seed de producción (se puede hacer YA, sin esperar al cutover)

Hoy `hardy-impala-296` —o sea, producción— tiene `SEED_ENABLED` y `DEPLOYMENT_ENV`
seteadas. Eso deja el seed demo **armado contra los datos reales**: un
`npx convex run seed:seedDemo` desde cualquier laptop del equipo los inyecta.

```bash
npx convex env remove SEED_ENABLED   --deployment hardy-impala-296
npx convex env remove DEPLOYMENT_ENV --deployment hardy-impala-296
```

(Se re-setean en el paso 9, cuando hardy vuelva a ser un deployment de desarrollo.)

## 2. Publicar las funciones al prod nuevo

**Desde la rama de REC-72.** Esto deja el schema desplegado, que es **precondición del
import** (el backup no lleva ni código ni schema).

```bash
git switch tote08/rec-72-separar-staging-de-produccion-en-convex
npx convex deploy --dry-run
npx convex deploy --message "REC-72: primer deploy al prod real"
```

Anotá la URL que imprime: `https://<prod-nuevo>.convex.cloud`.

## 3. Env vars del prod nuevo

**Una por una.** No copies el env de hardy en bloque: te llevarías `SEED_ENABLED`.

```bash
npx convex env set --prod SITE_URL https://portal-reclamos.com
npx convex env set --prod SILENCIAR_EMAILS_DAMNIFICADO true
npx convex env set --prod EMAIL_FROM '<el mismo valor que hardy>'
```

El secreto, sin que pase por el historial del shell:

```bash
npx convex env get RESEND_API_KEY --deployment hardy-impala-296 \
  | npx convex env set --prod RESEND_API_KEY
```

Claves de auth **nuevas** (ojo: este CLI usa `--deployment-name`, no `--deployment`):

```bash
npx @convex-dev/auth --prod --web-server-url https://portal-reclamos.com
git status   # este CLI puede tocar archivos del repo: revertí lo que haya cambiado
```

### Gate — el chequeo que evita el desastre

```bash
npx convex env list --prod --names-only
```

Se verifica por **presencia/ausencia**, no por cantidad (Convex o el equipo pueden
agregar una variable legítima y no queremos un gate que grite en falso):

- **Tienen que estar:** `SITE_URL` · `SILENCIAR_EMAILS_DAMNIFICADO` · `EMAIL_FROM` ·
  `RESEND_API_KEY` · `JWT_PRIVATE_KEY` · `JWKS`
- **NO tienen que estar:** `SEED_ENABLED` · `DEPLOYMENT_ENV` · `SEED_AGENT_PASSWORD`

Si falta `SILENCIAR_EMAILS_DAMNIFICADO`, **frená acá**: el primer avance de etapa
después del cutover le escribe a un damnificado real.

## 4. Migrar los datos

Ventana de mantenimiento (~20 min). Avisá que no se use la app: **todo lo que se
escriba en hardy después del export se pierde.**

Censo previo (sandbox de sólo lectura, no escribe nada):

```bash
npx convex run --deployment hardy-impala-296 --inline-query \
  "const t=['casos','damnificados','agentes','documentos','mensajes','notificaciones','gestiones','plazos','pedidosDocumentacion','respuestasAseguradora','notasInternas','relatosSiniestro','chatEstado','resetEnvios','authAccounts']; const o={}; for (const n of t) o[n]=(await ctx.db.query(n).collect()).length; return o;"
```

Export **con los archivos** e import:

```bash
npx convex export --deployment hardy-impala-296 --include-file-storage \
  --path ~/amparo-snapshot-$(date +%Y%m%d-%H%M).zip

npx convex import --prod --replace-all ~/amparo-snapshot-<TS>.zip
```

Sin `-y`: leé el prompt. El import **no ejecuta funciones**, así que no dispara ni un
email. Preserva `_id`, `_creationTime` y los `_storage`, así que las referencias entre
tablas y los `storageId` siguen resolviendo.

Verificación:

```bash
npx convex run --prod --inline-query "<el mismo censo de arriba>"   # counts idénticos
npx convex data --prod _storage --limit 5                           # los blobs llegaron
npx convex run --deployment hardy-impala-296 --inline-query "<el mismo censo>"
```

Si los counts de hardy **crecieron** durante la ventana, alguien escribió: repetí
export + import.

## 5. Verificar el prod nuevo con el front local — ANTES de tocar Railway

```bash
NEXT_PUBLIC_CONVEX_URL=https://<prod-nuevo>.convex.cloud npm run dev
```

(Next no pisa las variables que ya vienen del shell, así que esto le gana al
`.env.local` sin tener que tocarlo.)

- [ ] Login del agente (la contraseña sobrevivió a la migración).
- [ ] La lista de casos muestra los datos migrados.
- [ ] Abrís una ficha con documentos.
- [ ] **Abrís un documento y mirás el host del link: tiene que ser `<prod-nuevo>`.**
      Si dice `hardy-impala-296`, las funciones desplegadas no tienen el fix de
      REC-72 → volvé al paso 2 y publicá desde la rama correcta.

Si algo de esto falla, **no pasó nada**: producción sigue intacta contra hardy.

## 6. Railway — alinear las dos puntas. NO SALTEAR

Sin este paso, el merge del paso 7 **falla el build**; y si cambiás una sola de las dos
variables, el runtime queda desalineado.

```bash
npx convex deployment token create railway-prod --prod
# imprime  prod:<deployment>|<secreto>  → es una credencial, tratala como tal
```

En el servicio `reclamo-de-terceros` de Railway:

| Variable | Valor |
|---|---|
| `CONVEX_DEPLOY_KEY` | la key recién generada |
| `NEXT_PUBLIC_CONVEX_URL` | `https://<prod-nuevo>.convex.cloud` |
| `ALLOW_FRONTEND_ONLY_BUILD` | **ausente** (si quedó de un rollback, borrala) |

**Las dos primeras tienen que apuntar al mismo deployment.** De ahora en más, el guard
del build (`scripts/verificar-deploy.mjs`) falla si no coinciden.

## 7. Mergear el PR

Railway buildea con `scripts/build.sh` y esta vez sí despliega Convex: front y backend
suben juntos, desde el mismo build.

**Leé los logs de build.** Tienen que decir `→ Desplegando Convex + buildeando el front`.
Si aparece `ERROR: falta CONVEX_DEPLOY_KEY` o el aviso de build-sólo-front, la key no
llegó: **abortá** (el build falla solo, producción no se toca).

## 8. Verificar en producción

- [ ] `https://portal-reclamos.com/agente/casos/nuevo` **carga** (es la página que
      rompió al mergear REC-71).
- [ ] Alta de un caso, de punta a punta.
- [ ] Un documento abre, y el host del link es `<prod-nuevo>`.
- [ ] El bundle público sirve la URL nueva:

```bash
curl -s https://portal-reclamos.com/login \
  | grep -oE '/_next/static/chunks/[^"]+\.js' | head -20 \
  | xargs -I{} curl -s https://portal-reclamos.com{} \
  | grep -oE 'https://[a-z0-9-]+\.convex\.cloud' | sort -u
```

> **Falso positivo conocido:** `happy-otter-123` aparece **siempre** en el bundle. No es
> una URL en uso: es el ejemplo que trae el mensaje de error de la librería Convex.

Avisá que **todos quedaron deslogueados**.

## 9. Devolver hardy a ser un deployment de desarrollo

Dentro de las **24 h** (ver "El doble cron"), y una vez que ya no vayas a hacer rollback:

```bash
npx convex env remove RESEND_API_KEY --deployment hardy-impala-296
npx convex env set SITE_URL       http://localhost:3000 --deployment hardy-impala-296
npx convex env set DEPLOYMENT_ENV dev  --deployment hardy-impala-296
npx convex env set SEED_ENABLED   true --deployment hardy-impala-296
```

Sacarle `RESEND_API_KEY` es lo que **corta su cron emailero**.

Después, cuando hardy deje de ser el respaldo: limpiarle los datos reales (re-seed),
para no tener dos copias de datos personales dando vueltas.

---

## 💣 El doble cron

Después del cutover, **hardy sigue vivo** — con los datos reales, con `RESEND_API_KEY`,
con `SITE_URL=portal-reclamos.com` y con su cron diario `alertas-de-plazos`
(`convex/crons.ts`, 12:00 UTC). Los mismos `plazos` existen en los **dos** deployments
con `avisadoAlAgente=false`, así que **el agente recibe cada alerta de vencimiento dos
veces**.

Mitigación: hacer el cutover **justo después de las 12:00 UTC** (te deja ~24 h de
margen) y correr el paso 9 dentro de esa ventana.

## Rollback

Sirve **mientras nadie haya escrito en el prod nuevo**. Decidilo en minutos u horas, no
en días: después hay que migrar en sentido inverso (`export --prod` →
`import --deployment hardy-impala-296 --replace-all`).

En Railway:

1. `NEXT_PUBLIC_CONVEX_URL` → `https://hardy-impala-296.convex.cloud`
2. **Borrar** `CONVEX_DEPLOY_KEY`
3. `ALLOW_FRONTEND_ONLY_BUILD=1`
4. Redeploy

Eso restaura exactamente el estado previo: build sólo-front contra hardy, que sigue
intacto con sus datos. Si ya corriste el paso 9, devolvele también `RESEND_API_KEY` y
`SITE_URL`.

> ⚠️ **`ALLOW_FRONTEND_ONLY_BUILD=1` es TEMPORAL: borrala apenas termine el rollback.**
> Es, literalmente, el bypass que causó el incidente de REC-71 — mientras esté puesta,
> el build vuelve a publicar front sin backend. Hay dos frenos: el guard **falla** si la
> encuentra junto con `CONVEX_DEPLOY_KEY`, y el paso 6 te obliga a confirmar que no
> quedó seteada.

**No borres el prod nuevo ni el snapshot** hasta que el rollback deje de ser una opción.
