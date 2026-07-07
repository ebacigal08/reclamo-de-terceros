import { SelectHTMLAttributes, useId } from "react";
import { ChevronDown } from "lucide-react";

type Size = "md" | "lg";
type Option = { value: string; label: string };

/**
 * Select del design system Amparo. Espeja la estructura de `Input`: mismo
 * contenedor `amparo-field` (foco/estado de error por CSS), `label`, `error`
 * (su sola presencia marca inválido; con texto, muestra mensaje) y `helperText`.
 * El `placeholder` se renderiza como una opción deshabilitada con `value=""`.
 */
export function Select({
  label,
  error,
  helperText,
  placeholder,
  options,
  size = "md",
  id,
  style,
  value,
  ...rest
}: {
  label?: string;
  /** Presencia (incluso "" o " ") marca estado inválido; con texto, muestra mensaje. */
  error?: string;
  helperText?: string;
  placeholder?: string;
  options: readonly Option[];
  size?: Size;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const height = size === "lg" ? 48 : 40;
  const errored = error != null;
  const mensaje = errored && error.trim().length > 0 ? error : null;
  const isPlaceholder = value === "" || value == null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {label && (
        <label
          htmlFor={selectId}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-body-sm-size)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {label}
        </label>
      )}
      <div
        className="amparo-field"
        data-error={errored}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height,
          padding: "0 12px",
          background: "var(--bg-inset)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <select
          id={selectId}
          value={value}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            appearance: "none",
            WebkitAppearance: "none",
            MozAppearance: "none",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-body-size)",
            color: isPlaceholder ? "var(--text-tertiary)" : "var(--text-primary)",
            cursor: "pointer",
            ...style,
          }}
          {...rest}
        >
          {placeholder != null && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} style={{ color: "var(--text-tertiary)", flexShrink: 0, pointerEvents: "none" }} />
      </div>
      {mensaje ? (
        <span style={{ fontSize: "var(--text-caption-size)", color: "var(--danger-600)" }}>{mensaje}</span>
      ) : helperText ? (
        <span style={{ fontSize: "var(--text-caption-size)", color: "var(--text-tertiary)" }}>{helperText}</span>
      ) : null}
    </div>
  );
}
