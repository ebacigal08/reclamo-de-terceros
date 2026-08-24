import { BellRing, FolderCheck, ListChecks, Lock, type LucideIcon } from "lucide-react";

/**
 * Por qué elegirnos, sin un solo número.
 *
 * **Regla dura de esta sección: cada afirmación apunta a código embarcado.** No
 * hay "+5.000 clientes", ni "respondemos en 24 h", ni porcentajes de éxito —
 * métricas que no podemos sostener y que en servicios legales son terreno
 * regulado en Argentina. Los cuatro claims describen features que cualquiera
 * puede ir a leer al repo:
 *
 *   "Un expediente, un lugar"        → tabla `documentos`
 *   "Sabés qué falta, siempre"       → `itemsDocumentacion`
 *   "Te avisamos..."                 → `convex/notificaciones.ts`
 *   "Tus documentos, sólo tuyos"     → `convex/autorizacion.ts`
 *
 * Si alguna de esas features se cae, el claim de al lado se cae con ella.
 */
const CLAIMS: { Icono: LucideIcon; titulo: string; texto: string }[] = [
  {
    Icono: FolderCheck,
    titulo: "Un expediente, un lugar",
    texto:
      "Todo lo que mandás queda guardado y ordenado en tu caso. No hay cadenas de mails ni papeles sueltos.",
  },
  {
    Icono: ListChecks,
    titulo: "Sabés qué falta, siempre",
    texto:
      "Cada pedido de documentación es un ítem con su estado. Entrás y ves qué queda pendiente.",
  },
  {
    Icono: BellRing,
    titulo: "Te avisamos cuando hay novedades",
    texto:
      "Cuando tu caso avanza o necesitamos algo, te llega un email. No tenés que estar preguntando.",
  },
  {
    Icono: Lock,
    titulo: "Tus documentos, sólo tuyos",
    texto:
      "El acceso se valida en el servidor caso por caso. Nadie ve un expediente que no le corresponde.",
  },
];

export function Confianza() {
  return (
    <section className="mkt-banda">
      <div className="mkt-shell mkt-seccion">
        <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="mkt-h2">Cómo trabajamos</h2>
          <p className="mkt-lead">
            No prometemos resultados. Prometemos que vas a saber, en todo momento, en qué
            estado está tu reclamo.
          </p>
        </div>

        <div className="mkt-cards mkt-cards-2">
          {CLAIMS.map(({ Icono, titulo, texto }) => (
            <article key={titulo} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 38,
                  height: 38,
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  color: "var(--primary-700)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icono size={19} strokeWidth={1.75} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "var(--text-body-lg-size)",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {titulo}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--text-body-sm-size)",
                    lineHeight: 1.6,
                    color: "var(--text-secondary)",
                  }}
                >
                  {texto}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
