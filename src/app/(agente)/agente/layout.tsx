import Link from "next/link";
import { RUTAS } from "@/lib/constants";

/**
 * Shell del Agente — registro denso, desktop, sidebar navy (design system Amparo).
 * TODO: reemplazar el sidebar stub por el Sidebar real (navegación, avatar,
 * contador de casos) cuando se construya la Lista de casos (REC-55/REC-18).
 */
export default function AgenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          background: "var(--sidebar-bg)",
          color: "var(--sidebar-text-strong)",
          padding: "24px 20px",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Amparo
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--sidebar-text)" }}>
          Panel del agente
        </div>
        <nav style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 4 }}>
          <Link
            href={RUTAS.agente.casos}
            style={{ color: "var(--sidebar-text-strong)", fontSize: 14, padding: "8px 10px", borderRadius: "var(--radius-md)" }}
          >
            Casos
          </Link>
        </nav>
      </aside>
      <main style={{ flex: 1, background: "var(--bg-page)", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
