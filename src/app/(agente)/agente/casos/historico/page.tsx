"use client";

import { Component, CSSProperties, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Archive, ChevronRight, Inbox, Search } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, EmptyState, Input, Skeleton } from "@/components/ui";
import { RESULTADOS_CIERRE, RUTAS, TIPOS_SINIESTRO } from "@/lib/constants";
import { formatFecha } from "@/lib/format";

// Histórico de casos cerrados (REC-66). Pantalla hermana de la lista de activos
// (`../page.tsx`): mismo scaffolding de tabla, columnas propias (Resultado +
// fecha de cierre) y query separada `casos.listClosed`.
const COLS = "1.7fr 1fr 1.2fr 1fr 28px";

const tipoLabel = (v: string) => TIPOS_SINIESTRO.find((t) => t.value === v)?.label ?? v;

// Lookup del resultado con fallback defensivo si `resultadoCierre` viniera null
// (dato legacy). Mismo patrón que FichaCasoView.
const resultadoInfo = (v: string | null) =>
  RESULTADOS_CIERRE.find((r) => r.value === v) ?? { label: "Cerrado", badge: "apelacion" as const };

export default function HistoricoPage() {
  return (
    <HistoricoErrorBoundary>
      <HistoricoView />
    </HistoricoErrorBoundary>
  );
}

function HistoricoView() {
  const router = useRouter();
  const casos = useQuery(api.casos.listClosed, {});
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

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1160, margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="text-h2" style={{ margin: 0 }}>Histórico</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
          Casos cerrados
        </p>
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
        <span style={pillStyle}>Ordenado por fecha de cierre</span>
      </div>

      {/* Tabla / estados */}
      {casos === undefined ? (
        <TablaSkeleton />
      ) : casos.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <EmptyState
            icon={<Archive size={26} strokeWidth={1.5} />}
            title="Todavía no cerraste ningún caso"
            description="Cuando cierres un caso con su resultado, va a quedar acá para que puedas consultarlo."
          />
        </div>
      ) : (
        <TablaCerrados rows={filtrados ?? []} onOpen={(id) => router.push(RUTAS.agente.caso(id))} />
      )}
    </div>
  );
}

type Fila = {
  _id: Id<"casos">;
  numeroCaso: string;
  damnificadoNombre: string;
  tipoSiniestro: string;
  resultadoCierre: string | null;
  cerradoEn: number;
  creadoEn: number;
};

function ListCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 680 }}>{children}</div>
      </div>
    </div>
  );
}

const headCell: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-label-size)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
};

const pillStyle: CSSProperties = {
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
};

function HeaderRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 42, borderBottom: "1px solid var(--border)", background: "var(--bg-inset)" }}>
      <span style={headCell}>Damnificado</span>
      <span style={headCell}>Siniestro</span>
      <span style={headCell}>Resultado</span>
      <span style={headCell}>Cerrado</span>
      <span />
    </div>
  );
}

function CerradoRow({ c, onOpen }: { c: Fila; onOpen: (id: Id<"casos">) => void }) {
  const resultado = resultadoInfo(c.resultadoCierre);
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
      style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 62, borderBottom: "1px solid var(--divider)" }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.damnificadoNombre}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{c.numeroCaso}</div>
      </div>
      <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>{tipoLabel(c.tipoSiniestro)}</span>
      <div><Badge variant={resultado.badge}>{resultado.label}</Badge></div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>{formatFecha(c.cerradoEn)}</span>
      <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
        <ChevronRight size={18} />
      </span>
    </div>
  );
}

function TablaCerrados({ rows, onOpen }: { rows: Fila[]; onOpen: (id: Id<"casos">) => void }) {
  return (
    <ListCard>
      <HeaderRow />
      {rows.length === 0 ? (
        <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)" }}>
          Sin resultados para la búsqueda.
        </div>
      ) : (
        rows.map((c) => <CerradoRow key={c._id} c={c} onOpen={onOpen} />)
      )}
    </ListCard>
  );
}

function TablaSkeleton() {
  const blk = (w: number | string, h = 12) => <Skeleton width={w} height={h} />;
  return (
    <ListCard>
      <HeaderRow />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 62, borderBottom: "1px solid var(--divider)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {blk("72%")}
            {blk("40%")}
          </div>
          {blk("62%")}
          {blk(80, 20)}
          {blk("58%")}
          <span />
        </div>
      ))}
    </ListCard>
  );
}

/** Fail-closed: si `listClosed` falla (p. ej. sesión expirada), ofrecemos re-login. */
class HistoricoErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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
            title="No pudimos cargar el histórico"
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
