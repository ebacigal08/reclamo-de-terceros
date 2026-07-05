"use client";

import { Component, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Bell, ChevronRight, Clock, Inbox, Plus, Search } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, EmptyState, Input, Skeleton } from "@/components/ui";
import { ETAPAS, PRIORIDADES, RUTAS, TIPOS_SINIESTRO } from "@/lib/constants";
import { estadoPlazo, formatFecha } from "@/lib/format";

const COLS = "1.7fr 1fr 1.5fr 0.9fr 1.15fr 0.85fr 28px";

const etapaInfo = (v: string) => ETAPAS.find((e) => e.value === v);
const prioridadInfo = (v: string) => PRIORIDADES.find((p) => p.value === v);
const tipoLabel = (v: string) => TIPOS_SINIESTRO.find((t) => t.value === v)?.label ?? v;

// fechaVencimiento viene como "YYYY-MM-DD": lo parseamos como fecha LOCAL
// (con "T00:00:00") para no correr un día por timezone (AR es UTC-3).
const fechaLocal = (iso: string) => new Date(`${iso}T00:00:00`);

export default function ListaCasosPage() {
  return (
    <ListaErrorBoundary>
      <CasosView />
    </ListaErrorBoundary>
  );
}

function CasosView() {
  const router = useRouter();
  const casos = useQuery(api.casos.listMine);
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    if (!casos) return casos;
    const t = q.trim().toLowerCase();
    if (!t) return casos;
    return casos.filter(
      (c) =>
        c.damnificadoNombre.toLowerCase().includes(t) ||
        c.numeroCaso.toLowerCase().includes(t),
    );
  }, [casos, q]);

  const irNuevo = () => router.push(RUTAS.agente.nuevoCaso);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1160, margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="text-h2" style={{ margin: 0 }}>Casos</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
            Reclamos activos bajo tu gestión
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            aria-label="Notificaciones"
            style={{
              position: "relative",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <Bell size={18} strokeWidth={1.5} />
            <span
              aria-hidden
              style={{ position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: "50%", background: "var(--danger-500)", border: "1.5px solid var(--bg-surface)" }}
            />
          </button>
          <Button variant="primary" iconLeft={<Plus size={17} />} onClick={irNuevo}>
            Nuevo caso
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div style={{ width: 340, maxWidth: "55%" }}>
          <Input
            placeholder="Buscar por damnificado o N° de caso"
            prefix={<Search size={15} />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {/* Orden fijo (no interactivo): sólo indica el criterio actual. */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 34,
            padding: "0 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--bg-subtle)",
            color: "var(--text-tertiary)",
            fontSize: "var(--text-body-sm-size)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          Ordenado por prioridad
        </span>
      </div>

      {/* Tabla / estados */}
      {casos === undefined ? (
        <TablaSkeleton />
      ) : casos.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <EmptyState
            icon={<Inbox size={26} strokeWidth={1.5} />}
            title="No tenés casos activos"
            description="Cuando des de alta un caso o te asignen uno, va a aparecer acá. Empezá creando tu primer reclamo."
            action={<Button variant="primary" iconLeft={<Plus size={17} />} onClick={irNuevo}>Crear primer caso</Button>}
          />
        </div>
      ) : (
        <TablaCasos rows={filtrados ?? []} onOpen={(id) => router.push(RUTAS.agente.caso(id))} />
      )}
    </div>
  );
}

type Fila = {
  _id: Id<"casos">;
  numeroCaso: string;
  damnificadoNombre: string;
  tipoSiniestro: string;
  etapa: string;
  prioridad: string;
  vencimiento: string | null;
  creadoEn: number;
};

function ListCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 860 }}>{children}</div>
      </div>
    </div>
  );
}

const headCell: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-label-size)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
};

function HeaderRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 42, borderBottom: "1px solid var(--border)", background: "var(--bg-inset)" }}>
      <span style={headCell}>Damnificado</span>
      <span style={headCell}>Siniestro</span>
      <span style={headCell}>Etapa</span>
      <span style={headCell}>Prioridad</span>
      <span style={headCell}>Vencimiento</span>
      <span style={headCell}>Creado</span>
      <span />
    </div>
  );
}

function VencCell({ venc }: { venc: string | null }) {
  if (!venc) {
    return <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>—</span>;
  }
  const estado = estadoPlazo(fechaLocal(venc));
  const color = estado === "vencido" ? "var(--danger-600)" : estado === "proximo" ? "var(--warning-700)" : "var(--text-secondary)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color, fontWeight: 600 }}>
      <Clock size={14} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{formatFecha(fechaLocal(venc))}</span>
    </span>
  );
}

function CaseRow({ c, onOpen }: { c: Fila; onOpen: (id: Id<"casos">) => void }) {
  const alta = c.prioridad === "ALTA";
  const accent = alta ? "var(--danger-500)" : c.vencimiento ? "var(--warning-500)" : "transparent";
  const tint = alta ? "rgba(214,74,58,0.04)" : "transparent";
  const etapa = etapaInfo(c.etapa);
  const prioridad = prioridadInfo(c.prioridad);

  return (
    <div
      className="amparo-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c._id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(c._id);
        }
      }}
      style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 62, borderBottom: "1px solid var(--divider)", borderLeft: `3px solid ${accent}`, background: tint }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.damnificadoNombre}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{c.numeroCaso}</div>
      </div>
      <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>{tipoLabel(c.tipoSiniestro)}</span>
      <div>{etapa && <Badge variant={etapa.badge}>{etapa.labelAgente}</Badge>}</div>
      <div>{prioridad && <Badge variant={prioridad.badge}>{prioridad.label}</Badge>}</div>
      <VencCell venc={c.vencimiento} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{formatFecha(c.creadoEn)}</span>
      <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
        <ChevronRight size={18} />
      </span>
    </div>
  );
}

function TablaCasos({ rows, onOpen }: { rows: Fila[]; onOpen: (id: Id<"casos">) => void }) {
  return (
    <ListCard>
      <HeaderRow />
      {rows.length === 0 ? (
        <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)" }}>
          Sin resultados para la búsqueda.
        </div>
      ) : (
        rows.map((c) => <CaseRow key={c._id} c={c} onOpen={onOpen} />)
      )}
    </ListCard>
  );
}

function TablaSkeleton() {
  const blk = (w: number | string, h = 12) => <Skeleton width={w} height={h} />;
  return (
    <ListCard>
      <HeaderRow />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 62, borderBottom: "1px solid var(--divider)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {blk("72%")}
            {blk("40%")}
          </div>
          {blk("62%")}
          {blk(88, 20)}
          {blk(54, 20)}
          {blk("66%")}
          {blk("58%")}
          <span />
        </div>
      ))}
    </ListCard>
  );
}

/** Fail-closed: si `listMine` falla (p. ej. sesión expirada), ofrecemos re-login. */
class ListaErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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
            title="No pudimos cargar tus casos"
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
