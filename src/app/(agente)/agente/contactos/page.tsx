"use client";

import { Component, CSSProperties, ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Inbox, Search, UserPlus } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Checkbox, EmptyState, Input, Select, Skeleton } from "@/components/ui";
import { RUTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";

/**
 * Contactos (REC-164): prospectos a contactar, importados del Excel de
 * asegurados de dos productores. Se apoya en la estructura de
 * `cartera/page.tsx` (error boundary, búsqueda, grilla, skeleton, empty state y
 * cartel de procedencia), copiada y no extraída por el mismo motivo que explica
 * esa página.
 *
 * Lo propio de esta pantalla:
 *   - el ESTADO de cada contacto, que el agente cambia desde la fila;
 *   - los filtros por estado, por productor y "Sólo a verificar";
 *   - la marca "A verificar", con la observación del Excel y las marcas
 *     automáticas a la vista: el archivo se transcribió de capturas de
 *     pantalla, y la mitad de las filas trae un "nombre cortado en la foto".
 */
const COLS = "1.8fr 1fr 1.7fr 1fr 150px";

const ESTADOS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "contactado", label: "Contactado" },
  { value: "interesado", label: "Interesado" },
  { value: "descartado", label: "Descartado" },
] as const;
type EstadoContacto = (typeof ESTADOS)[number]["value"];

/** Las marcas automáticas del import, en lenguaje claro. */
const MARCAS: Record<string, string> = {
  SIN_CUIT: "Sin CUIT",
  SIN_IDENTIFICADOR: "Sin CUIT ni documento",
  CUIT_COMPARTIDO: "CUIT compartido con otra persona",
};

export default function ContactosPage() {
  return (
    <ContactosErrorBoundary>
      <ContactosView />
    </ContactosErrorBoundary>
  );
}

function ContactosView() {
  const contactos = useQuery(api.contactos.listar, {});
  const estado = useQuery(api.contactos.estadoLista, {});
  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoContacto | "todos">("todos");
  const [productor, setProductor] = useState("todos");
  const [soloAVerificar, setSoloAVerificar] = useState(false);

  const productores = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contactos ?? []) m.set(c.productor, c.productorNombre);
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [contactos]);

  // Los filtros que NO son el de estado. Los contadores de las pestañas de
  // estado se calculan sobre esto, así responden "¿cuántos pendientes hay de
  // ESTE productor?" y no un total que no coincide con lo que se ve.
  const base = useMemo(() => {
    if (!contactos) return contactos;
    const t = q.trim().toLowerCase();
    return contactos.filter((c) => {
      if (productor !== "todos" && c.productor !== productor) return false;
      if (soloAVerificar && !c.aVerificar) return false;
      if (!t) return true;
      // Nombre, documento y CUIT. El email NO: viene transcripto de fotos, con
      // terminaciones asumidas ("se asumió .com"), y no identifica a nadie.
      return (
        c.nombre.toLowerCase().includes(t) ||
        (c.numeroDocumento ?? "").includes(t) ||
        (c.cuit ?? "").includes(t)
      );
    });
  }, [contactos, q, productor, soloAVerificar]);

  const conteos = useMemo(() => {
    const out: Record<string, number> = { todos: base?.length ?? 0 };
    for (const e of ESTADOS) out[e.value] = 0;
    for (const c of base ?? []) out[c.estado]++;
    return out;
  }, [base]);

  const filtrados = useMemo(
    () => (base && filtroEstado !== "todos" ? base.filter((c) => c.estado === filtroEstado) : base),
    [base, filtroEstado],
  );

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="text-h2" style={{ margin: 0 }}>Contactos</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
          Prospectos a contactar, de los asegurados de los productores
        </p>
      </div>

      <Procedencia estado={estado} />

      {/* Pestañas de estado */}
      <div role="tablist" aria-label="Filtrar por estado" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {[{ value: "todos" as const, label: "Todos" }, ...ESTADOS].map((e) => {
          const activo = filtroEstado === e.value;
          return (
            <button
              key={e.value}
              role="tab"
              aria-selected={activo}
              onClick={() => setFiltroEstado(e.value)}
              style={{
                ...pillStyle,
                cursor: "pointer",
                color: activo ? "var(--text-primary)" : "var(--text-tertiary)",
                background: activo ? "var(--bg-surface)" : "var(--bg-subtle)",
                borderColor: activo ? "var(--border-strong)" : "var(--border)",
              }}
            >
              {e.label}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{conteos[e.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        <div style={{ width: 320, maxWidth: "100%" }}>
          <Input
            placeholder="Buscar por nombre, documento o CUIT"
            prefix={<Search size={15} />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div style={{ width: 280, maxWidth: "100%" }}>
          <Select
            aria-label="Productor"
            value={productor}
            onChange={(e) => setProductor(e.target.value)}
            options={[
              { value: "todos", label: "Todos los productores" },
              ...productores.map(([p, nombre]) => ({ value: p, label: `${p} · ${nombre}` })),
            ]}
          />
        </div>
        <Checkbox
          label="Sólo a verificar"
          checked={soloAVerificar}
          onChange={(e) => setSoloAVerificar(e.target.checked)}
        />
        <span style={{ ...pillStyle, marginLeft: "auto" }}>
          {filtrados ? `${filtrados.length} ${filtrados.length === 1 ? "contacto" : "contactos"} · alfabético` : "Alfabético"}
        </span>
      </div>

      {contactos === undefined ? (
        <TablaSkeleton />
      ) : contactos.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <EmptyState
            icon={<UserPlus size={26} strokeWidth={1.5} />}
            title="Todavía no se importaron contactos"
            description="La carga se hace por consola con scripts/importar-contactos.mjs. Cuando termine, los contactos aparecen acá."
          />
        </div>
      ) : (
        <TablaContactos rows={filtrados ?? []} />
      )}
    </div>
  );
}

type Estado =
  | { ultimoCompleto: Resumen | null; cargaIncompleta: Resumen | null }
  | undefined;

type Resumen = {
  archivo: string;
  iniciadoEn: number;
  completadoEn?: number;
  filasEsperadas: number;
  procesadas: number;
  desvioAlCerrar?: string;
  noVinieron?: number;
};

/**
 * Cartel de procedencia, con los mismos cuatro estados que Cartera (ver el
 * comentario de `Procedencia` en `cartera/page.tsx`). Suma una cosa: si el
 * último import completo dejó contactos de la base que no venían en el archivo,
 * lo dice, porque esos contactos siguen en la lista.
 */
function Procedencia({ estado }: { estado: Estado }) {
  if (estado === undefined) return null;
  const { ultimoCompleto, cargaIncompleta } = estado;
  if (!ultimoCompleto && !cargaIncompleta) return null;

  const parcial = (r: Resumen) =>
    `${r.procesadas.toLocaleString("es-AR")} de ${r.filasEsperadas.toLocaleString("es-AR")} contactos`;
  const archivo = (r: Resumen) => (
    <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{r.archivo}</code>
  );

  if (!ultimoCompleto && cargaIncompleta) {
    return (
      <div style={{ marginBottom: 16 }}>
        <Alert variant="warning" title="Carga incompleta">
          La última importación no terminó: entraron {parcial(cargaIncompleta)}. Lo que ves está
          parcial. Volvé a correr el import antes de usar estos datos.
        </Alert>
      </div>
    );
  }

  if (ultimoCompleto && !cargaIncompleta) {
    const noVinieron = ultimoCompleto.noVinieron ?? 0;
    return (
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
        <span style={pillStyle}>
          Datos del Excel {archivo(ultimoCompleto)}
          {" · importados el "}
          {formatFecha(ultimoCompleto.completadoEn ?? ultimoCompleto.iniciadoEn)}
        </span>
        {noVinieron > 0 ? (
          <Alert variant="info" title={`${noVinieron} ${noVinieron === 1 ? "contacto no vino" : "contactos no vinieron"} en el último archivo`}>
            Siguen en la lista con su estado: el import no borra a nadie. Si se corrigió un nombre en
            el Excel, la persona puede figurar dos veces.
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Alert variant="warning" title="Hay una carga posterior sin terminar">
        La lista completa es del {formatFecha(ultimoCompleto!.completadoEn ?? ultimoCompleto!.iniciadoEn)}{" "}
        ({archivo(ultimoCompleto!)}), pero encima hay una importación que no terminó: entraron{" "}
        {parcial(cargaIncompleta!)}. Parte de estos contactos son más nuevos que esa fecha. Volvé a
        correr el import para dejarlo consistente.
      </Alert>
    </div>
  );
}

type Alternativo = {
  condicionIva?: string;
  direccion?: string;
  localidad?: string;
  codigoPostal?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  telefono?: string;
  email?: string;
  observacion?: string;
  faltanDatosObligatorios: boolean;
};

type Fila = {
  _id: Id<"contactos">;
  nombre: string;
  productor: string;
  productorNombre: string;
  cuit?: string;
  condicionIva?: string;
  direccion?: string;
  localidad?: string;
  codigoPostal?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  telefono?: string;
  email?: string;
  observacion?: string;
  faltanDatosObligatorios: boolean;
  marcas: string[];
  aVerificar: boolean;
  alternativos?: Alternativo[];
  estado: EstadoContacto;
  estadoActualizadoEn?: number;
};

function documento(d: { tipoDocumento?: string; numeroDocumento?: string }): string {
  return d.numeroDocumento ? `${d.tipoDocumento ?? ""} ${d.numeroDocumento}`.trim() : "—";
}

/**
 * Los motivos del "A verificar", de la fila principal y de las alternativas
 * (C2): una observación que vino sólo en la segunda fila también se ve.
 */
function motivos(c: Fila): string[] {
  const out = c.marcas.map((m) => MARCAS[m] ?? m);
  if (c.faltanDatosObligatorios) out.push("Faltan datos obligatorios");
  if (c.observacion) out.push(c.observacion);
  for (const a of c.alternativos ?? []) {
    if (a.faltanDatosObligatorios) out.push("Otra fila: faltan datos obligatorios");
    if (a.observacion) out.push(`Otra fila: ${a.observacion}`);
  }
  return out;
}

function ListCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 900 }}>{children}</div>
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
  minHeight: 34,
  padding: "0 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--bg-subtle)",
  color: "var(--text-tertiary)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
};

const secundario: CSSProperties = {
  fontSize: 11,
  color: "var(--text-tertiary)",
  marginTop: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const principal: CSSProperties = {
  fontSize: "var(--text-body-sm-size)",
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function HeaderRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 42, borderBottom: "1px solid var(--border)", background: "var(--bg-inset)" }}>
      <span style={headCell}>Contacto</span>
      <span style={headCell}>Documento</span>
      <span style={headCell}>Dirección</span>
      <span style={headCell}>Teléfono</span>
      <span style={headCell}>Estado</span>
    </div>
  );
}

function ContactoRow({ c }: { c: Fila }) {
  const cambiarEstado = useMutation(api.contactos.cambiarEstado);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lista = c.aVerificar ? motivos(c) : [];

  async function onEstado(nuevo: EstadoContacto) {
    setGuardando(true);
    setError(null);
    try {
      await cambiarEstado({ contactoId: c._id, estado: nuevo });
    } catch {
      setError("No se pudo guardar el estado.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--divider)" }}>
      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.nombre}
            </span>
            {c.aVerificar ? (
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)", background: "var(--warning-50)", color: "var(--warning-700)", border: "1px solid var(--warning-200)" }}>
                A verificar
              </span>
            ) : null}
          </div>
          <div style={{ ...secundario, fontFamily: "var(--font-mono)" }}>
            Productor {c.productor}
            {c.condicionIva ? ` · IVA ${c.condicionIva}` : ""}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{documento(c)}</div>
          {c.cuit ? <div style={{ ...secundario, fontFamily: "var(--font-mono)" }}>CUIT {c.cuit}</div> : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={principal}>
            {c.direccion || "—"}
            {c.localidad ? `, ${c.localidad}` : ""}
            {c.codigoPostal ? ` (${c.codigoPostal})` : ""}
          </div>
          {c.email ? <div style={secundario}>{c.email}</div> : null}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
          {c.telefono || "—"}
        </span>
        <div>
          <Select
            aria-label={`Estado de ${c.nombre}`}
            value={c.estado}
            disabled={guardando}
            onChange={(e) => onEstado(e.target.value as EstadoContacto)}
            options={ESTADOS}
            error={error ?? undefined}
          />
          {c.estadoActualizadoEn ? (
            <div style={{ ...secundario, marginTop: 4 }}>desde {formatFecha(c.estadoActualizadoEn)}</div>
          ) : null}
        </div>
      </div>

      {/* Las otras filas de la misma persona, en gris, debajo de la principal. */}
      {(c.alternativos ?? []).map((a, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, marginTop: 6, color: "var(--text-tertiary)", fontSize: 11 }}>
          <span>Otra fila del Excel</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{documento(a)}</span>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {[a.direccion, a.localidad, a.codigoPostal && `(${a.codigoPostal})`, a.email].filter(Boolean).join(" · ") || "—"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{a.telefono || "—"}</span>
          <span />
        </div>
      ))}

      {lista.length ? (
        <ul style={{ margin: "8px 0 0", padding: "6px 10px 6px 26px", borderRadius: "var(--radius-md)", background: "var(--warning-50)", color: "var(--warning-700)", fontSize: 12 }}>
          {lista.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TablaContactos({ rows }: { rows: Fila[] }) {
  return (
    <ListCard>
      <HeaderRow />
      {rows.length === 0 ? (
        <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)" }}>
          Sin resultados para estos filtros.
        </div>
      ) : (
        rows.map((c) => <ContactoRow key={c._id} c={c} />)
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
            {blk("44%")}
          </div>
          {blk("66%")}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {blk("84%")}
            {blk("58%")}
          </div>
          {blk("58%")}
          {blk("80%", 28)}
        </div>
      ))}
    </ListCard>
  );
}

/** Fail-closed: si las queries fallan (p. ej. sesión expirada), ofrecemos re-login. */
class ContactosErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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
            title="No pudimos cargar los contactos"
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
