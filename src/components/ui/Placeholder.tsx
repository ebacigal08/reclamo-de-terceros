import Link from "next/link";

type Registro = "agente" | "damnificado" | "compartida";

/**
 * Placeholder de pantalla. Sirve para dejar la ruta lista y navegable
 * mientras se construye la UI real de cada pantalla del MVP.
 */
export function Placeholder({
  titulo,
  rec,
  descripcion,
  registro = "compartida",
}: {
  titulo: string;
  rec: string;
  descripcion: string;
  registro?: Registro;
}) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {rec} · {registro}
      </div>
      <h1
        style={{
          margin: "8px 0 0",
          fontSize: "var(--text-h2-size)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
        }}
      >
        {titulo}
      </h1>
      <p style={{ marginTop: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {descripcion}
      </p>
      <div
        style={{
          marginTop: 24,
          padding: "14px 16px",
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-tertiary)",
          fontSize: "var(--text-body-sm-size)",
        }}
      >
        Pantalla pendiente de construir. La ruta y la estructura ya están listas.
      </div>
      <Link
        href="/login"
        style={{
          display: "inline-block",
          marginTop: 24,
          color: "var(--text-link)",
          fontWeight: 600,
          fontSize: "var(--text-body-sm-size)",
        }}
      >
        ← Volver al login
      </Link>
    </div>
  );
}
