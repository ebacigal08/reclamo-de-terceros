import { ETAPAS, type Etapa } from "@/lib/constants";

/**
 * El recorrido de un caso, derivado de `ETAPAS[].labelHumano`.
 *
 * No es copy nuevo: esos strings YA son el lenguaje cara-al-cliente del producto
 * —los ve el damnificado en "Mi caso" y le llegan por email cuando su caso
 * avanza—. Derivar la sección del pipeline real tiene una consecuencia concreta:
 * esta página no puede prometer un proceso que el CRM no ejecuta. Si mañana se
 * agrega o se renombra una etapa, la landing se entera sola.
 *
 * El glosario de abajo describe qué pasa en cada etapa; no agrega promesas. Va
 * tipado como `Record<Etapa, string>` a propósito: si mañana aparece una etapa
 * nueva y nadie escribe su texto, esto DEJA DE COMPILAR en vez de renderizar un
 * `undefined` en producción.
 */
const DETALLE: Record<Etapa, string> = {
  NUEVO: "Cargamos tus datos y te damos acceso al portal para seguir todo desde el celular.",
  EXPEDIENTE_EN_ARMADO: "Te pedimos la documentación de a una, y ves en todo momento qué falta.",
  EXPEDIENTE_COMPLETO: "Ya está reunido todo lo necesario para presentar el reclamo.",
  PRESENTADO_A_ASEGURADORA: "El reclamo entra formalmente y empieza a correr el trámite.",
  EN_NEGOCIACION: "Se discuten montos y condiciones. Te contamos cada movimiento.",
  CERRADO: "Te informamos el resultado y el expediente queda registrado.",
};

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="mkt-shell mkt-seccion">
      <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="mkt-h2">Cómo funciona</h2>
        <p className="mkt-lead">
          Estas son las etapas por las que pasa tu caso. Son las mismas que ves en tu portal:
          en cada cambio te llega un aviso.
        </p>
      </div>

      <ol className="mkt-pasos">
        {ETAPAS.map((etapa, i) => (
          <li key={etapa.value} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: "var(--radius-full)",
                background: "var(--primary-50)",
                color: "var(--primary-700)",
                border: "1px solid var(--primary-200)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--text-body-sm-size)",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}
            >
              {i + 1}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: "var(--text-body-lg-size)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color: "var(--text-primary)",
                }}
              >
                {etapa.labelHumano}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-body-sm-size)",
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                }}
              >
                {DETALLE[etapa.value]}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
