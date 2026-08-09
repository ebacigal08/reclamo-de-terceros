import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@convex/_generated/api";
import { RUTAS } from "@/lib/constants";
import { Sidebar } from "@/components/layout/Sidebar";
import { ShellErrorBoundary } from "@/components/layout/ShellErrorBoundary";

/**
 * Shell del Agente — registro denso, desktop, sidebar navy (design system Amparo).
 *
 * Guard de rol (server, fail-closed): sin sesión de agente → login. Es sólo UX;
 * la seguridad real está en cada query/mutation de Convex.
 */
export default async function AgenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.me, {}, { token }).catch(() => null);
  // REC-91 · La rama del desactivado va ANTES del fail-closed a /login, y no
  // después: por /login terminaría igual en /sin-acceso (vía el middleware y el
  // resolver `/`), pero con dos saltos de más y explicándole "ingresá de nuevo"
  // a alguien cuyo problema no se arregla ingresando de nuevo.
  if (me?.rol === "sin_acceso") redirect(RUTAS.sinAcceso);
  if (!me || me.rol !== "agente") redirect(RUTAS.login);

  return (
    <ShellErrorBoundary>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar casosActivos={me.casosActivos} />
        <main style={{ flex: 1, background: "var(--bg-page)", minWidth: 0 }}>{children}</main>
      </div>
    </ShellErrorBoundary>
  );
}
