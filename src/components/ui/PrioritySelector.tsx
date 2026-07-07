import { CSSProperties, KeyboardEvent, useRef } from "react";
import { Badge } from "./Badge";
import { PRIORIDADES, type Prioridad } from "@/lib/constants";

const labelStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-primary)",
};

/**
 * Selector segmentado de prioridad (Alta / Media / Baja) del design system
 * Amparo. Control tipo radio-group: una sola opción activa, con default MEDIA
 * gestionado por el que lo usa. Reutilizable en el alta (REC-19/38) y la ficha
 * (REC-37). Usa `PRIORIDADES` de constants para mantener labels/badges en sync.
 */
export function PrioritySelector({
  value,
  onChange,
  disabled = false,
}: {
  value: Prioridad;
  onChange: (v: Prioridad) => void;
  disabled?: boolean;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  // Navegación con flechas (patrón radiogroup): mueve la selección y el foco a
  // la opción anterior/siguiente, en ciclo. Combinado con el roving tabindex de
  // abajo (solo la opción activa es tabbable), da el comportamiento nativo.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (idx + 1) % PRIORIDADES.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (idx - 1 + PRIORIDADES.length) % PRIORIDADES.length;
    } else {
      return;
    }
    e.preventDefault();
    onChange(PRIORIDADES[next].value);
    botones.current[next]?.focus();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={labelStyle}>Prioridad</span>
      <div
        role="radiogroup"
        aria-label="Prioridad"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}
      >
        {PRIORIDADES.map((p, idx) => {
          const sel = value === p.value;
          return (
            <button
              type="button"
              key={p.value}
              ref={(el) => {
                botones.current[idx] = el;
              }}
              role="radio"
              aria-checked={sel}
              tabIndex={sel ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(p.value)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                border: `1.5px solid ${sel ? "var(--primary-500)" : "var(--border-strong)"}`,
                background: sel ? "var(--primary-50)" : "var(--bg-inset)",
                borderRadius: "var(--radius-md)",
                padding: 13,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                boxShadow: sel ? "var(--focus-ring-shadow)" : "none",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: `2px solid ${sel ? "var(--primary-600)" : "var(--border-strong)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {sel && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary-600)" }} />
                )}
              </span>
              <Badge variant={p.badge}>{p.label}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
