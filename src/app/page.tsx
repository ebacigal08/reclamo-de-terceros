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
 */
export default async function Home() {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.me, {}, { token }).catch(() => null);

  if (!me) redirect(RUTAS.login);
  if (me.rol === "agente") redirect(RUTAS.agente.casos);
  redirect(me.onboardingCompletado ? RUTAS.damnificado.miCaso : RUTAS.damnificado.onboarding);
}
