"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { FolderKanban, LogOut } from "lucide-react";
import { RUTAS } from "@/lib/constants";
import { iniciales } from "@/lib/format";

/**
 * Botonera / navegación del Agente (design system Amparo · registro denso).
 * Los datos (nombre, casos activos) los provee el layout server desde `me`.
 */
export function Sidebar({
  nombre,
  casosActivos,
}: {
  nombre: string;
  casosActivos: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const activo = pathname?.startsWith("/agente/casos") ?? false;

  async function cerrarSesion() {
    // Esperar el signOut antes de navegar: evita dejar la sesión visible.
    await signOut();
    router.replace(RUTAS.login);
  }

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: "var(--sidebar-bg)",
        color: "var(--sidebar-text-strong)",
        borderRight: "1px solid var(--sidebar-border)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
      }}
    >
      <div style={{ padding: "0 8px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF" }}>
          Amparo
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "var(--sidebar-text)" }}>
          Panel del agente
        </div>
      </div>

      <nav style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        <Link
          href={RUTAS.agente.casos}
          aria-current={activo ? "page" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 10px",
            borderRadius: "var(--radius-md)",
            fontSize: 14,
            fontWeight: 600,
            color: activo ? "var(--sidebar-active)" : "var(--sidebar-text-strong)",
            background: activo ? "var(--sidebar-active-bg)" : "transparent",
          }}
        >
          <FolderKanban size={18} strokeWidth={1.5} />
          <span style={{ flex: 1 }}>Casos</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--sidebar-text)" }}>
            {casosActivos}
          </span>
        </Link>
      </nav>

      <div
        style={{
          borderTop: "1px solid var(--sidebar-border)",
          paddingTop: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: "var(--radius-full)",
            background: "rgba(255,255,255,0.12)",
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {iniciales(nombre)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#FFFFFF",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {nombre}
          </div>
          <div style={{ fontSize: 11, color: "var(--sidebar-text)" }}>Agente</div>
        </div>
        <button
          onClick={cerrarSesion}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "var(--sidebar-text)", padding: 6 }}
        >
          <LogOut size={18} strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}
