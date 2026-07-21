"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Archive, Bell, FolderKanban, LogOut } from "lucide-react";
import { api } from "@convex/_generated/api";
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
  const { signOut } = useAuthActions();
  // "Histórico" es un sub-path de "/agente/casos", así que se resuelve primero y
  // se excluye de "Casos" para no marcar ambas entradas. "Casos" cubre lista +
  // ficha + nuevo; "Histórico" sólo /agente/casos/historico.
  const enHistorico = pathname?.startsWith("/agente/casos/historico") ?? false;
  const enCasos = (pathname?.startsWith("/agente/casos") ?? false) && !enHistorico;
  const enNovedades = pathname?.startsWith("/agente/novedades") ?? false;

  // El contador vive acá, y no en el header de la lista de casos, porque el sidebar
  // es lo único GLOBAL del shell del agente: así se ve mientras trabaja en una ficha,
  // que es donde pasa el tiempo. Es reactivo (live query), a diferencia de
  // `casosActivos`, que llega como prop del server y sólo se refresca al navegar.
  const novedades = useQuery(api.notificaciones.listAgente, {});
  const noVistas = novedades?.noVistas ?? 0;

  async function cerrarSesion() {
    // Cerrar sesión no debe poder "fallar" hacia el usuario. Navegación DURA a la
    // raíz `/` (window.location, NO router.replace): un document load re-evalúa
    // middleware + resolver con la cookie httpOnly ya borrada por signOut → al estar
    // deslogueado, `/` redirige a /login. La soft-nav rebotaba porque la sesión todavía
    // se leía autenticada durante la transición cliente. Va en finally: si signOut
    // rechaza, salimos igual.
    try {
      await signOut();
    } catch {
      // best-effort: se traga el fallo; el redirect del finally corre igual.
    } finally {
      window.location.replace(RUTAS.raiz);
    }
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
        <NavItem
          href={RUTAS.agente.casos}
          icon={<FolderKanban size={18} strokeWidth={1.5} />}
          label="Casos"
          active={enCasos}
          count={casosActivos}
        />
        <NavItem
          href={RUTAS.agente.novedades}
          icon={<Bell size={18} strokeWidth={1.5} />}
          label="Novedades"
          active={enNovedades}
          // Sólo cuando hay algo sin ver: un "0" permanente es ruido, y un badge que
          // nunca se apaga deja de significar nada.
          badge={noVistas > 0 ? noVistas : undefined}
        />
        <NavItem
          href={RUTAS.agente.historico}
          icon={<Archive size={18} strokeWidth={1.5} />}
          label="Histórico"
          active={enHistorico}
        />
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

/**
 * Entrada de navegación de la Sidebar (activa = fondo + color de acento).
 *
 * `count` = dato neutro (cuántos casos tenés), en mono y apagado.
 * `badge`  = algo que RECLAMA atención (novedades sin ver), en color de acento.
 * Son cosas distintas y por eso no comparten estilo: si el contador de casos y el de
 * novedades sin ver se vieran igual, el badge dejaría de gritar.
 */
function NavItem({
  href,
  icon,
  label,
  active,
  count,
  badge,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  count?: number;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: "var(--radius-md)",
        fontSize: 14,
        fontWeight: 600,
        color: active ? "var(--sidebar-active)" : "var(--sidebar-text-strong)",
        background: active ? "var(--sidebar-active-bg)" : "transparent",
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--sidebar-text)" }}>
          {count}
        </span>
      )}
      {badge !== undefined && (
        <span
          aria-label={`${badge} novedades sin ver`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            borderRadius: "var(--radius-full)",
            background: "var(--primary-500)",
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
