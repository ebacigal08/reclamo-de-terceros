import { TextareaHTMLAttributes, useId } from "react";

/**
 * Textarea del design system Amparo. Espeja a `Input` (mismo wrapper
 * `.amparo-field` para heredar borde/foco/estado-error, misma convención de
 * `error`/`helperText`), adaptado a multilínea. Es **controlado y sin estado
 * propio** → NO necesita "use client": el `value` lo maneja el padre y el
 * contador se calcula de esa prop.
 */
export function Textarea({
  label,
  error,
  helperText,
  showCount,
  rows = 5,
  maxLength,
  id,
  style,
  value,
  ...rest
}: {
  label?: string;
  /** Presencia (incluso "") marca estado inválido; con texto, muestra mensaje. */
  error?: string;
  helperText?: string;
  /** Muestra `{value.length}/{maxLength}` abajo a la derecha. */
  showCount?: boolean;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const taId = id ?? autoId;
  const errored = error != null;
  const mensaje = errored && error.trim().length > 0 ? error : null;
  const count = typeof value === "string" ? value.length : 0;
  const mostrarFooter = mensaje != null || helperText != null || showCount === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {label && (
        <label
          htmlFor={taId}
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
          padding: "10px 12px",
          background: "var(--bg-inset)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <textarea
          id={taId}
          rows={rows}
          maxLength={maxLength}
          value={value}
          style={{
            display: "block",
            width: "100%",
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "vertical",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-body-size)",
            lineHeight: 1.5,
            color: "var(--text-primary)",
            ...style,
          }}
          {...rest}
        />
      </div>
      {mostrarFooter && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span
            style={{
              fontSize: "var(--text-caption-size)",
              color: mensaje ? "var(--danger-600)" : "var(--text-tertiary)",
            }}
          >
            {mensaje ?? helperText ?? ""}
          </span>
          {showCount && (
            <span
              style={{
                fontSize: "var(--text-caption-size)",
                color: "var(--text-tertiary)",
                flexShrink: 0,
              }}
            >
              {count}
              {maxLength ? `/${maxLength}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
