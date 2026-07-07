import { CSSProperties, Fragment } from "react";
import { Check } from "lucide-react";

/**
 * Stepper del design system Amparo. Presentacional y **sin estado** (no usa
 * hooks → no necesita `"use client"`; se bandea en el cliente cuando lo importa
 * un componente cliente, igual que `Badge`/`Alert`). Muestra `steps` como una
 * línea de pasos con el actual resaltado y los anteriores marcados como hechos.
 *
 * En REC-20 lo alimenta `ETAPAS` (pipeline del reclamo, read-only). `variant`
 * vertical queda disponible para el wizard del damnificado (REC-22).
 */
export function Stepper({
  steps,
  currentStep,
  variant = "horizontal",
}: {
  steps: { label: string }[];
  currentStep: number;
  variant?: "horizontal" | "vertical";
}) {
  const circulo = (hecho: boolean, activo: boolean): CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: "var(--radius-full)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 700,
    border: `2px solid ${hecho || activo ? "var(--primary-600)" : "var(--border-strong)"}`,
    background: hecho
      ? "var(--primary-600)"
      : activo
        ? "var(--primary-50)"
        : "var(--bg-surface)",
    color: hecho
      ? "var(--text-on-primary)"
      : activo
        ? "var(--primary-700)"
        : "var(--text-tertiary)",
    transition:
      "background 0.2s var(--ease-standard), border-color 0.2s var(--ease-standard)",
  });

  const etiqueta = (hecho: boolean, activo: boolean): CSSProperties => ({
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    fontWeight: activo ? 700 : 600,
    color: activo
      ? "var(--text-primary)"
      : hecho
        ? "var(--text-secondary)"
        : "var(--text-tertiary)",
  });

  const conector = (hecho: boolean) =>
    hecho ? "var(--primary-400)" : "var(--border)";

  if (variant === "vertical") {
    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        {steps.map((s, i) => {
          const hecho = i < currentStep;
          const activo = i === currentStep;
          return (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={circulo(hecho, activo)}>
                  {hecho ? <Check size={16} /> : i + 1}
                </span>
                {i < steps.length - 1 && (
                  <span
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 24,
                      background: conector(i < currentStep),
                      margin: "4px 0",
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  ...etiqueta(hecho, activo),
                  paddingTop: 6,
                  paddingBottom: 12,
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
      {steps.map((s, i) => {
        const hecho = i < currentStep;
        const activo = i === currentStep;
        return (
          <Fragment key={i}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
                textAlign: "center",
              }}
            >
              <span style={circulo(hecho, activo)}>
                {hecho ? <Check size={16} /> : i + 1}
              </span>
              <span style={etiqueta(hecho, activo)}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: conector(i < currentStep),
                  borderRadius: 1,
                  marginTop: 15,
                }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
