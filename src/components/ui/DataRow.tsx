import { CSSProperties, ReactNode } from "react";

/**
 * Fila de dato con ícono, etiqueta y valor. Es la forma en que el panel muestra
 * los datos de contacto de una persona.
 *
 * Estaba embebida en `FichaCasoView.tsx` (card "Damnificado"). Se promovió al
 * design system al necesitarla también la ficha de cliente (REC-90): son
 * literalmente los mismos tres datos —nombre, email, teléfono— de la misma
 * persona, y tenían que verse igual en las dos pantallas.
 *
 * Trae su propia copia de `captionStyle` porque en `FichaCasoView` ese estilo
 * también lo usa el badge de Prioridad, así que allá se queda.
 *
 * Presentacional puro, sin estado ni hooks → no necesita "use client".
 */

const captionStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-tertiary)",
  fontWeight: 600,
};

export function DataRow({
  icon,
  label,
  value,
  mono,
  last,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--divider)",
      }}
    >
      <span style={{ color: "var(--text-tertiary)", display: "flex", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={captionStyle}>{label}</div>
        <div
          style={{
            fontSize: "var(--text-body-sm-size)",
            color: "var(--text-primary)",
            fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
            marginTop: 2,
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
