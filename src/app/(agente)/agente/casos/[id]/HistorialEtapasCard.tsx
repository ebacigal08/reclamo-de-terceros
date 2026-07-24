"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowDown, ArrowUp, History, Lock, type LucideIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Skeleton } from "@/components/ui";
import { ETAPAS } from "@/lib/constants";
import { formatFecha, formatHora } from "@/lib/format";
import { CenteredEmpty, SectionCard } from "./fichaUi";

/**
 * REC-82 · Card "Historial de etapas" dentro de la ficha del caso.
 *
 * Read-only: es un audit log (avances, retrocesos y el cierre), no una bitácora
 * editable. Autocontenida, igual que GestionesCard/NotasInternasCard: hace su PROPIA
 * query —no cuelga de `casos.get`, que es dual-rol y no debe ver esta tabla— y la
 * query ya viene MÁS RECIENTE PRIMERO y acotada, así que no hay orden ni corte en JS.
 */

type Cambio = NonNullable<
  FunctionReturnType<typeof api.historialEtapas.listPorCaso>
>[number];

// Ícono por dirección del cambio. Neutro (chip gris como GestionesCard): la
// dirección ya se lee en el texto; el ícono sólo ayuda a escanear.
const ICONO_DIRECCION: Record<Cambio["direccion"], LucideIcon> = {
  AVANCE: ArrowUp,
  RETROCESO: ArrowDown,
  CIERRE: Lock,
};

const etapaLabel = (v: string) =>
  ETAPAS.find((e) => e.value === v)?.labelAgente ?? v;

function textoCambio(c: Cambio): string {
  const desde = etapaLabel(c.etapaAnterior);
  const hasta = etapaLabel(c.etapaNueva);
  switch (c.direccion) {
    case "AVANCE":
      return `Avanzó de ${desde} a ${hasta}`;
    case "RETROCESO":
      return `Retrocedió de ${desde} a ${hasta}`;
    case "CIERRE":
      return `Cerró el caso (desde ${desde})`;
  }
}

export function HistorialEtapasCard({ casoId }: { casoId: Id<"casos"> }) {
  const historial = useQuery(api.historialEtapas.listPorCaso, { casoId });

  return (
    <SectionCard title="Historial de etapas">
      {historial === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton width="45%" height={12} />
          <Skeleton width="80%" height={12} />
        </div>
      ) : historial === null ? (
        // Fail-closed. En la práctica sólo una race: si la ficha renderizó, el
        // agente ya es dueño del caso.
        <div
          style={{
            padding: "10px 0",
            fontSize: "var(--text-body-sm-size)",
            color: "var(--text-tertiary)",
          }}
        >
          No pudimos cargar el historial.
        </div>
      ) : historial.length ? (
        <div>
          {historial.map((c) => (
            <CambioRow key={c._id} cambio={c} />
          ))}
        </div>
      ) : (
        <CenteredEmpty
          icon={<History size={22} strokeWidth={1.5} />}
          title="Sin cambios de etapa"
          description="Cuando avances, retrocedas o cierres el caso, cada cambio va a quedar registrado acá."
        />
      )}
    </SectionCard>
  );
}

function CambioRow({ cambio }: { cambio: Cambio }) {
  const Icono = ICONO_DIRECCION[cambio.direccion];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "11px 0 11px 10px",
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-inset)",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icono size={16} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--text-body-sm-size)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {textoCambio(cambio)}
        </div>
        <div
          style={{
            marginTop: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          {formatFecha(cambio.at)} · {formatHora(cambio.at)}
        </div>
      </div>
    </div>
  );
}
