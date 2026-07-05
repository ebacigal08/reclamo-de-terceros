import { CSSProperties, ReactNode } from "react";

/**
 * Badge tematizado. `variant` es la key de token de `semantic.css`, que
 * coincide con `ETAPAS[].badge` / `PRIORIDADES[].badge` de src/lib/constants:
 * etapa (nuevo, armado, completo, presentado, negociacion, resuelto),
 * cierre (rechazado, apelacion), prioridad (alta, media, baja), pedido
 * (pendiente, respondido). El borde usa fallback transparent si no existe.
 */
export function Badge({
  variant,
  children,
  style,
}: {
  variant: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-label-size)",
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        background: `var(--badge-${variant}-bg)`,
        color: `var(--badge-${variant}-text)`,
        border: `1px solid var(--badge-${variant}-border, transparent)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
