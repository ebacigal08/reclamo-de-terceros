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
  if (!me || me.rol !== "agente") redirect(RUTAS.login);

  return (
    <ShellErrorBoundary>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar nombre={me.nombre} casosActivos={me.casosActivos} />
        <main style={{ flex: 1, background: "var(--bg-page)", minWidth: 0 }}>{children}</main>
      </div>
    </ShellErrorBoundary>
  );
}
