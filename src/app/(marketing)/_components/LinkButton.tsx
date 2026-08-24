import Link from "next/link";
import { CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "sobreOscuro";
type Size = "md" | "lg";

/**
 * Botón que en realidad es un enlace. Vive acá y **no** entra al barril de
 * `src/components/ui`: `Button` renderiza `<button>`, y `<a><button>` es HTML
 * inválido (el parser lo desanida y el resultado no es clickeable como se espera).
 * Darle a `Button` un modo link tocaría un componente usado en ~20 pantallas del
 * CRM para resolver una necesidad que sólo tiene la landing.
 *
 * Copia deliberada de la geometría de `Button` (alturas 40/48, `--radius-md`,
 * peso 600) para que ambos se vean iguales sin acoplar los dos archivos.
 */

const sizeStyles: Record<Size, CSSProperties> = {
  md: { height: 40, padding: "0 16px", fontSize: "var(--text-body-size)", gap: 8 },
  lg: { height: 48, padding: "0 22px", fontSize: "var(--text-body-size)", gap: 8 },
};

const variantStyles: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--primary-600)",
    color: "var(--text-on-primary)",
    border: "1px solid transparent",
  },
  secondary: {
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
  },
  // Para la banda navy del hero, donde `secondary` (superficie clara) gritaría
  // más que el CTA principal.
  sobreOscuro: {
    background: "transparent",
    color: "#FFFFFF",
    border: "1px solid rgba(255,255,255,0.4)",
  },
};

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  iconRight,
  children,
  style,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  iconRight?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const estilo: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    borderRadius: "var(--radius-md)",
    whiteSpace: "nowrap",
    cursor: "pointer",
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };

  // Las anclas de la propia página (`#consulta`) van con `<a>` pelado: `Link`
  // metería al router en un scroll que el navegador ya sabe hacer solo.
  if (href.startsWith("#")) {
    return (
      <a className="mkt-linkbtn" href={href} style={estilo}>
        {children}
        {iconRight}
      </a>
    );
  }

  return (
    <Link className="mkt-linkbtn" href={href} style={estilo}>
      {children}
      {iconRight}
    </Link>
  );
}
