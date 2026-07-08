"use client";

import { Component, CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  Inbox,
  Scale,
  Sparkles,
  XCircle,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { ETAPAS, MOTIVO_NOTIFICACION_TEXTO, RUTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";
import { Button, EmptyState, Skeleton, Stepper } from "@/components/ui";

// DTO derivado de `casos.miCaso` (siempre en sync con el backend).
// `undefined`=cargando, `null`=sin sesión de damnificado / sin caso.
type Hub = NonNullable<FunctionReturnType<typeof api.casos.miCaso>>;

const TOTAL_PASOS = ETAPAS.length; // 6

/**
 * Texto humano del estado de cierre. Tolera `resultado === null` (dato
 * inconsistente/legacy aunque `cerrado === true`): cae a un mensaje genérico.
 */
function cierreInfo(resultado: string | null): {
  titulo: string;
  detalle: string;
  tono: "exito" | "neutro";
  Icon: typeof Sparkles;
} {
  switch (resultado) {
    case "RESUELTO":
      return {
        titulo: "¡Tu reclamo se resolvió!",
        detalle:
          "La aseguradora aceptó el reclamo. Tu agente te va a contar los próximos pasos del cobro.",
        tono: "exito",
        Icon: Sparkles,
      };
    case "RECHAZADO":
      return {
        titulo: "Tu reclamo fue rechazado",
        detalle:
          "La aseguradora no aceptó el reclamo. Tu agente puede explicarte qué opciones quedan.",
        tono: "neutro",
        Icon: XCircle,
      };
    case "EN_APELACION":
      return {
        titulo: "Tu reclamo está en apelación",
        detalle:
          "Se está apelando la decisión de la aseguradora. Te vamos a avisar cuando haya novedades.",
        tono: "neutro",
        Icon: Scale,
      };
    default:
      return {
        titulo: "Tu caso fue cerrado",
        detalle: "Si tenés dudas sobre el cierre, escribile a tu agente.",
        tono: "neutro",
        Icon: CheckCircle2,
      };
  }
}

/** Motivo de notificación → texto humano. `CASO_CERRADO` se afina por resultado. */
function textoNovedad(motivo: string, resultado: string | null): string {
  if (motivo === "CASO_CERRADO") return cierreInfo(resultado).titulo;
  return MOTIVO_NOTIFICACION_TEXTO[motivo] ?? "Novedad en tu caso";
}

// ── Entrada: error boundary (padre del que llama useQuery) ────────
export function MiCasoView() {
  return (
    <MiCasoErrorBoundary>
      <MiCasoContent />
    </MiCasoErrorBoundary>
  );
}

function MiCasoContent() {
  const data = useQuery(api.casos.miCaso, {});
  if (data === undefined) return <MiCasoSkeleton />;
  if (data === null) return <MiCasoSinCaso />;
  return <MiCasoHub data={data} />;
}

// ── Pantalla principal ───────────────────────────────────────────
function MiCasoHub({ data }: { data: Hub }) {
  const router = useRouter();
  const { caso, nombre, relato, pedidosPendientes, novedades } = data;

  // Fallback defensivo: si la etapa fuese desconocida, no rompemos el progreso.
  const idxRaw = ETAPAS.findIndex((e) => e.value === caso.etapa);
  const idx = idxRaw >= 0 ? idxRaw : 0;
  const etapaHumana = ETAPAS[idx].labelHumano;

  const relatoPendiente = !relato || !relato.completo;
  const sinPendientes = !relatoPendiente && pedidosPendientes.length === 0;

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ padding: "22px 20px 4px" }}>
        <p style={saludoStyle}>Hola, {nombre.split(" ")[0] || nombre}</p>
        <p style={numeroCasoStyle}>{caso.numeroCaso}</p>
      </div>

      {/* Hero de estado */}
      {caso.cerrado ? (
        <HeroCerrado resultado={caso.resultadoCierre} />
      ) : (
        <HeroProgreso etapaHumana={etapaHumana} idx={idx} />
      )}

      {/* Pendientes — lo más visible. En un caso cerrado no se pide nada más. */}
      {!caso.cerrado && (
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Lo que tenés pendiente</h2>
        {sinPendientes ? (
          <div style={alDiaCardStyle}>
            <CheckCircle2 size={22} style={{ color: "var(--success-600)", flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-body-size)", color: "var(--text-secondary)" }}>
              Estás al día. No tenés nada pendiente por ahora.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {relatoPendiente && (
              <PendienteCard
                icon={<FileText size={20} />}
                titulo="Contá lo que pasó"
                detalle="Necesitamos tu relato del siniestro para armar el expediente."
                cta="Empezar"
                onClick={() => router.push(RUTAS.damnificado.relato)}
              />
            )}
            {pedidosPendientes.map((p) => (
              <PendienteCard
                key={p._id}
                icon={<Bell size={20} />}
                titulo="Tu agente te pidió algo"
                detalle={p.descripcion}
                cta="Responder"
                onClick={() => router.push(RUTAS.damnificado.pedido(p._id))}
              />
            ))}
          </div>
        )}
      </section>
      )}

      {/* Acceso a documentos — siempre visible */}
      <section style={sectionStyle}>
        <button
          type="button"
          onClick={() => router.push(RUTAS.damnificado.documentos)}
          style={accesoRowStyle}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={accesoIconStyle}>
              <FolderOpen size={20} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: "var(--text-body-size)", fontWeight: 700, color: "var(--text-primary)" }}>
                Mis documentos
              </span>
              <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>
                Subí fotos, PDFs o archivos del siniestro
              </span>
            </span>
          </span>
          <ChevronRight size={20} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        </button>
      </section>

      {/* Últimas novedades */}
      <section style={{ ...sectionStyle, paddingBottom: 32 }}>
        <h2 style={sectionTitleStyle}>Últimas novedades</h2>
        {novedades.length ? (
          <div style={timelineStyle}>
            {novedades.map((n) => (
              <div key={n._id} style={novedadRowStyle}>
                <span style={novedadDotStyle} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-primary)", fontWeight: 600 }}>
                    {textoNovedad(n.motivo, caso.resultadoCierre)}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
                    {formatFecha(n.creadoEn)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={novedadesVaciasStyle}>
            <Inbox size={18} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
              Todavía no hay novedades en tu caso.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Hero: caso en curso (progreso) ───────────────────────────────
function HeroProgreso({ etapaHumana, idx }: { etapaHumana: string; idx: number }) {
  const paso = idx + 1;
  return (
    <div style={heroStyle}>
      <span style={heroKickerStyle}>El estado de tu reclamo</span>
      <h1 style={heroTitleStyle}>{etapaHumana}</h1>

      {/* Progreso primario: robusto en mobile, no depende de labels */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {ETAPAS.map((_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: "var(--radius-full)",
                background: i <= idx ? "var(--text-on-primary)" : "rgba(255,255,255,0.28)",
              }}
            />
          ))}
        </div>
        <span style={{ display: "block", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
          Paso {paso} de {TOTAL_PASOS}
        </span>
      </div>

      {/* Stepper visual (opcional): labels cortos + scroll para no romper la shell */}
      <div style={{ marginTop: 18, overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ minWidth: 520, background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", padding: "16px 16px 12px" }}>
          <Stepper steps={ETAPAS.map((e) => ({ label: e.labelAgente }))} currentStep={idx} />
        </div>
      </div>
    </div>
  );
}

// ── Hero: caso cerrado (estado final) ────────────────────────────
function HeroCerrado({ resultado }: { resultado: string | null }) {
  const { titulo, detalle, tono, Icon } = cierreInfo(resultado);
  const esExito = tono === "exito";
  return (
    <div
      style={{
        ...heroStyle,
        background: esExito ? "var(--success-600)" : "var(--primary-700)",
      }}
    >
      <span style={{ ...confirmIconStyle, background: "rgba(255,255,255,0.16)", color: "var(--text-on-primary)" }}>
        <Icon size={30} />
      </span>
      <h1 style={{ ...heroTitleStyle, marginTop: 14 }}>{titulo}</h1>
      <p style={{ margin: "8px 0 0", fontSize: "var(--text-body-size)", color: "rgba(255,255,255,0.9)", lineHeight: 1.55 }}>
        {detalle}
      </p>
    </div>
  );
}

// ── Card de pendiente (CTA) ──────────────────────────────────────
function PendienteCard({
  icon,
  titulo,
  detalle,
  cta,
  onClick,
}: {
  icon: ReactNode;
  titulo: string;
  detalle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div style={pendienteCardStyle}>
      <div style={{ display: "flex", gap: 12 }}>
        <span style={pendienteIconStyle}>{icon}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: "var(--text-body-size)", fontWeight: 700, color: "var(--text-primary)" }}>
            {titulo}
          </span>
          <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)", lineHeight: 1.5, wordBreak: "break-word" }}>
            {detalle}
          </span>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" onClick={onClick} iconRight={<ArrowRight size={16} />}>
          {cta}
        </Button>
      </div>
    </div>
  );
}

// ── Estados de carga / sin caso / error ──────────────────────────
function MiCasoSkeleton() {
  return (
    <div style={pageStyle}>
      <div style={{ padding: "22px 20px 4px" }}>
        <Skeleton width={140} height={22} style={{ marginBottom: 6 }} />
        <Skeleton width={110} height={12} />
      </div>
      <div style={{ padding: "0 20px" }}>
        <Skeleton height={150} radius="var(--radius-xl)" style={{ marginTop: 12 }} />
        <Skeleton height={110} radius="var(--radius-lg)" style={{ marginTop: 20 }} />
        <Skeleton height={72} radius="var(--radius-lg)" style={{ marginTop: 20 }} />
      </div>
    </div>
  );
}

function MiCasoSinCaso() {
  return (
    <div style={{ ...pageStyle, display: "flex", justifyContent: "center", padding: "56px 24px" }}>
      <EmptyState
        icon={<Inbox size={26} strokeWidth={1.5} />}
        title="Todavía no tenés un caso"
        description="Cuando tu agente registre tu reclamo, vas a ver acá el estado y lo que tengas pendiente."
        action={
          <a href={RUTAS.login} style={linkStyle}>
            Volver a ingresar
          </a>
        }
      />
    </div>
  );
}

/**
 * Fail-closed: si `miCaso` lanza (sesión expirada), ofrecemos re-loguear. Debe
 * ser PADRE del componente que hace `useQuery` (no captura errores propios).
 */
class MiCasoErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "56px 24px" }}>
          <EmptyState
            icon={<Inbox size={26} strokeWidth={1.5} />}
            title="No pudimos cargar tu caso"
            description="Puede que tu sesión haya expirado. Volvé a ingresar para continuar."
            action={
              <a href={RUTAS.login} style={linkStyle}>
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

// ── Estilos ──────────────────────────────────────────────────────
const pageStyle: CSSProperties = { minHeight: "100vh", background: "var(--bg-page)" };

const saludoStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h2-size)",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const numeroCasoStyle: CSSProperties = {
  margin: "4px 0 0",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
};

const heroStyle: CSSProperties = {
  margin: "14px 20px 0",
  padding: "22px 20px",
  background: "var(--primary-700)",
  borderRadius: "var(--radius-xl)",
  boxShadow: "var(--shadow-sm)",
};

const heroKickerStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "rgba(255,255,255,0.75)",
};

const heroTitleStyle: CSSProperties = {
  margin: "6px 0 0",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h3-size)",
  fontWeight: 700,
  color: "var(--text-on-primary)",
  lineHeight: 1.3,
};

const sectionStyle: CSSProperties = { padding: "24px 20px 0" };

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h4-size)",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const cardBaseStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-sm)",
};

const pendienteCardStyle: CSSProperties = {
  ...cardBaseStyle,
  padding: 16,
  borderLeft: "3px solid var(--primary-600)",
};

const pendienteIconStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "var(--radius-md)",
  background: "var(--primary-50)",
  color: "var(--primary-700)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const alDiaCardStyle: CSSProperties = {
  ...cardBaseStyle,
  padding: 16,
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const accesoRowStyle: CSSProperties = {
  ...cardBaseStyle,
  width: "100%",
  padding: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
};

const accesoIconStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const timelineStyle: CSSProperties = {
  ...cardBaseStyle,
  padding: "6px 16px",
  display: "flex",
  flexDirection: "column",
};

const novedadRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: "12px 0",
  borderBottom: "1px solid var(--divider)",
};

const novedadDotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "var(--radius-full)",
  background: "var(--primary-500)",
  flexShrink: 0,
  marginTop: 6,
};

const novedadesVaciasStyle: CSSProperties = {
  ...cardBaseStyle,
  padding: 16,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const confirmIconStyle: CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: "var(--radius-full)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const linkStyle: CSSProperties = {
  color: "var(--text-link)",
  fontWeight: 600,
  fontSize: "var(--text-body-size)",
};
