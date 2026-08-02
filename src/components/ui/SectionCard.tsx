import { ReactNode } from "react";

/**
 * Card con encabezado y un slot de acción a la derecha (`right`).
 *
 * Nació en la ficha del caso (REC-20) y vivía en `casos/[id]/fichaUi.tsx`. Se
 * promovió al design system al aparecer la segunda pantalla que la compone —la
 * ficha de cliente (REC-90)—: es el "Card" que el barrel viene listando como
 * pendiente. La alternativa era una copia, y dos copias que derivan producen dos
 * tarjetas distintas para el mismo tipo de contenido, que es justo lo que un
 * design system existe para evitar.
 *
 * `fichaUi.tsx` la re-exporta, así que los archivos que ya la importaban de ahí
 * no cambian.
 *
 * Presentacional puro, sin estado ni hooks → no necesita "use client".
 */
export function SectionCard({
  title,
  right,
  children,
  pad,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  pad?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "13px 18px",
          borderBottom: "1px solid var(--divider)",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-h4-size)",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h3>
        {right}
      </div>
      <div style={{ padding: pad ?? "16px 18px" }}>{children}</div>
    </div>
  );
}
