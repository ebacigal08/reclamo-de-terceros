"use client";

import { Component, CSSProperties, ReactNode } from "react";
import { LogOut } from "lucide-react";
import { RUTAS } from "@/lib/constants";
import { EmptyState } from "@/components/ui";

/**
 * Error boundary del shell del Agente. Debe ser PADRE del `Sidebar` (que hace
 * `useQuery(api.notificaciones.listAgente)`) y del `<main>`: el layout es un
 * server component y no puede atrapar por sí solo los errores de render del
 * cliente. Espeja a `MiCasoErrorBoundary` del lado damnificado.
 *
 * El vector concreto es cerrar sesión: `signOut()` limpia el token y React
 * re-renderiza el árbol aún montado ANTES de que `router.replace` navegue; si una
 * live query lanza en esa ventana, sin esta guarda tumba todo el shell y aparece
 * la pantalla de error de Next. El link del fallback es `<a>` (recarga dura) a
 * propósito: sale limpio de cualquier estado transitorio de auth/query.
 */
export class ShellErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "56px 24px",
            background: "var(--bg-page)",
          }}
        >
          <EmptyState
            icon={<LogOut size={26} strokeWidth={1.5} />}
            title="No pudimos cargar el panel"
            description="Puede que tu sesión haya expirado. Volvé a ingresar para continuar."
            action={
              <a href={RUTAS.login} style={linkStyle}>
                Volver a ingresar
              </a>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

const linkStyle: CSSProperties = {
  color: "var(--text-link)",
  fontWeight: 600,
  fontSize: "var(--text-body-size)",
};
