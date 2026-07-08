"use client";

import { CSSProperties, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pencil,
  Send,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { RELATO_PREGUNTAS, RELATO_TOTAL_PASOS, RUTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";
import { Alert, Button, Input, Skeleton, Textarea } from "@/components/ui";

type Pregunta = (typeof RELATO_PREGUNTAS)[number];

const RESUMEN = RELATO_TOTAL_PASOS; // índice del paso de resumen (7)

/** Extrae el mensaje legible de un ConvexError (mismo helper que ActivarForm). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

/** Fecha ISO YYYY-MM-DD → DD/MM/AAAA parseada en horario LOCAL (evita el -1 por UTC). */
function mostrarFecha(iso: string): string {
  return iso ? formatFecha(`${iso}T00:00:00`) || iso : "";
}

/** Texto legible de una respuesta para el resumen. */
function displayRespuesta(
  q: Pregunta,
  valores: Record<string, string>,
  detalles: Record<string, string>,
): string {
  const val = (valores[q.id] ?? "").trim();
  if (!val) return "—";
  if (q.tipo === "fecha") return mostrarFecha(val);
  if (q.tipo === "si_no_detalle" && val === "Sí") {
    const det = (detalles[q.id] ?? "").trim();
    return det ? `Sí — ${det}` : "Sí";
  }
  return val;
}

export function RelatoView() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const data = useQuery(api.relato.miRelato);
  const guardar = useMutation(api.relato.guardar);

  const [valores, setValores] = useState<Record<string, string>>({});
  const [detalles, setDetalles] = useState<Record<string, string>>({});
  const [hidratado, setHidratado] = useState(false);
  const [step, setStep] = useState(0);
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard de acceso: los redirects van SÓLO acá (nunca durante el render).
  useEffect(() => {
    if (me === undefined || data === undefined) return;
    if (me === null || data === null) {
      router.replace(RUTAS.login);
      return;
    }
    if (me.rol !== "damnificado") {
      router.replace("/");
      return;
    }
    if (data.caso === null || data.caso.cerrado || data.relato?.completo) {
      router.replace(RUTAS.damnificado.miCaso);
    }
  }, [me, data, router]);

  // Precarga del borrador (una vez), mapeando por título de pregunta.
  useEffect(() => {
    if (hidratado || data === undefined) return;
    if (data && data.relato) {
      const v: Record<string, string> = {};
      const d: Record<string, string> = {};
      for (const q of RELATO_PREGUNTAS) {
        const found = data.relato.respuestas.find((r) => r.pregunta === q.titulo);
        if (!found) continue;
        if (q.tipo === "si_no_detalle") {
          if (found.respuesta === "No") v[q.id] = "No";
          else if (found.respuesta.startsWith("Sí")) {
            v[q.id] = "Sí";
            d[q.id] =
              found.respuesta === "Sí"
                ? ""
                : found.respuesta.replace(/^Sí\s*—\s*/, "");
          }
        } else {
          v[q.id] = found.respuesta;
        }
      }
      setValores(v);
      setDetalles(d);
    }
    setHidratado(true);
  }, [data, hidratado]);

  // Gating de render (tras los hooks). Mientras carga o hay redirect pendiente,
  // no se muestra el wizard. Sólo damnificado, caso abierto y relato no enviado.
  if (me === undefined || data === undefined) return <RelatoSkeleton />;
  if (
    me === null ||
    data === null ||
    me.rol !== "damnificado" ||
    data.caso === null ||
    data.caso.cerrado ||
    data.relato?.completo
  ) {
    return <RelatoSkeleton />;
  }

  const setVal = (id: string, value: string) =>
    setValores((prev) => ({ ...prev, [id]: value }));
  const setDet = (id: string, value: string) =>
    setDetalles((prev) => ({ ...prev, [id]: value }));

  // respuestas para el backend (fecha=ISO; si_no/si_no_detalle mapeadas).
  const respuestas = RELATO_PREGUNTAS.map((q) => {
    const val = (valores[q.id] ?? "").trim();
    let respuesta = val;
    if (q.tipo === "si_no_detalle" && val === "Sí") {
      const det = (detalles[q.id] ?? "").trim();
      respuesta = det ? `Sí — ${det}` : "Sí";
    }
    return { pregunta: q.titulo, respuesta };
  });

  // Una pregunta está "completa" si tiene respuesta. `algo_mas` es opcional; y
  // si una `si_no_detalle` (denuncia) es "Sí", el detalle es OBLIGATORIO.
  const completa = (p: Pregunta) => {
    const val = (valores[p.id] ?? "").trim();
    if (p.id === "algo_mas") return true;
    if (!val) return false;
    if (p.tipo === "si_no_detalle" && val === "Sí") {
      return (detalles[p.id] ?? "").trim().length > 0;
    }
    return true;
  };
  const faltanRequeridas = RELATO_PREGUNTAS.some((p) => !completa(p));

  async function persistir(completo: boolean) {
    setLoading(true);
    setError(null);
    try {
      await guardar({ respuestas, completo });
      if (completo) {
        setEnviado(true);
        setTimeout(() => router.replace(RUTAS.damnificado.miCaso), 1800);
      } else {
        router.replace(RUTAS.damnificado.miCaso);
      }
    } catch (err) {
      setError(
        mensajeError(
          err,
          completo
            ? "No pudimos enviar tu relato. Intentá de nuevo."
            : "No pudimos guardar. Intentá de nuevo.",
        ),
      );
      setLoading(false);
    }
  }

  // ── Confirmación de envío ──────────────────────────────────────
  if (enviado) {
    return (
      <div style={{ ...pageStyle, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <span style={confirmIconStyle}>
          <CheckCircle2 size={34} />
        </span>
        <h1 style={{ ...tituloStyle, marginTop: 16 }}>Tu relato fue recibido</h1>
        <p style={textoStyle}>Tu agente ya puede leerlo y seguir armando tu expediente.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", marginTop: 14, fontSize: "var(--text-body-sm-size)" }}>
          <Loader2 size={15} className="animate-spin" /> Volviendo a Mi caso…
        </div>
      </div>
    );
  }

  // ── Resumen editable ───────────────────────────────────────────
  if (step === RESUMEN) {
    return (
      <div style={pageStyle}>
        <Progreso step={RESUMEN} />
        <div style={{ padding: "8px 0 4px" }}>
          <h1 style={tituloStyle}>Revisá tu relato</h1>
          <p style={{ ...textoStyle, maxWidth: "none" }}>
            Podés editar cualquier respuesta antes de enviarlo. Una vez enviado, no se puede modificar.
          </p>
        </div>

        {error && (
          <div style={{ margin: "14px 0" }}>
            <Alert variant="error" title="No pudimos enviar tu relato">{error}</Alert>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {RELATO_PREGUNTAS.map((q, i) => (
            <div key={q.id} style={resumenRowStyle}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={resumenPreguntaStyle}>{q.titulo}</p>
                <p style={resumenRespuestaStyle}>
                  {completa(q) ? displayRespuesta(q, valores, detalles) : "Falta completar"}
                </p>
              </div>
              <button type="button" onClick={() => setStep(i)} disabled={loading} style={editarBtnStyle}>
                <Pencil size={13} /> Editar
              </button>
            </div>
          ))}
        </div>

        <div style={navStyle}>
          <div style={{ display: "flex", gap: 12 }}>
            <Button variant="ghost" onClick={() => setStep(RESUMEN - 1)} disabled={loading} iconLeft={<ArrowLeft size={16} />}>
              Atrás
            </Button>
            <div style={{ flex: 1 }} />
            <Button
              variant="primary"
              size="lg"
              onClick={() => persistir(true)}
              loading={loading}
              disabled={faltanRequeridas}
              iconRight={loading ? undefined : <Send size={17} />}
            >
              {loading ? "Enviando…" : "Enviar relato"}
            </Button>
          </div>
          {faltanRequeridas && (
            <p style={{ ...hintStyle, color: "var(--danger-600)" }}>
              Completá las respuestas que faltan antes de enviar.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Pregunta actual ────────────────────────────────────────────
  const q = RELATO_PREGUNTAS[step];
  const esUltima = step === RELATO_TOTAL_PASOS - 1;
  const puedeAvanzar = completa(q);

  return (
    <div style={pageStyle}>
      <Progreso step={step} />
      <div style={contenidoStyle}>
        <h1 style={tituloStyle}>{q.titulo}</h1>
        {q.ayuda && <p style={{ ...textoStyle, marginTop: 8 }}>{q.ayuda}</p>}
        <div style={{ marginTop: 20 }}>
          <Campo q={q} valores={valores} detalles={detalles} setVal={setVal} setDet={setDet} disabled={loading} />
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14 }}>
          <Alert variant="error" title="No pudimos guardar">{error}</Alert>
        </div>
      )}

      <div style={navStyle}>
        <div style={{ display: "flex", gap: 12 }}>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={loading} iconLeft={<ArrowLeft size={16} />}>
              Atrás
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Button
            variant="primary"
            size="lg"
            onClick={() => setStep((s) => s + 1)}
            disabled={loading || !puedeAvanzar}
            iconRight={<ArrowRight size={17} />}
          >
            {esUltima ? "Revisar" : "Siguiente"}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => persistir(false)}
          disabled={loading}
          style={{ ...guardarLuegoStyle, opacity: loading ? 0.5 : 1, cursor: loading ? "default" : "pointer" }}
        >
          Guardar y continuar después
        </button>
      </div>
    </div>
  );
}

// ── Campo por tipo de pregunta ───────────────────────────────────
function Campo({
  q,
  valores,
  detalles,
  setVal,
  setDet,
  disabled,
}: {
  q: Pregunta;
  valores: Record<string, string>;
  detalles: Record<string, string>;
  setVal: (id: string, v: string) => void;
  setDet: (id: string, v: string) => void;
  disabled: boolean;
}) {
  const val = valores[q.id] ?? "";
  switch (q.tipo) {
    case "fecha":
      return (
        <Input type="date" value={val} disabled={disabled} onChange={(e) => setVal(q.id, e.target.value)} />
      );
    case "texto":
      return (
        <Input value={val} disabled={disabled} placeholder="Escribí acá…" onChange={(e) => setVal(q.id, e.target.value)} />
      );
    case "textarea": {
      const esQuePaso = q.id === "que_paso";
      return (
        <Textarea
          rows={esQuePaso ? 7 : 4}
          value={val}
          disabled={disabled}
          placeholder="Contá con tus palabras…"
          maxLength={esQuePaso ? 1200 : undefined}
          showCount={esQuePaso}
          onChange={(e) => setVal(q.id, e.target.value)}
        />
      );
    }
    case "si_no":
      return <SiNo value={val} disabled={disabled} onChange={(v) => setVal(q.id, v)} />;
    case "si_no_detalle":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SiNo value={val} disabled={disabled} onChange={(v) => setVal(q.id, v)} />
          {val === "Sí" && (
            <Textarea
              label="¿Con quién y cuándo?"
              rows={3}
              value={detalles[q.id] ?? ""}
              disabled={disabled}
              placeholder="Ej: Llamé a la aseguradora el 25/06 e hice la denuncia N° 1234."
              onChange={(e) => setDet(q.id, e.target.value)}
            />
          )}
        </div>
      );
    default:
      return null;
  }
}

// ── Selector Sí / No (segmentado) ────────────────────────────────
function SiNo({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {["Sí", "No"].map((opt) => {
        const sel = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            disabled={disabled}
            style={{
              ...sinoBtnStyle,
              borderColor: sel ? "var(--primary-600)" : "var(--border-strong)",
              background: sel ? "var(--primary-50)" : "var(--bg-surface)",
              color: sel ? "var(--primary-700)" : "var(--text-secondary)",
              fontWeight: sel ? 700 : 600,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── Progreso (barra de segmentos + "Paso X de N") ────────────────
function Progreso({ step }: { step: number }) {
  const total = RELATO_TOTAL_PASOS;
  const enResumen = step >= total;
  const actual = enResumen ? total : step + 1;
  return (
    <div style={{ padding: "8px 0 4px" }}>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: "var(--radius-full)",
              background: i < actual ? "var(--primary-600)" : "var(--border)",
            }}
          />
        ))}
      </div>
      <p style={pasoContadorStyle}>{enResumen ? "Revisá y enviá" : `Paso ${actual} de ${total}`}</p>
    </div>
  );
}

// ── Skeleton (carga / redirect pendiente) ────────────────────────
function RelatoSkeleton() {
  return (
    <div style={pageStyle}>
      <div style={{ padding: "8px 0 4px" }}>
        <Skeleton height={6} radius="var(--radius-full)" />
        <Skeleton width={90} height={12} style={{ marginTop: 12 }} />
      </div>
      <div style={contenidoStyle}>
        <Skeleton width={260} height={28} />
        <Skeleton width={200} height={14} style={{ marginTop: 12 }} />
        <Skeleton height={48} radius="var(--radius-md)" style={{ marginTop: 24 }} />
      </div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────
const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  padding: "12px 20px 24px",
  background: "var(--bg-page)",
};

const contenidoStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "20px 0",
};

const tituloStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h2-size)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
  lineHeight: 1.25,
};

const textoStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--text-body-size)",
  color: "var(--text-secondary)",
  lineHeight: 1.55,
  maxWidth: 400,
};

const pasoContadorStyle: CSSProperties = {
  margin: "10px 0 0",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
};

const navStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingTop: 12,
};

const guardarLuegoStyle: CSSProperties = {
  alignSelf: "center",
  background: "none",
  border: "none",
  padding: 4,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-link)",
};

const hintStyle: CSSProperties = {
  margin: 0,
  textAlign: "right",
  fontSize: "var(--text-body-sm-size)",
};

const resumenRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 14px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
};

const resumenPreguntaStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const resumenRespuestaStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: "var(--text-body-size)",
  color: "var(--text-primary)",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const editarBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexShrink: 0,
  background: "none",
  border: "none",
  padding: 4,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-link)",
};

const sinoBtnStyle: CSSProperties = {
  flex: 1,
  height: 48,
  borderRadius: "var(--radius-md)",
  border: "1.5px solid var(--border-strong)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-size)",
};

const confirmIconStyle: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: "var(--radius-full)",
  background: "var(--success-50)",
  color: "var(--success-600)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
