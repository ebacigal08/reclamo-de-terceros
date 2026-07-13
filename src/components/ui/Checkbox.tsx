"use client";

import { InputHTMLAttributes, useId, useState } from "react";

/**
 * Checkbox del design system (portado de Design/nuevo-prototipo-reclamos).
 *
 * Convenciones de props alineadas con `Input`: `label`, `error` (su sola presencia
 * marca inválido) y `helperText`, más el spread de los atributos nativos.
 *
 * El `<input type="checkbox">` es NATIVO y está sólo oculto a la vista: por eso el
 * teclado (Space), el `disabled` y los lectores de pantalla funcionan sin una línea
 * de ARIA. La caja que se ve es decorativa, y el `<label>` que envuelve todo hace
 * clickeable también el texto.
 */
export function Checkbox({
  label,
  error,
  helperText,
  id,
  checked,
  disabled,
  ...rest
}: {
  label?: string;
  /** Presencia (incluso "") marca estado inválido; con texto, muestra mensaje. */
  error?: string;
  helperText?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [enfocado, setEnfocado] = useState(false);
  const errored = error != null;
  const mensaje = errored && error.trim().length > 0 ? error : null;

  const borde = errored
    ? "var(--danger-500)"
    : checked
      ? "var(--primary-600)"
      : "var(--border-strong)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={inputId}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-body-size)",
          color: "var(--text-primary)",
        }}
      >
        {/* Nativo, pero invisible: conserva semántica y teclado, y nos deja
            dibujar la caja de abajo con los tokens del design system. */}
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          style={{
            position: "absolute",
            opacity: 0,
            width: 0,
            height: 0,
          }}
          {...rest}
        />
        <span
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 20,
            height: 20,
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${borde}`,
            background: checked ? "var(--primary-600)" : "var(--bg-inset)",
            boxShadow: enfocado ? "var(--focus-ring-shadow)" : "none",
            transition: "var(--transition-colors)",
          }}
        >
          {checked && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6.5L4.75 8.75L9.5 3.5"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        {label}
      </label>
      {mensaje ? (
        <span
          style={{
            marginLeft: 31,
            fontSize: "var(--text-caption-size)",
            color: "var(--danger-600)",
          }}
        >
          {mensaje}
        </span>
      ) : helperText ? (
        <span
          style={{
            marginLeft: 31,
            fontSize: "var(--text-caption-size)",
            color: "var(--text-tertiary)",
          }}
        >
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
