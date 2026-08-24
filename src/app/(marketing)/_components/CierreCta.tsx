import { ArrowUp } from "lucide-react";
import { LinkButton } from "./LinkButton";

/**
 * Segundo punto de conversión, después de la FAQ. Existe porque quien leyó hasta
 * acá ya recorrió toda la página y el formulario le queda cinco secciones arriba:
 * el ancla le ahorra el scroll de vuelta.
 *
 * No repite el argumento del hero ni agrega promesas nuevas — sólo pregunta.
 */
export function CierreCta() {
  return (
    <section className="mkt-shell" style={{ paddingBottom: 64 }}>
      <div
        style={{
          background: "var(--primary-900)",
          color: "#FFFFFF",
          borderRadius: "var(--radius-xl)",
          padding: "36px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 16,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--text-h2-size)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            maxWidth: 560,
            lineHeight: 1.25,
          }}
        >
          ¿Te chocaron y no sabés por dónde empezar?
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-body-lg-size)",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.76)",
            maxWidth: 520,
          }}
        >
          Contanos qué pasó. Te respondemos por email y, si podemos tomar el caso, te
          explicamos cómo seguimos.
        </p>
        <LinkButton href="#consulta" size="lg" iconRight={<ArrowUp size={17} strokeWidth={2} />}>
          Hacer una consulta
        </LinkButton>
      </div>
    </section>
  );
}
