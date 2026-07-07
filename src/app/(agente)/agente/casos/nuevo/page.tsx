"use client";

import { CSSProperties, FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Plus } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Alert, Button, Input, PrioritySelector, Select } from "@/components/ui";
import {
  PRIORIDAD_DEFAULT,
  RUTAS,
  TIPOS_SINIESTRO,
  type Prioridad,
  type TipoSiniestro,
} from "@/lib/constants";

type Campo = "nombre" | "email" | "telefono" | "tipo" | "aseguradora";
type Errores = Partial<Record<Campo, string>>;

/** Extrae el mensaje legible de un ConvexError (ver convex: errores de formulario). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NuevoCasoPage() {
  const router = useRouter();
  const crear = useMutation(api.casos.crear);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState<TipoSiniestro | "">("");
  const [aseguradora, setAseguradora] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>(PRIORIDAD_DEFAULT);

  const [errores, setErrores] = useState<Errores>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState<
    { email: string; nombre: string; invitacionEnviada: boolean; numeroCaso: string } | null
  >(null);

  const limpiar = (campo: Campo) => {
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
    if (topError) setTopError(null);
  };

  function validar(): Errores {
    const e: Errores = {};
    if (!nombre.trim()) e.nombre = "Ingresá el nombre del damnificado.";
    if (!email.trim()) e.email = "Ingresá el email del damnificado.";
    else if (!EMAIL_RE.test(email.trim())) e.email = "Ingresá un email válido (ej: nombre@dominio.com).";
    if (!telefono.trim()) e.telefono = "Ingresá un teléfono de contacto.";
    if (!tipo) e.tipo = "Elegí el tipo de siniestro.";
    if (!aseguradora.trim()) e.aseguradora = "Indicá la aseguradora involucrada.";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validar();
    if (Object.keys(e).length > 0) {
      setErrores(e);
      setTopError("Revisá los campos marcados en rojo y volvé a intentar.");
      return;
    }
    setErrores({});
    setTopError(null);
    setLoading(true);
    try {
      const res = await crear({
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim(),
        tipoSiniestro: tipo as TipoSiniestro,
        aseguradora: aseguradora.trim(),
        prioridad,
      });
      setExito({
        email: res.email,
        nombre: nombre.trim(),
        invitacionEnviada: res.invitacionEnviada,
        numeroCaso: res.numeroCaso,
      });
      // Confirmación breve y redirección a la ficha del caso recién creado.
      setTimeout(() => router.push(RUTAS.agente.caso(res.casoId)), 1200);
    } catch (err) {
      setTopError(mensajeError(err, "No pudimos crear el caso. Intentá de nuevo."));
      setLoading(false);
    }
  }

  if (exito) {
    return (
      <div style={{ padding: "28px 32px", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 520 }}>
          <div
            style={{
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
            }}
          >
            <span
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--success-50)",
                color: "var(--success-600)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={34} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: "var(--text-h3-size)", fontWeight: 700, color: "var(--text-primary)" }}>
                Caso creado con éxito
              </h2>
              <p style={{ margin: "6px 0 0", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-tertiary)" }}>
                {exito.numeroCaso}
              </p>
              <p style={{ margin: "10px 0 0", fontSize: "var(--text-body-size)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                Se dio de alta el caso de <strong style={{ color: "var(--text-primary)" }}>{exito.nombre}</strong>
                {exito.invitacionEnviada ? (
                  <>
                    {" "}y se envió una invitación a{" "}
                    <strong style={{ color: "var(--text-primary)" }}>{exito.email}</strong> para que acceda al sistema.
                  </>
                ) : (
                  <>. El damnificado ya tiene cuenta, no se reenvió la invitación.</>
                )}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)", marginTop: 4 }}>
              <Loader2 size={15} className="animate-spin" />
              Redirigiendo a la ficha del caso…
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 720, margin: "0 auto" }}>
      <button type="button" onClick={() => router.push(RUTAS.agente.casos)} style={backLinkStyle}>
        <ArrowLeft size={16} />
        Volver
      </button>

      <div style={{ margin: "12px 0 20px" }}>
        <h1 className="text-h2" style={{ margin: 0 }}>Nuevo caso</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
          Alta de un reclamo
        </p>
      </div>

      {topError && (
        <div style={{ marginBottom: 18 }}>
          <Alert variant="error" title="No pudimos crear el caso">{topError}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: 28,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <FormSection title="Datos del damnificado">
            <Input
              label="Nombre completo"
              placeholder="Nombre y apellido"
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); limpiar("nombre"); }}
              disabled={loading}
              error={errores.nombre}
            />
            <div style={gridDos}>
              <Input
                label="Email"
                type="email"
                autoComplete="off"
                placeholder="nombre@dominio.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); limpiar("email"); }}
                disabled={loading}
                error={errores.email}
                helperText="Es su acceso al sistema y donde llegan las notificaciones."
              />
              <Input
                label="Teléfono"
                placeholder="+54 11 0000-0000"
                value={telefono}
                onChange={(e) => { setTelefono(e.target.value); limpiar("telefono"); }}
                disabled={loading}
                error={errores.telefono}
              />
            </div>
          </FormSection>

          <Divider />

          <FormSection title="Datos del siniestro">
            <div style={gridDos}>
              <Select
                label="Tipo de siniestro"
                placeholder="Elegí una opción…"
                options={TIPOS_SINIESTRO}
                value={tipo}
                onChange={(e) => { setTipo(e.target.value as TipoSiniestro); limpiar("tipo"); }}
                disabled={loading}
                error={errores.tipo}
              />
              <Input
                label="Aseguradora"
                placeholder="Ej: La Segunda"
                value={aseguradora}
                onChange={(e) => { setAseguradora(e.target.value); limpiar("aseguradora"); }}
                disabled={loading}
                error={errores.aseguradora}
              />
            </div>
          </FormSection>

          <Divider />

          <FormSection title="Configuración">
            <PrioritySelector value={prioridad} onChange={setPrioridad} disabled={loading} />
          </FormSection>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 22,
              padding: "12px 14px",
              background: "var(--primary-50)",
              border: "1px solid var(--primary-100)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span style={{ color: "var(--primary-600)", display: "flex", flexShrink: 0 }}>
              <Mail size={17} />
            </span>
            <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--primary-700)", lineHeight: 1.45 }}>
              Si el damnificado todavía no tiene una cuenta activa, va a recibir un email de invitación para acceder al sistema.
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
          <Button variant="ghost" type="button" disabled={loading} onClick={() => router.push(RUTAS.agente.casos)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={loading}
            iconLeft={loading ? undefined : <Plus size={17} />}
          >
            {loading ? "Creando caso…" : "Crear caso"}
          </Button>
        </div>
      </form>
    </div>
  );
}

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

// Los grids de 2 columnas colapsan a 1 en pantallas angostas (tablet 768)
// vía auto-fit, sin media queries (coherente con el estilo inline del repo).
const gridDos: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: "var(--text-h4-size)", fontWeight: 700, color: "var(--text-primary)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--divider)", margin: "24px 0" }} />;
}
