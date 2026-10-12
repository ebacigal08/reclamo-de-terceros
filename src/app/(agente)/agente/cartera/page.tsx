"use client";

import { Component, CSSProperties, ReactNode, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { BriefcaseBusiness, Inbox, Search } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, EmptyState, Input, Skeleton } from "@/components/ui";
import { RUTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";

/**
 * Cartera de FedPat (REC-160). Cuarta pantalla de listado del panel: mismo
 * scaffolding de tabla que activos, histórico y clientes, con columnas propias
 * y su query. Se copia en vez de extraerse por el mismo motivo que explica
 * `clientes/page.tsx`: las cuatro difieren en columnas y en el contenido de
 * cada celda, y una tabla configurable sería el componente `Table` que el
 * design system deliberadamente todavía no tiene.
 *
 * ⚠️ Lee de Convex, NO de FedPat. La API es una foto diaria sin búsqueda por
 * cliente ni paginación (la única operación que ofrece es "dame toda la cartera
 * a la fecha X"), así que consultarla en vivo bajaría el padrón completo en
 * cada carga, sin reactividad ni índices y sin ganar frescura. De ahí el cartel
 * de procedencia: sin él, el agente asumiría que lo que ve es el estado de hoy.
 *
 * Las filas NO son clickeables: la ficha del cliente con sus pólizas es
 * REC-162, y necesita el endpoint de certificados que el CSV no tiene.
 */
const COLS = "1.7fr 1fr 1.6fr 1fr 0.8fr";

export default function CarteraPage() {
  return (
    <CarteraErrorBoundary>
      <CarteraView />
    </CarteraErrorBoundary>
  );
}

function CarteraView() {
  const clientes = useQuery(api.cartera.listar, {});
  const estado = useQuery(api.cartera.estadoCartera, {});
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    if (!clientes) return clientes;
    const t = q.trim().toLowerCase();
    if (!t) return clientes;
    // Se busca por nombre, documento, CUIT y matrícula. Deliberadamente NO por
    // email: en esta tabla el email no es identificador —hay 41 repetidos, uno
    // en 8 filas— y ofrecerlo como criterio sugeriría que distingue a una
    // persona. Nombre, documento y matrícula sí.
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(t) ||
        (c.numeroDocumento ?? "").toLowerCase().includes(t) ||
        (c.cuit ?? "").toLowerCase().includes(t) ||
        c.matricula.toLowerCase().includes(t),
    );
  }, [clientes, q]);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1160, margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="text-h2" style={{ margin: 0 }}>Cartera</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
          Los clientes de seguros del estudio, importados de FedPat
        </p>
      </div>

      <Procedencia estado={estado} />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div style={{ width: 340, maxWidth: "55%" }}>
          <Input
            placeholder="Buscar por nombre, documento, CUIT o matrícula"
            prefix={<Search size={15} />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {/* Orden fijo (no interactivo): sólo indica el criterio actual. */}
        <span style={pillStyle}>
          {clientes ? `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"} · alfabético` : "Alfabético"}
        </span>
      </div>

      {/* Tabla / estados */}
      {clientes === undefined ? (
        <TablaSkeleton />
      ) : clientes.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <EmptyState
            icon={<BriefcaseBusiness size={26} strokeWidth={1.5} />}
            title="Todavía no se importó la cartera"
            description="La carga se hace por consola con scripts/importar-cartera.mjs. Cuando termine, los clientes aparecen acá."
          />
        </div>
      ) : (
        <TablaCartera rows={filtrados ?? []} />
      )}
    </div>
  );
}

/** `undefined` mientras la query carga, igual que el resto del panel. */
type Estado =
  | { ultimoCompleto: Resumen | null; cargaIncompleta: Resumen | null }
  | undefined;

type Resumen = {
  archivo: string;
  fuente: "csv" | "api";
  iniciadoEn: number;
  completadoEn?: number;
  filasEsperadas: number;
  procesadas: number;
  desvioAlCerrar?: string;
};

/**
 * El cartel de procedencia. **No es decoración: es lo que hace honesta a la
 * pantalla**, porque el listado lee de Convex y no de FedPat.
 *
 * ⚠️ Los cuatro estados son cuatro, y no dos, por un motivo concreto: `listar`
 * devuelve TODAS las filas de la tabla, incluidas las que escribió una corrida
 * que se interrumpió a mitad de camino. Si el cartel mostrara solamente la
 * fecha del último import completo, le estaría atribuyendo a esa fecha filas
 * que son más nuevas — mentira distinta de "anunciar un import a medias como
 * completo", pero igual de mala.
 *
 * Por eso el cuarto caso (completo + incompleta posterior) avisa de las dos
 * cosas en vez de elegir una.
 */
function Procedencia({ estado }: { estado: Estado }) {
  // Mientras carga no se dice nada: un cartel que primero afirma "sin datos" y
  // después se corrige es peor que ningún cartel.
  if (estado === undefined) return null;

  const { ultimoCompleto, cargaIncompleta } = estado;

  if (!ultimoCompleto && !cargaIncompleta) return null; // lo cubre el EmptyState

  const parcial = (r: Resumen) =>
    `${r.procesadas.toLocaleString("es-AR")} de ${r.filasEsperadas.toLocaleString("es-AR")} filas`;

  if (!ultimoCompleto && cargaIncompleta) {
    return (
      <div style={{ marginBottom: 16 }}>
        <Alert variant="warning" title="Carga incompleta">
          La última importación no terminó: entraron {parcial(cargaIncompleta)}. Lo que ves
          está parcial. Volvé a correr el import antes de usar estos datos.
        </Alert>
      </div>
    );
  }

  if (ultimoCompleto && !cargaIncompleta) {
    return (
      <div style={{ marginBottom: 16 }}>
        <span style={pillStyle}>
          Datos de {ultimoCompleto.fuente === "csv" ? "la exportación" : "la API"}{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{ultimoCompleto.archivo}</code>
          {" · importados el "}
          {formatFecha(ultimoCompleto.completadoEn ?? ultimoCompleto.iniciadoEn)}
        </span>
      </div>
    );
  }

  // El cuarto caso: hay una cartera completa Y una carga posterior a medias
  // encima. Las filas de esa carga ya están en el listado, así que la fecha del
  // import completo no describe todo lo que se está mostrando.
  return (
    <div style={{ marginBottom: 16 }}>
      <Alert variant="warning" title="Hay una carga posterior sin terminar">
        La cartera completa es del {formatFecha(ultimoCompleto!.completadoEn ?? ultimoCompleto!.iniciadoEn)}{" "}
        (<code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{ultimoCompleto!.archivo}</code>), pero
        encima hay una importación que no terminó: entraron {parcial(cargaIncompleta!)}. Parte de
        estas filas son más nuevas que esa fecha. Volvé a correr el import para dejarlo consistente.
      </Alert>
    </div>
  );
}

type Fila = {
  _id: Id<"carteraClientes">;
  matricula: string;
  nombre: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  direccion?: string;
  localidad?: string;
  cp?: string;
  cpa?: string;
  telefono?: string;
  email?: string;
  cuit?: string;
};

/** "DNI 12345678", o el CUIT si no hay documento (las 30 Personas Jurídicas). */
function documento(c: Fila): string {
  if (c.numeroDocumento) return `${c.tipoDocumento ?? ""} ${c.numeroDocumento}`.trim();
  if (c.cuit) return `CUIT ${c.cuit}`;
  return "—";
}

/** "C1425DJE" si hay CPA real, si no el CP viejo. Los dos pueden faltar. */
function codigoPostal(c: Fila): string {
  return c.cpa || c.cp || "";
}

function ListCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 820 }}>{children}</div>
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

function HeaderRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 42, borderBottom: "1px solid var(--border)", background: "var(--bg-inset)" }}>
      <span style={headCell}>Cliente</span>
      <span style={headCell}>Documento</span>
      {/* La dirección va en la grilla a propósito: es la columna donde se
          verifica a ojo que el arreglo del `N°` entró (el export trae `N¿` en
          1470 de 1471 filas). Sin ella, el fix no es observable desde la app. */}
      <span style={headCell}>Dirección</span>
      <span style={headCell}>Localidad</span>
      <span style={headCell}>Teléfono</span>
    </div>
  );
}

function ClienteRow({ c }: { c: Fila }) {
  const cp = codigoPostal(c);
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: "0 18px", height: 62, borderBottom: "1px solid var(--divider)" }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.nombre}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
          {c.matricula}
        </div>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
        {documento(c)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.direccion || "—"}
        </div>
        {c.email ? (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.email}
          </div>
        ) : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.localidad || "—"}
        </div>
        {cp ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{cp}</div>
        ) : null}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
        {c.telefono || "—"}
      </span>
    </div>
  );
}

function TablaCartera({ rows }: { rows: Fila[] }) {
  return (
    <ListCard>
      <HeaderRow />
      {rows.length === 0 ? (
        <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)" }}>
          Sin resultados para la búsqueda.
        </div>
      ) : (
        rows.map((c) => <ClienteRow key={c._id} c={c} />)
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
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {blk("62%")}
            {blk("36%")}
          </div>
          {blk("58%")}
        </div>
      ))}
    </ListCard>
  );
}

/** Fail-closed: si las queries fallan (p. ej. sesión expirada), ofrecemos re-login. */
class CarteraErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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
            title="No pudimos cargar la cartera"
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
