import Link from "next/link";
import { RUTAS } from "@/lib/constants";

// Hub de desarrollo: índice navegable de las 11 pantallas del MVP.
// Es temporal / de andamiaje — se puede quitar cuando el Login y la
// navegación real estén construidos.

type Item = { titulo: string; rec: string; href: string };

const GRUPOS: { grupo: string; nota: string; items: Item[] }[] = [
  {
    grupo: "Compartida",
    nota: "Entrada para ambos roles",
    items: [{ titulo: "Login / Autenticación", rec: "REC-54 · REC-17", href: RUTAS.login }],
  },
  {
    grupo: "Agente",
    nota: "Desktop · sidebar navy",
    items: [
      { titulo: "Lista de casos", rec: "REC-55 · REC-18", href: RUTAS.agente.casos },
      { titulo: "Nuevo caso", rec: "REC-57 · REC-19", href: RUTAS.agente.nuevoCaso },
      { titulo: "Ficha del caso", rec: "REC-56 · REC-20", href: RUTAS.agente.caso("demo") },
      { titulo: "Solicitar documentación", rec: "REC-58 · REC-24", href: RUTAS.agente.solicitar("demo") },
      { titulo: "Cerrar caso", rec: "REC-59 · REC-30", href: RUTAS.agente.cerrar("demo") },
    ],
  },
  {
    grupo: "Damnificado",
    nota: "Mobile-first · cálido",
    items: [
      { titulo: "Onboarding", rec: "REC-60 · REC-26", href: RUTAS.damnificado.onboarding },
      { titulo: "Mi caso (hub)", rec: "REC-61 · REC-27", href: RUTAS.damnificado.miCaso },
      { titulo: "Relato del siniestro", rec: "REC-62 · REC-22", href: RUTAS.damnificado.relato },
      { titulo: "Carga de documentos", rec: "REC-63 · REC-23", href: RUTAS.damnificado.documentos },
      { titulo: "Responder pedido", rec: "REC-64 · REC-25", href: RUTAS.damnificado.pedido("demo") },
    ],
  },
];

export default function MapaPage() {
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px 72px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Andamiaje · desarrollo
      </div>
      <h1 style={{ margin: "8px 0 0", fontSize: "var(--text-display-size)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
        Amparo — Mapa de pantallas
      </h1>
      <p style={{ marginTop: 12, color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 620 }}>
        Índice navegable de las 11 pantallas del MVP. Cada una es todavía un placeholder:
        la ruta y la estructura están listas; la UI real se construye pantalla por pantalla.
      </p>

      {GRUPOS.map((g) => (
        <section key={g.grupo} style={{ marginTop: 36 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-h4-size)", fontWeight: 700, color: "var(--text-primary)" }}>{g.grupo}</h2>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{g.nota}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginTop: 14 }}>
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  display: "block",
                  padding: "16px 18px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-xs)",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--primary-600)" }}>{it.rec}</div>
                <div style={{ marginTop: 6, fontSize: "var(--text-h4-size)", fontWeight: 700, color: "var(--text-primary)" }}>{it.titulo}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
