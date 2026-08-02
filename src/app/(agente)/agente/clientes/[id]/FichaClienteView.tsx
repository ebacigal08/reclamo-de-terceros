"use client";

import { Component, CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, ChevronRight, FolderKanban, Inbox, Users } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, EmptyState, SectionCard, Skeleton } from "@/components/ui";
import {
  ETAPAS,
  RESULTADOS_CIERRE,
  RUTAS,
  TIPOS_SINIESTRO,
} from "@/lib/constants";
import { formatFecha } from "@/lib/format";
import { CenteredEmpty } from "../../casos/[id]/fichaUi";
import { DatosContactoCard } from "./DatosContactoCard";

/**
 * REC-90 · Ficha de cliente: quién es y TODOS sus casos, abiertos y cerrados.
 *
 * Es la vista que la lista de casos no puede dar: los casos de una persona están
 * repartidos entre la lista de activos y el histórico, y hasta acá no había forma
 * de verlos juntos. No muestra actividad (gestiones, etapas, documentos): eso
 * vive en la ficha del caso, que es donde tiene contexto.
 */

type Ficha = NonNullable<FunctionReturnType<typeof api.clientes.get>>;
type CasoFila = Ficha["casos"][number];

const etapaInfo = (v: string) => ETAPAS.find((e) => e.value === v);
const tipoLabel = (v: string) => TIPOS_SINIESTRO.find((t) => t.value === v)?.label ?? v;

// Fallback defensivo si `resultadoCierre` viniera null (dato legacy: los casos
// cerrados antes de REC-66 no lo tienen). Mismo patrón que el histórico.
const resultadoInfo = (v: string | null) =>
  RESULTADOS_CIERRE.find((r) => r.value === v) ?? { label: "Cerrado", badge: "apelacion" as const };

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 16,
};

// ── Entrada: error boundary (padre del que llama useQuery) ────────
export function FichaClienteView({ damnificadoId }: { damnificadoId: string }) {
  return (
    <FichaClienteErrorBoundary>
      <FichaContent damnificadoId={damnificadoId} />
    </FichaClienteErrorBoundary>
  );
}

function FichaContent({ damnificadoId }: { damnificadoId: string }) {
  const cliente = useQuery(api.clientes.get, {
    damnificadoId: damnificadoId as Id<"damnificados">,
  });

  if (cliente === undefined) return <FichaSkeleton />;
  if (cliente === null) return <FichaNoEncontrado />;
  return <FichaDetalle cliente={cliente} />;
}

function FichaDetalle({ cliente }: { cliente: Ficha }) {
  const router = useRouter();

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>
      <button style={backLinkStyle} onClick={() => router.push(RUTAS.agente.clientes)}>
        <ArrowLeft size={15} />
        Clientes
      </button>

      <div style={{ marginBottom: 20 }}>
        <h1 className="text-h2" style={{ margin: 0 }}>{cliente.nombre}</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
          Cliente desde {formatFecha(cliente.creadoEn)}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <DatosContactoCard cliente={cliente} />

        <SectionCard
          title="Casos"
          right={
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
              {cliente.casos.length} {cliente.casos.length === 1 ? "caso" : "casos"}
            </span>
          }
          pad="6px 18px 10px"
        >
          {/* Imposible por construcción —el guard exige al menos un caso en
              común— pero se renderiza igual: un vacío mudo sería peor. */}
          {cliente.casos.length === 0 ? (
            <div style={{ padding: "16px 0" }}>
              <CenteredEmpty
                icon={<FolderKanban size={24} strokeWidth={1.5} />}
                title="Sin casos"
                description="Este cliente no tiene ningún caso asignado a vos."
              />
            </div>
          ) : (
            cliente.casos.map((c, i) => (
              <CasoRow
                key={c._id}
                c={c}
                last={i === cliente.casos.length - 1}
                onOpen={() => router.push(RUTAS.agente.caso(c._id))}
              />
            ))
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/**
 * Fila de caso. Los cerrados van atenuados y con el badge del resultado en vez
 * del de la etapa: el estado que importa de un caso cerrado es cómo terminó.
 */
function CasoRow({ c, last, onOpen }: { c: CasoFila; last: boolean; onOpen: () => void }) {
  const etapa = etapaInfo(c.etapa);
  const resultado = c.cerrado ? resultadoInfo(c.resultadoCierre) : null;

  return (
    <div
      className="amparo-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 0",
        borderBottom: last ? "none" : "1px solid var(--divider)",
        opacity: c.cerrado ? 0.72 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
            {c.numeroCaso}
          </span>
          <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
            {tipoLabel(c.tipoSiniestro)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
          {c.aseguradora} · {c.cerrado && c.cerradoEn
            ? `cerrado el ${formatFecha(c.cerradoEn)}`
            : `abierto el ${formatFecha(c.creadoEn)}`}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {resultado ? (
          <Badge variant={resultado.badge}>{resultado.label}</Badge>
        ) : etapa ? (
          <Badge variant={etapa.badge}>{etapa.labelAgente}</Badge>
        ) : null}
      </div>
      <span style={{ color: "var(--text-tertiary)", display: "flex", flexShrink: 0 }}>
        <ChevronRight size={18} />
      </span>
    </div>
  );
}

// ── Estados de carga / no-encontrado / error ─────────────────────
function FichaSkeleton() {
  return (
    <div style={{ padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>
      <Skeleton width={90} height={12} />
      <div style={{ marginTop: 18, marginBottom: 22 }}>
        <Skeleton width={260} height={26} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <Skeleton width="34%" height={14} />
            <Skeleton width="78%" height={12} />
            <Skeleton width="60%" height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Mismo cartel para "no existe" y "no es tuyo": la query devuelve `null` en los
 * dos casos a propósito, para no filtrar la existencia de clientes ajenos.
 */
function FichaNoEncontrado() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "56px 32px" }}>
      <EmptyState
        icon={<Users size={26} strokeWidth={1.5} />}
        title="No encontramos este cliente"
        description="Puede que no exista o que no tengas ningún caso con esta persona."
        action={
          <a href={RUTAS.agente.clientes} style={{ color: "var(--text-link)", fontWeight: 600, fontSize: "var(--text-body-size)" }}>
            Volver a Clientes
          </a>
        }
      />
    </div>
  );
}

class FichaClienteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "56px 32px" }}>
          <EmptyState
            icon={<Inbox size={26} strokeWidth={1.5} />}
            title="No pudimos cargar el cliente"
            description="Puede que tu sesión haya expirado. Volvé a ingresar para continuar."
            action={
              <a href={RUTAS.login} style={{ color: "var(--text-link)", fontWeight: 600, fontSize: "var(--text-body-size)" }}>
                Volver a ingresar
              </a>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
