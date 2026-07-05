import { InputHTMLAttributes, ReactNode, useId } from "react";

type Size = "md" | "lg";

export function Input({
  label,
  error,
  helperText,
  prefix,
  suffix,
  size = "md",
  id,
  style,
  ...rest
}: {
  label?: string;
  /** Presencia (incluso "" o " ") marca estado inválido; con texto, muestra mensaje. */
  error?: string;
  helperText?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: Size;
  // Omitimos `size` y `prefix`: ambos existen en los atributos HTML nativos
  // (size: number; prefix: string RDFa) y chocarían con nuestros props.
} & Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix">) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const height = size === "lg" ? 48 : 40;
  const errored = error != null;
  const mensaje = errored && error.trim().length > 0 ? error : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {label && (
        <label
          htmlFor={inputId}
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
        {prefix && <span style={{ display: "flex", color: "var(--text-tertiary)" }}>{prefix}</span>}
        <input
          id={inputId}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-body-size)",
            color: "var(--text-primary)",
            ...style,
          }}
          {...rest}
        />
        {suffix && <span style={{ display: "flex", alignItems: "center" }}>{suffix}</span>}
      </div>
      {mensaje ? (
        <span style={{ fontSize: "var(--text-caption-size)", color: "var(--danger-600)" }}>{mensaje}</span>
      ) : helperText ? (
        <span style={{ fontSize: "var(--text-caption-size)", color: "var(--text-tertiary)" }}>{helperText}</span>
      ) : null}
    </div>
  );
}
