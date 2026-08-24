import { ChevronDown } from "lucide-react";

/**
 * FAQ con `<details>/<summary>` NATIVO. Cero JavaScript: abre y cierra antes de
 * hidratar, funciona con teclado sin una línea de ARIA, y el buscador del
 * navegador (Ctrl+F) encuentra el texto de las respuestas cerradas. Un acordeón
 * propio costaría `"use client"` en toda la sección a cambio de nada.
 *
 * Las preguntas son SÓLO las que se pueden responder con verdad hoy. Faltan a
 * propósito las tres que dependen de datos del estudio que todavía no están
 * confirmados —honorarios, cobertura geográfica y canal telefónico—: preferimos
 * no tener la pregunta antes que tener una respuesta inventada. Vuelven cuando
 * el estudio confirme los datos.
 */
const PREGUNTAS: { p: string; r: string }[] = [
  {
    p: "¿Qué es Amparo?",
    r: "Somos un estudio que lleva reclamos ante aseguradoras por vos, con una plataforma donde seguís tu caso en vivo: qué documentación falta, en qué etapa está y qué pasó en cada movimiento.",
  },
  {
    p: "¿Qué pasa después de que envío la consulta?",
    r: "Recibimos tu consulta y te escribimos al email que dejaste para entender el caso. Si podemos tomarlo, abrimos tu expediente y te damos acceso al portal.",
  },
  {
    p: "¿Qué documentación necesito?",
    r: "Depende del caso, y no hace falta que la tengas toda de entrada. Te la vamos pidiendo de a una desde el portal, y ahí mismo ves qué está entregado y qué falta.",
  },
  {
    p: "¿Cómo sigo mi caso?",
    r: "Con el acceso que te damos entrás desde el celular o la computadora y ves la etapa actual, los pedidos pendientes y todo lo que subiste. Además te llega un email cuando hay novedades.",
  },
  {
    p: "¿Qué hacen con mis datos?",
    r: "Los usamos para responderte y, si avanzamos con el caso, para llevar tu reclamo. Si querés que los demos de baja, escribinos y lo hacemos.",
  },
];

export function Faq() {
  return (
    <section id="preguntas" className="mkt-shell mkt-seccion">
      <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="mkt-h2">Preguntas frecuentes</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
        {PREGUNTAS.map(({ p, r }) => (
          <details key={p} className="mkt-faq">
            <summary>
              <span>{p}</span>
              <ChevronDown className="mkt-faq-chevron" size={18} strokeWidth={2} aria-hidden="true" />
            </summary>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: "var(--text-body-size)",
                lineHeight: 1.65,
                color: "var(--text-secondary)",
              }}
            >
              {r}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
