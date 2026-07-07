"use client";

import { Component, CSSProperties, FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { AlertTriangle, ArrowLeft, CheckCircle2, Inbox, Loader2, Send } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Badge, Button, EmptyState, Skeleton, Textarea } from "@/components/ui";
import { RUTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";

// DTO reusado de `casos.get` (owner-scoped): trae el caso + `pedidos` proyectados.
// `undefined`=cargando, `null`=no-encontrado/no-dueño, objeto=caso presente.
type Ficha = NonNullable<FunctionReturnType<typeof api.casos.get>>;

// Umbral de "pedido poco específico": sugiere, NO bloquea (issue REC-24).
const MIN_SUGERIDO = 10;
const MAX_DESCRIPCION = 500;

/** Extrae el mensaje legible de un ConvexError (mismo helper que Nuevo caso). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

// ── Entrada: error boundary (padre del que llama useQuery) ────────
export function SolicitarDocumentacionView({ casoId }: { casoId: string }) {
  return (
    <SolicitarErrorBoundary>
      <SolicitarContent casoId={casoId} />
    </SolicitarErrorBoundary>
  );
}

function SolicitarContent({ casoId }: { casoId: string }) {
  // Si `casoId` no es un Id válido, la validación de args de Convex lanza en el
  // render y lo captura `SolicitarErrorBoundary` (su padre).
  const caso = useQuery(api.casos.get, { casoId: casoId as Id<"casos"> });
  if (caso === undefined) return <SolicitarSkeleton />;
  if (caso === null) return <SolicitarNoEncontrado />;
  return <SolicitarForm caso={caso} />;
}

// ── Pantalla principal ───────────────────────────────────────────
function SolicitarForm({ caso }: { caso: Ficha }) {
  const router = useRouter();
  const solicitar = useMutation(api.pedidos.crear);

  const [descripcion, setDescripcion] = useState("");
  const [topError, setTopError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);

  const cerrado = caso.cerrado;
  const nombre = caso.damnificado?.nombre ?? "Damnificado";
  const trimmed = descripcion.trim();
  const sugerencia =
    trimmed.length > 0 && trimmed.length < MIN_SUGERIDO
      ? "Sé más específico: describí qué documento o información necesitás exactamente."
      : undefined;
  // `casos.get` trae `pedidos` en orden ascendente por creación → mostramos el
  // más reciente primero, sobre una COPIA (no mutar el array de la query).
  const historial = [...caso.pedidos].reverse();

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const texto = descripcion.trim();
    if (!texto) {
      setTopError("Escribí qué documentación necesitás.");
      return;
    }
    setTopError(null);
    setLoading(true);
    try {
      await solicitar({ casoId: caso._id, descripcion: texto });
      setExito(true);
      // Confirmación breve y vuelta a la ficha (la live query refresca Pedidos).
      setTimeout(() => router.push(RUTAS.agente.caso(caso._id)), 1200);
    } catch (err) {
      setTopError(mensajeError(err, "No pudimos enviar el pedido. Intentá de nuevo."));
      setLoading(false);
    }
  }

  if (exito) {
    return (
      <div style={pageStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 480 }}>
          <div style={confirmCardStyle}>
            <span style={confirmIconStyle}>
              <CheckCircle2 size={34} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: "var(--text-h3-size)", fontWeight: 700, color: "var(--text-primary)" }}>
                El pedido fue enviado
              </h2>
              <p style={{ margin: "10px 0 0", fontSize: "var(--text-body-size)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                Le dejamos registrada la notificación a{" "}
                <strong style={{ color: "var(--text-primary)" }}>{nombre}</strong>; el aviso por email
                queda preparado y va a poder responder el pedido desde su cuenta.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)", marginTop: 4 }}>
              <Loader2 size={15} className="animate-spin" />
              Volviendo a la ficha…
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <button type="button" onClick={() => router.push(RUTAS.agente.caso(caso._id))} style={backLinkStyle}>
        <ArrowLeft size={16} /> Volver a la ficha
      </button>

      <div style={{ margin: "12px 0 20px" }}>
        <h1 className="text-h2" style={{ margin: 0 }}>Solicitar documentación</h1>
        <p style={{ margin: "5px 0 0", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
          {nombre} · {caso.numeroCaso}
        </p>
      </div>

      {topError && (
        <div style={{ marginBottom: 18 }}>
          <Alert variant="error" title="No pudimos enviar el pedido">{topError}</Alert>
        </div>
      )}

      {cerrado && (
        <div style={{ marginBottom: 18 }}>
          <Alert variant="info" title="Caso cerrado">
            Este caso está cerrado, así que no podés enviar nuevos pedidos de documentación.
          </Alert>
        </div>
      )}

      {/* Pedidos anteriores */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={cardTitleStyle}>Pedidos anteriores</h3>
          {historial.length > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
              {historial.length} pedido{historial.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div style={{ padding: "14px 16px" }}>
          {historial.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {historial.map((p) => (
                <PedidoHistorialRow key={p._id} pedido={p} />
              ))}
            </div>
          ) : (
            <HistorialVacio />
          )}
        </div>
      </div>

      {/* Nuevo pedido */}
      <form onSubmit={onSubmit} style={{ marginTop: 18 }}>
        <div style={{ ...cardStyle, padding: 20 }}>
          <Textarea
            label="¿Qué necesitás del damnificado?"
            required
            rows={5}
            maxLength={MAX_DESCRIPCION}
            showCount
            placeholder="Ej: Necesito el acta policial de la denuncia y dos fotos del daño visible del vehículo."
            value={descripcion}
            onChange={(e) => {
              setDescripcion(e.target.value);
              if (topError) setTopError(null);
            }}
            disabled={loading || cerrado}
            helperText={sugerencia}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
          <Button variant="ghost" type="button" disabled={loading} onClick={() => router.push(RUTAS.agente.caso(caso._id))}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={loading}
            disabled={cerrado}
            iconLeft={loading ? undefined : <Send size={17} />}
          >
            {loading ? "Enviando…" : "Enviar pedido"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Sub-componentes de presentación ──────────────────────────────
function PedidoHistorialRow({ pedido }: { pedido: Ficha["pedidos"][number] }) {
  return (
    <div
      style={{
        background: "var(--bg-inset)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
          Enviado {formatFecha(pedido.creadoEn)}
          {pedido.respondido && pedido.respondidoEn ? ` · Respondido ${formatFecha(pedido.respondidoEn)}` : ""}
        </span>
        <Badge variant={pedido.respondido ? "respondido" : "pendiente"}>
          {pedido.respondido ? "Respondido" : "Pendiente"}
        </Badge>
      </div>
      <div style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-primary)", lineHeight: 1.5, wordBreak: "break-word" }}>
        {pedido.descripcion}
      </div>
    </div>
  );
}

function HistorialVacio() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px",
        border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-inset)",
      }}
    >
      <span style={{ color: "var(--text-tertiary)", display: "flex", flexShrink: 0 }}>
        <Send size={18} />
      </span>
      <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
        Este es el primer pedido de documentación para este caso.
      </span>
    </div>
  );
}

// ── Estados de carga / no-encontrado / error ─────────────────────
function SolicitarSkeleton() {
  return (
    <div style={pageStyle}>
      <Skeleton width={120} height={14} style={{ marginBottom: 22 }} />
      <Skeleton width={260} height={24} style={{ marginBottom: 8 }} />
      <Skeleton width={200} height={12} style={{ marginBottom: 24 }} />
      <Skeleton height={120} radius="var(--radius-lg)" style={{ marginBottom: 18 }} />
      <Skeleton height={200} radius="var(--radius-lg)" />
    </div>
  );
}

function SolicitarNoEncontrado() {
  return (
    <div style={pageStyle}>
      <a href={RUTAS.agente.casos} style={{ ...backLinkStyle, textDecoration: "none" }}>
        <ArrowLeft size={16} /> Volver a casos
      </a>
      <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
        <EmptyState
          icon={<AlertTriangle size={26} strokeWidth={1.5} />}
          title="No encontramos este caso"
          description="Puede que se haya cerrado o que no tengas acceso. Volvé a tus casos para continuar."
          action={
            <a href={RUTAS.agente.casos} style={linkStyle}>
              Volver a casos
            </a>
          }
        />
      </div>
    </div>
  );
}

/**
 * Fail-closed: si `casos.get` lanza (sesión expirada, id malformado que no pasa
 * la validación `v.id`), ofrecemos volver a los casos o re-loguear. Debe ser
 * PADRE del componente que hace `useQuery` (no captura errores propios).
 */
class SolicitarErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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
            title="No pudimos cargar el caso"
            description="Puede que tu sesión haya expirado o que el enlace no sea válido."
            action={
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <a href={RUTAS.agente.casos} style={linkStyle}>
                  Volver a casos
                </a>
                <a href={RUTAS.login} style={linkStyle}>
                  Volver a ingresar
                </a>
              </div>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Estilos compartidos ──────────────────────────────────────────
const pageStyle: CSSProperties = { padding: "28px 32px", maxWidth: 720, margin: "0 auto" };

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
};

const linkStyle: CSSProperties = {
  color: "var(--text-link)",
  fontWeight: 600,
  fontSize: "var(--text-body-size)",
};

const cardStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-sm)",
  overflow: "hidden",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "13px 18px",
  borderBottom: "1px solid var(--divider)",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h4-size)",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const confirmCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  textAlign: "center",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-xl)",
  boxShadow: "var(--shadow-lift)",
  padding: "40px 36px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 16,
};

const confirmIconStyle: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  background: "var(--success-50)",
  color: "var(--success-600)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
