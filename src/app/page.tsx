import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@convex/_generated/api";
import { RUTAS } from "@/lib/constants";

/**
 * Resolver post-login: lee la sesión y manda a la pantalla principal según
 * rol. Fail-closed: sin sesión / error / rol no resuelto → login.
 * (Las llamadas a `redirect` van FUERA del try/catch: `redirect` lanza
 * internamente y un catch la tragaría.)
 *
 * ⚠️ Es `switch` exhaustivo y no una cadena de `if`, por REC-91.
 *
 * Éste es el único consumidor de `me` que usa campos SIN discriminar antes por
 * `rol` (`onboardingCompletado`), y el tipo que infiere Convex para un retorno
 * con varias formas le da a CADA miembro de la unión TODAS las claves, con
 * `?: undefined` en las que no le corresponden. O sea: `me.onboardingCompletado`
 * compila sobre los cuatro miembros y el typecheck NO avisa nada si aparece un
 * rol nuevo sin manejar. (Verificado: sacar la rama `sin_acceso` deja el
 * typecheck en verde.)
 *
 * Y lo que pasa cuando falta una rama no es una pantalla fea, es un bucle
 * infinito: el rol no manejado cae en la rama del damnificado con
 * `onboardingCompletado === undefined` → `/damnificado/onboarding` →
 * `OnboardingView` ve `rol !== "damnificado"` y hace `router.replace("/")` →
 * vuelve acá. Para siempre.
 *
 * El `never` del final es el backstop que el tipo no da solo: si `users.me`
 * suma un rol y nadie lo agrega a este switch, esto deja de compilar.
 */
export default async function Home() {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.me, {}, { token }).catch(() => null);

  if (!me) redirect(RUTAS.login);

  switch (me.rol) {
    // El agente desactivado sigue AUTENTICADO (la baja no toca sus
    // credenciales), así que el `!me` de arriba no lo atrapa y el middleware lo
    // devuelve acá cada vez que intenta ir a /login. Ésta es la rama que corta
    // el bucle: /sin-acceso no redirige a ningún lado.
    case "sin_acceso":
      redirect(RUTAS.sinAcceso);
    case "agente":
      redirect(RUTAS.agente.casos);
    case "damnificado":
      redirect(
        me.onboardingCompletado
          ? RUTAS.damnificado.miCaso
          : RUTAS.damnificado.onboarding,
      );
    // El `never` va en el `default` y no después del switch: TypeScript narrowea
    // por exclusión de los literales ya manejados DENTRO del default, mientras que
    // al salir del switch pierde el narrowing (medido: ahí `me` vuelve a la unión
    // entera, null incluido, y el chequeo daría un falso rojo).
    default: {
      const rolNoManejado: never = me;
      throw new Error(
        `users.me devolvió un rol que este resolver no maneja: ${JSON.stringify(rolNoManejado)}`,
      );
    }
  }
}
