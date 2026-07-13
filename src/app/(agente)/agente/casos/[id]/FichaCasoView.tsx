"use client";

import { Component, CSSProperties, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  FolderOpen,
  Inbox,
  Mail,
  Phone,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Badge, Button, EmptyState, PrioritySelector, Skeleton, Stepper } from "@/components/ui";
import { ETAPAS, PRIORIDADES, type Prioridad, RESULTADOS_CIERRE, RUTAS, TIPOS_SINIESTRO } from "@/lib/constants";
import { diasHasta, estadoPlazo, formatFecha } from "@/lib/format";
import { CenteredEmpty, SectionCard, fechaLocal } from "./fichaUi";
import { RespuestasAseguradoraCard } from "./RespuestasAseguradoraCard";
import { GestionesCard } from "./GestionesCard";
import { NotasInternasCard } from "./NotasInternasCard";
import { ChatCard } from "./ChatCard";
import { AccesoDamnificado } from "./AccesoDamnificado";

// DTO de la ficha (deriva del retorno de la query → siempre en sync). `null`
// (no-encontrado/no-dueño) se maneja aparte; acá el shape del caso presente.
type Ficha = NonNullable<FunctionReturnType<typeof api.casos.get>>;

const etapaInfo = (v: string) => ETAPAS.find((e) => e.value === v);
const prioridadInfo = (v: string) => PRIORIDADES.find((p) => p.value === v);
const tipoLabel = (v: string) =>
  TIPOS_SINIESTRO.find((t) => t.value === v)?.label ?? v;

// Índice de EN_NEGOCIACION en ETAPAS: desde esta etapa el botón de avance se
// deshabilita (el único "siguiente" es CERRADO, que se hace en Cerrar caso).
const IDX_EN_NEGOCIACION = ETAPAS.findIndex((e) => e.value === "EN_NEGOCIACION");

/** Extrae el mensaje legible de un ConvexError (mismo helper que Nuevo caso). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

// ── Estilos compartidos ──────────────────────────────────────────
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

const linkStyle: CSSProperties = {
  color: "var(--text-link)",
  fontWeight: 600,
  fontSize: "var(--text-body-size)",
};

const captionStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-tertiary)",
  fontWeight: 600,
};

const iconTile = (bg: string, color: string): CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: "var(--radius-full)",
  background: bg,
  color,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

// ── Entrada: error boundary (padre del que llama useQuery) ────────
export function FichaCasoView({ casoId }: { casoId: string }) {
  return (
    <FichaErrorBoundary>
      <FichaContent casoId={casoId} />
    </FichaErrorBoundary>
  );
}

function FichaContent({ casoId }: { casoId: string }) {
  // `casoId` viene de la URL: si no es un Id válido, la validación de args de
  // Convex lanza en el render y lo captura `FichaErrorBoundary` (su padre).
  const caso = useQuery(api.casos.get, { casoId: casoId as Id<"casos"> });
  if (caso === undefined) return <FichaSkeleton />;
  if (caso === null) return <FichaNoEncontrado />;
  return <FichaDetalle caso={caso} />;
}

// ── Contenido principal ──────────────────────────────────────────
function FichaDetalle({ caso }: { caso: Ficha }) {
  const router = useRouter();
  const avanzar = useMutation(api.casos.avanzarEtapa);
  const [confirmando, setConfirmando] = useState(false);
  const [avanzando, setAvanzando] = useState(false);
  const [avanceError, setAvanceError] = useState<string | null>(null);
  const cambiarPrioridad = useMutation(api.casos.cambiarPrioridad);
  const [guardandoPrioridad, setGuardandoPrioridad] = useState(false);
  const [prioridadError, setPrioridadError] = useState<string | null>(null);
  const etapa = etapaInfo(caso.etapa);
  const prioridad = prioridadInfo(caso.prioridad);
  // Con el caso cerrado, el badge/estado refleja el RESULTADO real
  // (RESUELTO/RECHAZADO/EN_APELACION), no el label genérico de la etapa CERRADO
  // (que siempre es "Resuelto"). Fallback defensivo si el resultado viniera null.
  const cierre = caso.cerrado
    ? RESULTADOS_CIERRE.find((r) => r.value === caso.resultadoCierre) ?? {
        label: "Cerrado",
        badge: "apelacion" as const,
      }
    : null;
  const idx = Math.max(
    0,
    ETAPAS.findIndex((e) => e.value === caso.etapa),
  );
  // Sólo se avanza desde NUEVO..PRESENTADO (idx 0..3). Desde EN_NEGOCIACION en
  // adelante el botón se deshabilita: el cierre (con resultado) es Cerrar caso.
  const puedeAvanzar = !caso.cerrado && idx < IDX_EN_NEGOCIACION;
  const nextLabel = puedeAvanzar ? ETAPAS[idx + 1].labelAgente : null;
  const dam = caso.damnificado;
  const relatoCompleto = caso.relato?.completo === true;
  const alerta = alertaContextual(caso);

  async function onConfirmarAvance() {
    setAvanceError(null);
    setAvanzando(true);
    try {
      // `etapaActual` = la etapa renderizada: si el caso cambió entre ver y
      // confirmar, la mutation rechaza (concurrencia optimista, no avanza dos).
      await avanzar({ casoId: caso._id, etapaActual: caso.etapa });
      setConfirmando(false); // la live query ya movió el Stepper y el badge
    } catch (err) {
      setAvanceError(
        mensajeError(err, "No pudimos avanzar la etapa. Intentá de nuevo."),
      );
    } finally {
      setAvanzando(false);
    }
  }

  async function onCambiarPrioridad(nueva: Prioridad) {
    if (nueva === caso.prioridad) return;
    setPrioridadError(null);
    setGuardandoPrioridad(true);
    try {
      await cambiarPrioridad({ casoId: caso._id, prioridad: nueva });
      // la live query de `get` refleja la nueva prioridad; sin recargar
    } catch (err) {
      setPrioridadError(
        mensajeError(err, "No pudimos cambiar la prioridad. Intentá de nuevo."),
      );
    } finally {
      setGuardandoPrioridad(false);
    }
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1160, margin: "0 auto" }}>
      <button
        type="button"
        onClick={() => router.push(caso.cerrado ? RUTAS.agente.historico : RUTAS.agente.casos)}
        style={backLinkStyle}
      >
        <ArrowLeft size={16} /> {caso.cerrado ? "Volver al histórico" : "Volver a casos"}
      </button>

      {/* Encabezado */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className="text-h2" style={{ margin: 0 }}>
              {dam?.nombre ?? "Damnificado"}
            </h1>
            {cierre ? (
              <Badge variant={cierre.badge}>{cierre.label}</Badge>
            ) : (
              etapa && <Badge variant={etapa.badge}>{etapa.labelAgente}</Badge>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 7,
              fontSize: "var(--text-body-sm-size)",
              color: "var(--text-secondary)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {caso.numeroCaso}
            </span>
            <span>·</span>
            <span>{tipoLabel(caso.tipoSiniestro)}</span>
            <span>·</span>
            <span>{caso.aseguradora}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* Prioridad (REC-37): editable con el caso abierto; sólo lectura si está cerrado.
              PrioritySelector ya trae su propio label "Prioridad" (no repetir el caption). */}
          {caso.cerrado ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <span style={captionStyle}>Prioridad</span>
              {prioridad && <Badge variant={prioridad.badge}>{prioridad.label}</Badge>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <PrioritySelector
                value={caso.prioridad}
                onChange={onCambiarPrioridad}
                disabled={guardandoPrioridad}
              />
              {prioridadError && (
                <span style={{ fontSize: 12, color: "var(--danger-600)" }}>{prioridadError}</span>
              )}
            </div>
          )}
          {/* Acciones sobre un caso abierto: sin sentido (ruta muerta) si ya
              está cerrado. El backend además rechaza pedidos/cierres sobre cerrados. */}
          {!caso.cerrado && (
            <>
              <Button
                variant="secondary"
                iconLeft={<Send size={15} />}
                onClick={() => router.push(RUTAS.agente.solicitar(caso._id))}
              >
                Solicitar documentación
              </Button>
              <Button
                variant="secondary"
                iconLeft={<CheckCircle2 size={15} />}
                onClick={() => router.push(RUTAS.agente.cerrar(caso._id))}
              >
                Cerrar caso
              </Button>
            </>
          )}
        </div>
      </div>

      {alerta && <div style={{ marginBottom: 18 }}>{alerta}</div>}

      {/* Pipeline — avanzar de etapa (REC-21): confirmación inline; se detiene
          en EN_NEGOCIACION (llegar a CERRADO es Cerrar caso, REC-30). */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div style={{ padding: "20px 22px 18px", overflowX: "auto" }}>
          <div style={{ minWidth: 620 }}>
            <Stepper
              steps={ETAPAS.map((e) => ({ label: e.labelAgente }))}
              currentStep={idx}
              variant="horizontal"
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            borderTop: "1px solid var(--divider)",
            background: "var(--bg-subtle)",
          }}
        >
          <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
            {cierre ? "Resultado: " : "Etapa actual: "}
            <strong style={{ color: "var(--text-primary)" }}>
              {cierre ? cierre.label : etapa?.labelAgente}
            </strong>
          </span>
          {caso.cerrado ? (
            <span
              style={{
                fontSize: "var(--text-body-sm-size)",
                fontWeight: 600,
                color: "var(--text-tertiary)",
              }}
            >
              Caso cerrado
            </span>
          ) : puedeAvanzar && confirmando ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
                ¿Avanzar a{" "}
                <strong style={{ color: "var(--text-primary)" }}>{nextLabel}</strong>?
              </span>
              <Button
                variant="ghost"
                disabled={avanzando}
                onClick={() => {
                  setConfirmando(false);
                  setAvanceError(null);
                }}
              >
                Cancelar
              </Button>
              <Button variant="primary" loading={avanzando} onClick={onConfirmarAvance}>
                Confirmar
              </Button>
            </div>
          ) : puedeAvanzar ? (
            <Button
              variant="primary"
              onClick={() => setConfirmando(true)}
              iconRight={<ChevronRight size={16} />}
            >
              Mover a: {nextLabel}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled
              title="El cierre del caso se hace desde “Cerrar caso”."
              iconRight={<ChevronRight size={16} />}
            >
              Avanzar etapa
            </Button>
          )}
        </div>
        {avanceError && (
          <div style={{ padding: "0 20px 14px" }}>
            <Alert variant="error">{avanceError}</Alert>
          </div>
        )}
      </div>

      {/* Grilla principal — layout de 2 columnas fijo (1.9fr / 1fr). Decisión
          explícita: el registro Agente es "denso, desktop" (REC-20), por lo que
          el responsive queda fuera de alcance de esta pantalla. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: 20, alignItems: "start" }}>
        {/* Columna izquierda */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* Relato */}
          <SectionCard
            title="Relato del siniestro"
            right={
              relatoCompleto ? (
                <Button variant="ghost" size="sm" disabled title="Disponible pronto">
                  Ver relato
                </Button>
              ) : undefined
            }
          >
            {relatoCompleto ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={iconTile("var(--success-50)", "var(--success-600)")}>
                  <CheckCircle2 size={18} />
                </span>
                <div>
                  <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)" }}>
                    Relato completado
                  </div>
                  <div style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
                    El damnificado describió el siniestro
                    {caso.relato?.completadoEn ? ` · ${formatFecha(caso.relato.completadoEn)}` : ""}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={iconTile("var(--warning-50)", "var(--warning-600)")}>
                  <Clock size={18} />
                </span>
                <div>
                  <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)" }}>
                    Relato pendiente
                  </div>
                  <div style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
                    El damnificado todavía no completó el relato del siniestro.
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Documentos */}
          <SectionCard
            title="Documentos y evidencias"
            right={
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
                {caso.documentos.length} archivo{caso.documentos.length === 1 ? "" : "s"}
              </span>
            }
          >
            {caso.documentos.length ? (
              <div>
                {caso.documentos.map((doc) => (
                  <DocRow key={doc._id} doc={doc} damnificadoNombre={dam?.nombre ?? ""} />
                ))}
              </div>
            ) : (
              <CenteredEmpty
                icon={<FolderOpen size={24} strokeWidth={1.5} />}
                title="Sin documentos todavía"
                description="Cuando el damnificado suba archivos o vos los cargues, van a aparecer acá."
              />
            )}
          </SectionCard>

          {/* Pedidos */}
          <SectionCard
            title="Pedidos de documentación"
            right={
              caso.cerrado ? undefined : (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<Plus size={14} />}
                  onClick={() => router.push(RUTAS.agente.solicitar(caso._id))}
                >
                  Nuevo pedido
                </Button>
              )
            }
          >
            {caso.pedidos.length ? (
              <div>
                {caso.pedidos.map((p) => (
                  <PedidoRow key={p._id} pedido={p} />
                ))}
              </div>
            ) : (
              <CenteredEmpty
                icon={<Send size={22} strokeWidth={1.5} />}
                title="Sin pedidos activos"
                description="Cuando le pidas documentación al damnificado, el estado del pedido va a aparecer acá."
              />
            )}
          </SectionCard>

          {/* Respuestas de la aseguradora (REC-31) — SÓLO AGENTE. Trae su propia
              query: no cuelga de `casos.get`, que es dual-rol. */}
          <RespuestasAseguradoraCard casoId={caso._id} cerrado={caso.cerrado} />

          {/* Log de gestiones (REC-32) — SÓLO AGENTE, misma regla. */}
          <GestionesCard casoId={caso._id} cerrado={caso.cerrado} />

          {/* Notas internas (REC-33) — SÓLO AGENTE. El damnificado no las ve bajo
              ninguna circunstancia; la card lo marca en pantalla. */}
          <NotasInternasCard casoId={caso._id} cerrado={caso.cerrado} />
        </div>

        {/* Columna derecha */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* Chat (REC-34) — PRIMERA card de la derecha, a propósito: la columna
              izquierda ya tiene 6 cards y un chat en la séptima posición quedaría a
              cuatro scrolls del encabezado. Un chat que el agente no ve está muerto.
              A diferencia de las 3 bitácoras, esto lo LEE el damnificado — la card lo
              marca en pantalla, como espejo del chip "Privada" de Notas internas. */}
          <ChatCard
            casoId={caso._id}
            damnificadoNombre={dam?.nombre ?? ""}
            damnificadoActivado={dam?.cuentaActivada ?? true}
          />

          <SectionCard title="Damnificado" pad="6px 18px 10px">
            {dam ? (
              <>
                <DataRow icon={<Users size={17} />} label="Nombre completo" value={dam.nombre} />
                <DataRow icon={<Mail size={17} />} label="Email" value={dam.email} />
                <DataRow icon={<Phone size={17} />} label="Teléfono" value={dam.telefono} mono last />
                {/* Acceso al portal (REC-71). Va acá dentro y no en una card propia:
                    "cómo entra esta persona al sistema" son datos de la persona. El
                    componente se auto-oculta si la cuenta ya está activada. */}
                {!dam.cuentaActivada && <AccesoDamnificado casoId={caso._id} />}
              </>
            ) : (
              <div style={{ padding: "10px 0", fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>
                No pudimos cargar los datos del damnificado.
              </div>
            )}
          </SectionCard>

          <SectionCard title="Plazos del caso">
            {caso.plazos.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {caso.plazos.map((p) => (
                  <PlazoRow key={p._id} plazo={p} />
                ))}
              </div>
            ) : (
              <CenteredEmpty
                icon={<Calendar size={22} strokeWidth={1.5} />}
                title="Sin plazos cargados"
                description="Los vencimientos críticos del reclamo van a aparecer acá."
              />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ── Alerta contextual (una sola; precedencia estricta, §5 del plan) ──
function alertaContextual(caso: Ficha): ReactNode {
  const conEstado = caso.plazos.map((p) => ({
    p,
    estado: estadoPlazo(fechaLocal(p.fechaVencimiento)),
  }));
  // `plazos` viene ordenado por fechaVencimiento asc → [0] es el más antiguo.
  const vencidos = conEstado.filter((x) => x.estado === "vencido");
  const proximos = conEstado.filter((x) => x.estado === "proximo");

  if (vencidos.length || proximos.length) {
    // PRECEDENCIA ESTRICTA: si hay algún vencido, el foco (y el título) es el
    // primer vencido —lo más grave, no se puede ocultar en una pantalla
    // operativa—; sólo si no hay ningún vencido, el foco es el primer próximo.
    const hayVencidos = vencidos.length > 0;
    const foco = (hayVencidos ? vencidos[0] : proximos[0]).p;
    const variant = hayVencidos ? "error" : "warning";
    const fecha = formatFecha(fechaLocal(foco.fechaVencimiento));

    let title: string;
    let base: string;
    let extra = "";
    if (hayVencidos) {
      title = vencidos.length > 1 ? "Plazos vencidos" : "Plazo vencido";
      base = `${foco.descripcion} venció el ${fecha}.`;
      if (vencidos.length > 1) extra += ` Hay ${vencidos.length} plazos vencidos.`;
      if (proximos.length > 0) {
        extra += ` Y ${proximos.length} próximo${proximos.length === 1 ? "" : "s"} a vencer.`;
      }
    } else {
      title = proximos.length > 1 ? "Plazos próximos a vencer" : "Plazo próximo a vencer";
      const dias = diasHasta(fechaLocal(foco.fechaVencimiento)); // ≥ 0
      const cuando = dias === 0 ? "vence hoy" : `vence en ${dias} día${dias === 1 ? "" : "s"}`;
      base = `${foco.descripcion} ${cuando} (${fecha}).`;
      if (proximos.length > 1) extra += ` Hay ${proximos.length} plazos próximos a vencer.`;
    }

    return (
      <Alert variant={variant} title={title}>
        {`${base}${extra} Revisá los plazos del caso.`}
      </Alert>
    );
  }

  const relatoPendiente = caso.relato === null || !caso.relato.completo;
  if (caso.etapa === "NUEVO" && relatoPendiente && caso.documentos.length === 0) {
    return (
      <Alert variant="info" title="Caso recién creado">
        Todavía falta el relato del siniestro y la documentación. Pedile al
        damnificado lo que necesitás para empezar a armar el expediente.
      </Alert>
    );
  }
  return null;
}

// ── Sub-componentes de presentación (portados del prototipo) ─────
// `SectionCard`, `CenteredEmpty` y `fechaLocal` viven en ./fichaUi: las usa
// también RespuestasAseguradoraCard, y tenerlas acá crearía un ciclo de imports.
function DataRow({
  icon,
  label,
  value,
  mono,
  last,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--divider)",
      }}
    >
      <span style={{ color: "var(--text-tertiary)", display: "flex", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={captionStyle}>{label}</div>
        <div
          style={{
            fontSize: "var(--text-body-sm-size)",
            color: "var(--text-primary)",
            fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
            marginTop: 2,
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function DocRow({
  doc,
  damnificadoNombre,
}: {
  doc: Ficha["documentos"][number];
  damnificadoNombre: string;
}) {
  const por = doc.subidoPor === "AGENTE" ? "vos" : damnificadoNombre || "el damnificado";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "var(--radius-md)",
          background: "var(--primary-50)",
          color: "var(--primary-600)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <FileText size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-word" }}>
          {doc.nombreArchivo}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {formatFecha(doc.creadoEn)} · Subido por {por}
        </div>
      </div>
    </div>
  );
}

function PedidoRow({ pedido }: { pedido: Ficha["pedidos"][number] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "11px 0",
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-primary)" }}>
          {pedido.descripcion}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 1 }}>
          Enviado {formatFecha(pedido.creadoEn)}
          {pedido.respondido && pedido.respondidoEn ? ` · Respondido ${formatFecha(pedido.respondidoEn)}` : ""}
        </div>
      </div>
      <Badge variant={pedido.respondido ? "respondido" : "pendiente"}>
        {pedido.respondido ? "Respondido" : "Pendiente"}
      </Badge>
    </div>
  );
}

function PlazoRow({ plazo }: { plazo: Ficha["plazos"][number] }) {
  const estado = estadoPlazo(fechaLocal(plazo.fechaVencimiento));
  const border =
    estado === "vencido"
      ? "var(--danger-500)"
      : estado === "proximo"
        ? "var(--warning-500)"
        : "var(--border)";
  const bg =
    estado === "vencido"
      ? "var(--danger-50)"
      : estado === "proximo"
        ? "var(--warning-50)"
        : "var(--bg-inset)";
  const pill =
    estado === "vencido" ? (
      <span style={pillStyle("var(--danger-600)")}>Vencido</span>
    ) : estado === "proximo" ? (
      <span style={pillStyle("var(--warning-700)")}>Próximo</span>
    ) : (
      <span
        style={{
          fontSize: 12,
          color: "var(--success-700)",
          fontWeight: 600,
          display: "inline-flex",
          gap: 4,
          alignItems: "center",
          whiteSpace: "nowrap",
        }}
      >
        <Check size={13} />
        En fecha
      </span>
    );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 12px",
        borderLeft: `3px solid ${border}`,
        background: bg,
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-primary)" }}>
          {plazo.descripcion}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
          Vence {formatFecha(fechaLocal(plazo.fechaVencimiento))}
        </div>
      </div>
      {pill}
    </div>
  );
}

const pillStyle = (color: string): CSSProperties => ({
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color,
  whiteSpace: "nowrap",
});

// ── Estados de carga / no-encontrado / error ─────────────────────
function CardSkeleton() {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Skeleton width="45%" height={14} />
      <Skeleton width="90%" height={12} />
      <Skeleton width="70%" height={12} />
    </div>
  );
}

function FichaSkeleton() {
  return (
    <div style={{ padding: "28px 32px", maxWidth: 1160, margin: "0 auto" }}>
      <Skeleton width={110} height={14} style={{ marginBottom: 22 }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton width={240} height={24} />
          <Skeleton width={320} height={12} />
        </div>
        <Skeleton width={168} height={40} radius="var(--radius-md)" />
      </div>
      <Skeleton height={118} radius="var(--radius-lg)" style={{ marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: 20, alignItems: "start" }}>
        {/* Columna izquierda: relato, documentos, pedidos, respuestas (REC-31),
            gestiones (REC-32), notas internas (REC-33). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        {/* Columna derecha: chat (REC-34), damnificado, plazos. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FichaNoEncontrado() {
  return (
    <div style={{ padding: "28px 32px", maxWidth: 1160, margin: "0 auto" }}>
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
class FichaErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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
