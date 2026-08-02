"use client";

import { Component, CSSProperties, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ChevronRight, Inbox, Search, Users } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, EmptyState, Input, Skeleton } from "@/components/ui";
import { RUTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";

// Agenda de clientes (REC-90). Tercera pantalla de listado del panel: mismo
// scaffolding de tabla que la lista de activos y el histórico, con columnas
// propias y su query. Se copia en vez de extraerse porque las tres difieren en
// columnas y en el contenido de cada celda, y una tabla configurable sería el
// componente `Table` que el design system deliberadamente todavía no tiene.
const COLS = "1.9fr 1fr 1fr 0.9fr 28px";

export default function ClientesPage() {
  return (
    <ClientesErrorBoundary>
      <ClientesView />
    </ClientesErrorBoundary>
  );
}

function ClientesView() {
  const router = useRouter();
  const clientes = useQuery(api.clientes.listMine, {});
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    if (!clientes) return clientes;
    const t = q.trim().toLowerCase();
    if (!t) return clientes;
    // Se busca también por email y teléfono: en una agenda, "el que me llamó
    // desde este número" es una forma de buscar tan legítima como el nombre.
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(t) ||
        c.email.toLowerCase().includes(t) ||
        c.telefono.toLowerCase().includes(t),
    );
  }, [clientes, q]);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1160, margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="text-h2" style={{ margin: 0 }}>Clientes</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
          Todas las personas con las que tenés o tuviste un caso
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div style={{ width: 340, maxWidth: "55%" }}>
          <Input
            placeholder="Buscar por nombre, email o teléfono"
            prefix={<Search size={15} />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {/* Orden fijo (no interactivo): sólo indica el criterio actual. */}
        <span style={pillStyle}>Ordenado por actividad reciente</span>
      </div>

      {/* Tabla / estados */}
      {clientes === undefined ? (
        <TablaSkeleton />
      ) : clientes.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <EmptyState
            icon={<Users size={26} strokeWidth={1.5} />}
            title="Todavía no tenés clientes"
            description="Cuando des de alta un caso, la persona damnificada aparece acá con todos sus casos."
          />
        </div>
      ) : (
        <TablaClientes rows={filtrados ?? []} onOpen={(id) => router.push(RUTAS.agente.cliente(id))} />
      )}
    </div>
  );
}

type Fila = {
  _id: Id<"damnificados">;
  nombre: string;
  email: string;
  telefono: string;
  cuentaActivada: boolean;
  casosAbiertos: number;
  casosCerrados: number;
  casosTotal: number;
  ultimoCasoEn: number;
};

/** "3 casos · 1 cerrado" — el total manda, el cerrado es la aclaración. */
function resumenCasos(c: Fila): string {
  const total = `${c.casosTotal} ${c.casosTotal === 1 ? "caso" : "casos"}`;
  return c.casosCerrados > 0 ? `${total} · ${c.casosCerrados} cerrado${c.casosCerrados === 1 ? "" : "s"}` : total;
}

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
      <span style={headCell}>Cliente</span>
      <span style={headCell}>Teléfono</span>
      <span style={headCell}>Casos</span>
      <span style={headCell}>Acceso</span>
      <span />
    </div>
  );
}

function ClienteRow({ c, onOpen }: { c: Fila; onOpen: (id: Id<"damnificados">) => void }) {
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
          {c.nombre}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.email}
        </div>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{c.telefono}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>{resumenCasos(c)}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
          {formatFecha(c.ultimoCasoEn)}
        </div>
      </div>
      {/* Se reusan los tokens `respondido`/`pendiente` en vez de inventar un par
          nuevo: son los mismos dos estados (listo / falta) que ya pintan los
          pedidos, y un color nuevo para un booleano sería una decisión de diseño
          que este ticket no tiene por qué tomar. */}
      <div>
        <Badge variant={c.cuentaActivada ? "respondido" : "pendiente"}>
          {c.cuentaActivada ? "Activado" : "Sin activar"}
        </Badge>
      </div>
      <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
        <ChevronRight size={18} />
      </span>
    </div>
  );
}

function TablaClientes({ rows, onOpen }: { rows: Fila[]; onOpen: (id: Id<"damnificados">) => void }) {
  return (
    <ListCard>
      <HeaderRow />
      {rows.length === 0 ? (
        <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)" }}>
          Sin resultados para la búsqueda.
        </div>
      ) : (
        rows.map((c) => <ClienteRow key={c._id} c={c} onOpen={onOpen} />)
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
            {blk("54%")}
          </div>
          {blk("62%")}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {blk("58%")}
            {blk("40%")}
          </div>
          {blk(80, 20)}
          <span />
        </div>
      ))}
    </ListCard>
  );
}

/** Fail-closed: si `listMine` falla (p. ej. sesión expirada), ofrecemos re-login. */
class ClientesErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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
            title="No pudimos cargar tus clientes"
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
