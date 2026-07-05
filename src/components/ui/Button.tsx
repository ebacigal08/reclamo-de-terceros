import { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const sizeStyles: Record<Size, CSSProperties> = {
  sm: { height: 34, padding: "0 12px", fontSize: "var(--text-body-sm-size)", gap: 6 },
  md: { height: 40, padding: "0 16px", fontSize: "var(--text-body-size)", gap: 8 },
  lg: { height: 48, padding: "0 20px", fontSize: "var(--text-body-size)", gap: 8 },
};

const variantStyles: Record<Variant, CSSProperties> = {
  primary: { background: "var(--primary-600)", color: "var(--text-on-primary)", border: "1px solid transparent" },
  secondary: { background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-strong)" },
  ghost: { background: "transparent", color: "var(--text-secondary)", border: "1px solid transparent" },
  danger: { background: "var(--danger-600)", color: "#FFFFFF", border: "1px solid transparent" },
};

export function Button({
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const isDisabled = disabled || loading;
  return (
    <button
      data-amparo-hover
      disabled={isDisabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        borderRadius: "var(--radius-md)",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        width: fullWidth ? "100%" : undefined,
        whiteSpace: "nowrap",
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
}
