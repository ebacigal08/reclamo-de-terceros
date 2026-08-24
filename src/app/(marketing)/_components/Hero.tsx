import { FormularioConsulta } from "./FormularioConsulta";

/**
 * Banda navy + formulario, dos columnas en desktop y apiladas en mobile.
 *
 * El copy no es nuevo: sale de `src/app/login/page.tsx:56-63`, que es el texto ya
 * aprobado del producto. Reusarlo mantiene una sola voz entre la puerta pública y
 * la privada, y evita estrenar promesas en la página que más se lee.
 *
 * El formulario va ACÁ arriba y no al final: es el único punto de conversión de la
 * página, y esconderlo detrás de cuatro secciones de scroll lo desperdicia.
 */
export function Hero() {
  return (
    <section
      id="top"
      style={{
        background: "var(--primary-900)",
        color: "#FFFFFF",
        borderBottom: "1px solid var(--primary-950)",
      }}
    >
      <div className="mkt-shell mkt-hero">
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 560 }}>
          <h1
            className="mkt-hero-title"
            style={{
              margin: 0,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
            }}
          >
            Estás acompañado en cada paso de tu reclamo.
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: "var(--text-body-lg-size)",
              lineHeight: 1.65,
              color: "rgba(255,255,255,0.76)",
            }}
          >
            Si te chocaron o sufriste un siniestro, reclamarle a la aseguradora es un trámite
            largo y lleno de papeles. Nosotros lo llevamos por vos: centralizamos tu caso, te
            decimos qué falta y te avisamos cuando hay novedades.
          </p>

          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: "var(--text-body-size)",
              color: "rgba(255,255,255,0.86)",
            }}
          >
            {[
              "Seguís tu expediente desde el celular, cuando quieras.",
              "Sabés siempre qué documentación falta y por qué.",
              "Un solo lugar para todo: nada de cadenas de mails.",
            ].map((t) => (
              <li key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    marginTop: 7,
                    width: 6,
                    height: 6,
                    borderRadius: "var(--radius-full)",
                    background: "var(--primary-400)",
                    flexShrink: 0,
                  }}
                />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <FormularioConsulta />
      </div>
    </section>
  );
}
