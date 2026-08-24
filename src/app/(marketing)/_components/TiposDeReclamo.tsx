import { Car, Droplets, Flame, MessageCircleQuestion, ShieldAlert, type LucideIcon } from "lucide-react";
import { TIPOS_SINIESTRO, type TipoSiniestro } from "@/lib/constants";

/**
 * Los tipos de reclamo, derivados de `TIPOS_SINIESTRO`.
 *
 * Es la MISMA lista que alimenta el `<Select>` del formulario y la que el agente
 * usa al abrir un caso: la taxonomía vive en `convex/tiposSiniestro.ts` y de ahí
 * salen los tres consumidores. Consecuencia práctica: la landing no puede
 * ofrecer un tipo de reclamo que el CRM después no sepa cargar.
 *
 * Ambos mapas van tipados por `TipoSiniestro`, así que sumar un tipo al backend
 * rompe el typecheck acá hasta que alguien le elija ícono y texto.
 */
const ICONO: Record<TipoSiniestro, LucideIcon> = {
  ACCIDENTE: Car,
  ROBO: ShieldAlert,
  INCENDIO: Flame,
  INUNDACION: Droplets,
  OTRO: MessageCircleQuestion,
};

const DESCRIPCION: Record<TipoSiniestro, string> = {
  ACCIDENTE: "Choques y siniestros de tránsito en los que otro conductor es responsable.",
  ROBO: "Sustracción del vehículo o de bienes cubiertos por una póliza.",
  INCENDIO: "Daños por fuego sobre un bien asegurado.",
  INUNDACION: "Daños por agua: temporales, anegamientos, filtraciones.",
  OTRO: "¿Tu caso no encaja en ninguno? Contanos igual y lo miramos.",
};

export function TiposDeReclamo() {
  return (
    <section id="reclamos" className="mkt-shell mkt-seccion">
      <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="mkt-h2">Qué reclamos tomamos</h2>
        <p className="mkt-lead">
          Si tu situación está en esta lista, escribinos. Si no estás seguro, escribinos
          igual: la primera consulta es para eso.
        </p>
      </div>

      <div className="mkt-cards">
        {TIPOS_SINIESTRO.map((tipo) => {
          const Icono = ICONO[tipo.value];
          return (
            <article key={tipo.value} className="mkt-card">
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "var(--radius-md)",
                  background: "var(--primary-50)",
                  border: "1px solid var(--primary-100)",
                  color: "var(--primary-700)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icono size={19} strokeWidth={1.75} />
              </span>
              <h3
                style={{
                  margin: 0,
                  fontSize: "var(--text-body-lg-size)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {tipo.label}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-body-sm-size)",
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                }}
              >
                {DESCRIPCION[tipo.value]}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
