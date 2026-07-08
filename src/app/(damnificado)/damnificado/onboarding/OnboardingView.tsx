"use client";

import { CSSProperties, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  FileCheck2,
  HeartHandshake,
  Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Alert, Button, Skeleton, Stepper } from "@/components/ui";
import { RUTAS } from "@/lib/constants";

/** Extrae el mensaje legible de un ConvexError (mismo helper que ActivarForm). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

type Paso = { Icon: LucideIcon; titulo: string; texto: string };

/** Los 4 pasos (textos de REC-26). El nombre sólo se interpola en el paso 1. */
function pasosOnboarding(nombre: string): Paso[] {
  return [
    {
      Icon: HeartHandshake,
      titulo: "Tu caso ya tiene un agente",
      texto: `Hola, ${nombre}. Tu caso ya está en manos de tu agente, quien te va a acompañar en todo el proceso de reclamo frente a tu aseguradora.`,
    },
    {
      Icon: FileCheck2,
      titulo: "Vamos a pedirte información",
      texto:
        "Para armar tu expediente vamos a pedirte que cuentes con tus palabras qué pasó, y que subas algunos documentos como fotos, facturas o contratos. Todo desde acá, sin necesidad de mandar nada por WhatsApp.",
    },
    {
      Icon: BellRing,
      titulo: "Te avisamos de cada avance",
      texto:
        "Cada vez que haya una novedad en tu caso, te vamos a avisar por email. También podés entrar acá cuando quieras para ver el estado de tu reclamo.",
    },
    {
      Icon: Rocket,
      titulo: "Empecemos",
      texto:
        "Ya está todo listo. Empecemos completando el relato de lo que pasó.",
    },
  ];
}

export function OnboardingView() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const completar = useMutation(api.users.completarOnboarding);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard de acceso: los redirects van SÓLO acá (nunca durante el render).
  useEffect(() => {
    if (me === undefined) return; // cargando: no decidir todavía
    if (me === null) {
      router.replace(RUTAS.login);
      return;
    }
    if (me.rol !== "damnificado") {
      router.replace("/"); // el resolver reubica por rol
      return;
    }
    if (me.onboardingCompletado) {
      router.replace(RUTAS.damnificado.miCaso); // ya lo completó: no re-mostrar
    }
  }, [me, router]);

  // Mientras carga o hay un redirect pendiente, no se muestra el wizard (no se
  // pueden ejecutar pasos ni la mutation). Sólo un damnificado sin onboarding lo ve.
  if (
    me === undefined ||
    me === null ||
    me.rol !== "damnificado" ||
    me.onboardingCompletado
  ) {
    return <OnboardingSkeleton />;
  }

  const nombre = me.nombre.split(" ")[0] || me.nombre;
  const pasos = pasosOnboarding(nombre);
  const total = pasos.length; // 4
  const esUltimo = step === total - 1;
  const { Icon, titulo, texto } = pasos[step];

  async function completarYSalir() {
    setLoading(true);
    setError(null);
    try {
      await completar();
      router.replace(RUTAS.damnificado.miCaso);
      // No reseteamos `loading`: dejamos el botón ocupado hasta que navega.
    } catch (err) {
      setError(mensajeError(err, "No pudimos continuar. Intentá de nuevo."));
      setLoading(false);
    }
  }

  return (
    <div style={pageStyle}>
      {/* Progreso: Stepper compacto (sin labels) + "Paso X de N" — mobile-safe */}
      <div style={{ padding: "20px 8px 0" }}>
        <Stepper steps={pasos.map(() => ({ label: "" }))} currentStep={step} />
        <p style={pasoContadorStyle}>
          Paso {step + 1} de {total}
        </p>
      </div>

      {/* Contenido del paso */}
      <div style={contenidoStyle}>
        <span style={iconWrapStyle}>
          <Icon size={36} strokeWidth={1.75} />
        </span>
        <h1 style={tituloStyle}>{titulo}</h1>
        <p style={textoStyle}>{texto}</p>
      </div>

      {error && (
        <div style={{ padding: "0 4px 16px" }}>
          <Alert variant="error" title="No pudimos continuar">
            {error}
          </Alert>
        </div>
      )}

      {/* Navegación */}
      <div style={navStyle}>
        <div style={{ display: "flex", gap: 12 }}>
          {step > 0 && (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
              iconLeft={<ArrowLeft size={16} />}
            >
              Anterior
            </Button>
          )}
          <div style={{ flex: 1 }} />
          {esUltimo ? (
            <Button
              variant="primary"
              size="lg"
              onClick={completarYSalir}
              loading={loading}
              iconRight={loading ? undefined : <ArrowRight size={17} />}
            >
              {loading ? "Abriendo tu caso…" : "Ir a mi caso"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={() => setStep((s) => s + 1)}
              disabled={loading}
              iconRight={<ArrowRight size={17} />}
            >
              Siguiente
            </Button>
          )}
        </div>

        {/* Saltar onboarding — discreto, también marca completado */}
        <button
          type="button"
          onClick={completarYSalir}
          disabled={loading}
          style={{ ...skipStyle, opacity: loading ? 0.5 : 1, cursor: loading ? "default" : "pointer" }}
        >
          Saltar introducción
        </button>
      </div>
    </div>
  );
}

// ── Estado de carga / redirect pendiente ─────────────────────────
function OnboardingSkeleton() {
  return (
    <div style={pageStyle}>
      <div style={{ padding: "20px 8px 0" }}>
        <Skeleton height={32} radius="var(--radius-full)" />
        <Skeleton width={90} height={12} style={{ margin: "12px auto 0" }} />
      </div>
      <div style={{ ...contenidoStyle, alignItems: "center" }}>
        <Skeleton width={72} height={72} radius="var(--radius-full)" />
        <Skeleton width={220} height={24} style={{ marginTop: 20 }} />
        <Skeleton width={280} height={14} style={{ marginTop: 12 }} />
        <Skeleton width={240} height={14} style={{ marginTop: 8 }} />
      </div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────
const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  padding: "8px 20px 24px",
  background: "var(--bg-page)",
};

const pasoContadorStyle: CSSProperties = {
  margin: "12px 0 0",
  textAlign: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
};

const contenidoStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "24px 4px",
  gap: 4,
};

const iconWrapStyle: CSSProperties = {
  width: 84,
  height: 84,
  borderRadius: "var(--radius-full)",
  background: "var(--primary-50)",
  color: "var(--primary-700)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 20,
};

const tituloStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h2-size)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
};

const textoStyle: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "var(--text-body-size)",
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  maxWidth: 380,
};

const navStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingTop: 8,
};

const skipStyle: CSSProperties = {
  alignSelf: "center",
  background: "none",
  border: "none",
  padding: 4,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-tertiary)",
};
