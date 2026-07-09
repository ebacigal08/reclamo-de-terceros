"use client";

import {
  Component,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { AlertTriangle, ArrowLeft, CheckCircle2, Inbox, Loader2, Lock } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Badge, Button, EmptyState, Skeleton } from "@/components/ui";
import {
  ETAPAS,
  RESULTADOS_CIERRE,
  RUTAS,
  TIPOS_SINIESTRO,
  type ResultadoCierre,
} from "@/lib/constants";

// DTO reusado de `casos.get` (owner-scoped): trae el caso (spread `...caso`, con
// `cerrado`/`resultadoCierre`/`etapa`) + `damnificado`. `undefined`=cargando,
// `null`=no-encontrado/no-dueño, objeto=caso presente.
type Ficha = NonNullable<FunctionReturnType<typeof api.casos.get>>;

/** Extrae el mensaje legible de un ConvexError (mismo helper que las otras vistas). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

/** Info del resultado con fallback defensivo para datos legacy (resultado null). */
function infoResultado(resultado: string | null | undefined) {
  return (
    RESULTADOS_CIERRE.find((r) => r.value === resultado) ?? {
      value: "CERRADO",
      label: "Cerrado",
      descripcion: "",
      badge: "apelacion" as const,
    }
  );
}

// ── Entrada: error boundary (padre del que llama useQuery) ────────
export function CerrarCasoView({ casoId }: { casoId: string }) {
  return (
    <CerrarErrorBoundary>
      <CerrarContent casoId={casoId} />
    </CerrarErrorBoundary>
  );
}

function CerrarContent({ casoId }: { casoId: string }) {
  // Si `casoId` no es un Id válido, la validación de args de Convex lanza en el
  // render y lo captura `CerrarErrorBoundary` (su padre).
  const caso = useQuery(api.casos.get, { casoId: casoId as Id<"casos"> });
  if (caso === undefined) return <CerrarSkeleton />;
  if (caso === null) return <CerrarNoEncontrado />;
  return <CerrarForm caso={caso} />;
}

// ── Pantalla principal ───────────────────────────────────────────
function CerrarForm({ caso }: { caso: Ficha }) {
  const router = useRouter();
  const cerrar = useMutation(api.casos.cerrar);

  const [resultado, setResultado] = useState<ResultadoCierre | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);

  const yaCerrado = caso.cerrado;
  const nombre = caso.damnificado?.nombre ?? "Damnificado";
  const tipo = TIPOS_SINIESTRO.find((t) => t.value === caso.tipoSiniestro)?.label ?? caso.tipoSiniestro;
  const etapaLabel = ETAPAS.find((e) => e.value === caso.etapa)?.labelAgente ?? caso.etapa;

  async function onConfirm() {
    if (!resultado) return;
    setTopError(null);
    setLoading(true);
    try {
      await cerrar({ casoId: caso._id, resultadoCierre: resultado });
      setExito(true);
      // Confirmación breve y vuelta a la lista de casos (el caso ya no aparece).
      setTimeout(() => router.push(RUTAS.agente.casos), 1200);
    } catch (err) {
      setTopError(mensajeError(err, "No pudimos cerrar el caso. Intentá de nuevo."));
      setLoading(false);
    }
  }

  // ── Estado de confirmación (éxito) ──────────────────────────────
  if (exito) {
    const info = infoResultado(resultado);
    return (
      <div style={pageStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 480 }}>
          <div style={confirmCardStyle}>
            <span style={confirmIconStyle}>
              <CheckCircle2 size={34} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: "var(--text-h3-size)", fontWeight: 700, color: "var(--text-primary)" }}>
                Caso cerrado
              </h2>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <Badge variant={info.badge}>{info.label}</Badge>
              </div>
              <p style={{ margin: "12px 0 0", fontSize: "var(--text-body-size)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                El resultado quedó registrado para tus métricas y le avisamos a{" "}
                <strong style={{ color: "var(--text-primary)" }}>{nombre}</strong>.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)", marginTop: 4 }}>
              <Loader2 size={15} className="animate-spin" />
              Volviendo a tus casos…
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
        <h1 className="text-h2" style={{ margin: 0 }}>Cerrar caso</h1>
        <p style={{ margin: "5px 0 0", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
          {nombre} · {caso.numeroCaso}
        </p>
      </div>

      {topError && (
        <div style={{ marginBottom: 18 }}>
          <Alert variant="error" title="No pudimos cerrar el caso">{topError}</Alert>
        </div>
      )}

      {/* Resumen del caso */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={cardTitleStyle}>Resumen del caso</h3>
        </div>
        <dl style={{ margin: 0, padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 10, columnGap: 16 }}>
          <ResumenRow label="Damnificado" value={nombre} />
          <ResumenRow label="N° de caso" value={caso.numeroCaso} mono />
          <ResumenRow label="Tipo" value={tipo} />
          <ResumenRow
            label="Etapa actual"
            value={yaCerrado ? undefined : etapaLabel}
            badge={yaCerrado ? infoResultado(caso.resultadoCierre) : undefined}
          />
        </dl>
      </div>

      {yaCerrado ? (
        <>
          <div style={{ marginTop: 18 }}>
            <Alert variant="info" title="Este caso ya está cerrado">
              El caso ya fue cerrado con resultado{" "}
              <strong>{infoResultado(caso.resultadoCierre).label}</strong>. No hay nada más que hacer acá.
            </Alert>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <Button variant="primary" onClick={() => router.push(RUTAS.agente.casos)}>
              Volver a tus casos
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Aviso de acción definitiva */}
          <div style={{ marginTop: 18 }}>
            <Alert variant="warning" title="Es una acción definitiva">
              Al cerrarlo, el caso deja de aparecer en tu lista de casos activos. No se borra —
              queda en el historial para tus métricas.
            </Alert>
          </div>

          {/* Selección del resultado */}
          <div style={{ ...cardStyle, marginTop: 18, padding: 20 }}>
            <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
              ¿Con qué resultado se cierra?
            </span>
            <ResultadoSelector value={resultado} onChange={setResultado} disabled={loading} />
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
            <Button variant="ghost" type="button" disabled={loading} onClick={() => router.push(RUTAS.agente.caso(caso._id))}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="lg"
              type="button"
              loading={loading}
              disabled={!resultado}
              iconLeft={loading ? undefined : <Lock size={16} />}
              onClick={() => void onConfirm()}
            >
              {loading ? "Cerrando caso…" : "Cerrar caso"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Selector de resultado (radiogroup de 3 cards con descripción) ─
function ResultadoSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: ResultadoCierre | null;
  onChange: (v: ResultadoCierre) => void;
  disabled?: boolean;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next: number;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      next = (idx + 1) % RESULTADOS_CIERRE.length;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      next = (idx - 1 + RESULTADOS_CIERRE.length) % RESULTADOS_CIERRE.length;
    } else {
      return;
    }
    e.preventDefault();
    onChange(RESULTADOS_CIERRE[next].value);
    botones.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Resultado del cierre" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {RESULTADOS_CIERRE.map((r, idx) => {
        const sel = value === r.value;
        // Roving tabindex: la opción activa es tabbable; sin selección, la primera.
        const tabbable = sel || (value === null && idx === 0);
        return (
          <button
            type="button"
            key={r.value}
            ref={(el) => {
              botones.current[idx] = el;
            }}
            role="radio"
            aria-checked={sel}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(r.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              textAlign: "left",
              width: "100%",
              border: `1.5px solid ${sel ? "var(--primary-500)" : "var(--border-strong)"}`,
              background: sel ? "var(--primary-50)" : "var(--bg-inset)",
              borderRadius: "var(--radius-md)",
              padding: 14,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              boxShadow: sel ? "var(--focus-ring-shadow)" : "none",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                marginTop: 1,
                borderRadius: "50%",
                border: `2px solid ${sel ? "var(--primary-600)" : "var(--border-strong)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {sel && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--primary-600)" }} />}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
              <Badge variant={r.badge}>{r.label}</Badge>
              <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {r.descripcion}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Fila del resumen ─────────────────────────────────────────────
function ResumenRow({
  label,
  value,
  badge,
  mono,
}: {
  label: string;
  value?: string;
  badge?: { label: string; badge: string };
  mono?: boolean;
}) {
  return (
    <>
      <dt style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>{label}</dt>
      <dd style={{ margin: 0, justifySelf: "start" }}>
        {badge ? (
          <Badge variant={badge.badge}>{badge.label}</Badge>
        ) : (
          <span
            style={{
              fontSize: "var(--text-body-sm-size)",
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
            }}
          >
            {value}
          </span>
        )}
      </dd>
    </>
  );
}

// ── Estados de carga / no-encontrado / error ─────────────────────
function CerrarSkeleton() {
  return (
    <div style={pageStyle}>
      <Skeleton width={120} height={14} style={{ marginBottom: 22 }} />
      <Skeleton width={200} height={24} style={{ marginBottom: 8 }} />
      <Skeleton width={220} height={12} style={{ marginBottom: 24 }} />
      <Skeleton height={150} radius="var(--radius-lg)" style={{ marginBottom: 18 }} />
      <Skeleton height={200} radius="var(--radius-lg)" />
    </div>
  );
}

function CerrarNoEncontrado() {
  return (
    <div style={pageStyle}>
      <a href={RUTAS.agente.casos} style={{ ...backLinkStyle, textDecoration: "none" }}>
        <ArrowLeft size={16} /> Volver a casos
      </a>
      <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
        <EmptyState
          icon={<AlertTriangle size={26} strokeWidth={1.5} />}
          title="No encontramos este caso"
          description="Puede que no tengas acceso. Volvé a tus casos para continuar."
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
class CerrarErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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

// ── Estilos compartidos (mismos que SolicitarDocumentacionView) ──
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
