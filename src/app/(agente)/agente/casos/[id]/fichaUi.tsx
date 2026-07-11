import { ReactNode } from "react";
import { EmptyState } from "@/components/ui";

/**
 * Piezas compartidas de la ficha del caso (REC-20), extraídas de
 * `FichaCasoView.tsx` para que las cards que la ficha compone —empezando por
 * `RespuestasAseguradoraCard` (REC-31)— puedan usarlas sin importar de la ficha,
 * lo que crearía un ciclo de imports (ficha → card → ficha).
 *
 * Presentacionales puras, sin estado ni hooks → no necesitan "use client"
 * (misma convención que los componentes de `src/components/ui`).
 */

/** Card con encabezado y un slot de acción a la derecha (`right`). */
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

/** Estado vacío centrado dentro de una `SectionCard`. */
export function CenteredEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  );
}

/**
 * Las fechas de calendario del dominio viajan como "YYYY-MM-DD": se parsean como
 * fecha LOCAL (con "T00:00:00") para no correr un día por timezone (AR es UTC-3).
 * Pasar el ISO pelado a `new Date()` lo interpretaría como UTC.
 */
export const fechaLocal = (iso: string) => new Date(`${iso}T00:00:00`);
