"use client";

import { CSSProperties, FormEvent, ReactNode, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Plus } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  PrioritySelector,
  Select,
} from "@/components/ui";
import {
  PRIORIDAD_DEFAULT,
  RUTAS,
  TIPOS_SINIESTRO,
  type Prioridad,
  type TipoSiniestro,
} from "@/lib/constants";

type Campo = "nombre" | "email" | "telefono" | "tipo" | "aseguradora";
type Errores = Partial<Record<Campo, string>>;

/** Los cinco desenlaces posibles de la invitación (ver convex/casos.ts). */
type EstadoInvitacion =
  | "ENVIADA"
  | "FALLIDA"
  | "OMITIDA"
  | "NO_APLICA"
  | "YA_INVITADO_RECIENTE"
  | "ENVIO_EN_CURSO";

/** Extrae el mensaje legible de un ConvexError (ver convex: errores de formulario). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NuevoCasoPage() {
  const router = useRouter();
  // Action, no mutation (REC-71): el alta ESPERA la entrega real de la invitación,
  // así que puede decirnos si Resend la aceptó o no.
  const crear = useAction(api.casos.crear);

  // ¿Están activos los avisos automáticos al damnificado? Gobierna el DEFAULT del
  // checkbox: si el interruptor está apagado, el alta no invita salvo que lo pidas.
  const emailsActivos = useQuery(api.notificaciones.emailsDamnificadoActivos);
  const flagResuelto = emailsActivos !== undefined;

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState<TipoSiniestro | "">("");
  const [aseguradora, setAseguradora] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>(PRIORIDAD_DEFAULT);

  // `null` = el agente NO tocó el checkbox → decide el server con la env var. Sólo
  // si hay una decisión CONSCIENTE se manda el override; nunca se inventa un
  // true/false desde una query todavía sin resolver.
  const [invitarOverride, setInvitarOverride] = useState<boolean | null>(null);
  const invitarChecked = invitarOverride ?? emailsActivos ?? false;

  const [errores, setErrores] = useState<Errores>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState<
    {
      email: string;
      nombre: string;
      invitacion: EstadoInvitacion;
      numeroCaso: string;
      casoId: Id<"casos">;
    } | null
  >(null);

  /**
   * Id de idempotencia del alta (REC-71). Identifica un INTENTO, no un envío: si el
   * alta falla y el agente vuelve a apretar "Crear caso" SIN tocar nada, se manda el
   * mismo id y el server devuelve el caso que ya había creado, en vez de crear otro.
   *
   * Hace falta porque `casos.crear` es una action (para poder esperar la entrega del
   * email) y las actions no tienen retry/dedup del cliente: si la conexión se corta
   * después del commit, el agente ve un error sobre un caso que YA existe.
   *
   * Se descarta apenas el agente EDITA cualquier campo: en ese caso ya no está
   * reintentando lo mismo, y devolverle el caso viejo (con los datos viejos) mientras
   * él cree haber corregido algo sería peor que el duplicado.
   */
  const solicitudRef = useRef<string | null>(null);

  const limpiar = (campo: Campo) => {
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
    if (topError) setTopError(null);
    solicitudRef.current = null; // editó algo → es un alta distinta, no un reintento
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
    // Se genera una sola vez por intento: si este submit falla y el agente reintenta
    // sin editar nada, viaja el MISMO id y el server dedupe en vez de crear otro caso.
    solicitudRef.current ??= crypto.randomUUID();
    try {
      const res = await crear({
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim(),
        tipoSiniestro: tipo as TipoSiniestro,
        aseguradora: aseguradora.trim(),
        prioridad,
        solicitudId: solicitudRef.current,
        // Se OMITE si el agente no tocó el checkbox → el default lo pone el server
        // (la env var), que es la única fuente de verdad.
        ...(invitarOverride !== null ? { enviarInvitacion: invitarOverride } : {}),
      });
      setExito({
        email: res.email,
        nombre: nombre.trim(),
        invitacion: res.invitacion,
        numeroCaso: res.numeroCaso,
        casoId: res.casoId,
      });
      // Si algo salió mal con la invitación, el agente tiene que poder LEERLO: nada
      // de redirigir a los 1200ms por encima de un error.
      if (res.invitacion === "ENVIADA" || res.invitacion === "NO_APLICA") {
        setTimeout(() => router.push(RUTAS.agente.caso(res.casoId)), 1200);
      }
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
                {exito.invitacion === "ENVIADA" && (
                  <>
                    {" "}y se le envió una invitación a{" "}
                    <strong style={{ color: "var(--text-primary)" }}>{exito.email}</strong> para que acceda al sistema.
                  </>
                )}
                {exito.invitacion === "NO_APLICA" && (
                  <>
                    . Ya tiene una cuenta activa, así que no se le envió invitación
                    {emailsActivos === false
                      ? " ni ningún otro email (los avisos automáticos están apagados)."
                      : ", pero sí el aviso de que se abrió el caso."}
                  </>
                )}
                {(exito.invitacion === "OMITIDA" ||
                  exito.invitacion === "FALLIDA" ||
                  exito.invitacion === "YA_INVITADO_RECIENTE" ||
                  exito.invitacion === "ENVIO_EN_CURSO") && <>.</>}
              </p>
            </div>

            {/* El caso SIEMPRE quedó creado. Lo que puede haber fallado es el email,
                y eso el agente tiene que poder leerlo (y actuar), no verlo pasar
                mientras la pantalla redirige sola. */}
            {exito.invitacion === "FALLIDA" && (
              <Alert variant="error" title="No pudimos enviar la invitación">
                El caso se creó igual. Enviala de nuevo o copiá el link de activación
                desde la ficha del caso.
              </Alert>
            )}
            {exito.invitacion === "OMITIDA" && (
              <Alert variant="info" title="No se envió la invitación">
                Cuando quieras dar acceso a {exito.nombre}, podés enviarle la invitación
                o copiar el link de activación desde la ficha del caso.
              </Alert>
            )}
            {exito.invitacion === "YA_INVITADO_RECIENTE" && (
              <Alert variant="warning" title="Ya tiene una invitación reciente">
                Se le entregó una hace menos de un minuto, así que no le mandamos otra.
                Podés reenviarla o copiar el link desde la ficha del caso.
              </Alert>
            )}
            {exito.invitacion === "ENVIO_EN_CURSO" && (
              <Alert variant="warning" title="Hay un envío de invitación en curso">
                No mandamos otro para no duplicarlo. Mirá el estado en la ficha del caso;
                si quedó fallido, vas a poder reintentarlo ahí mismo.
              </Alert>
            )}

            {exito.invitacion === "ENVIADA" || exito.invitacion === "NO_APLICA" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--text-tertiary)", fontSize: "var(--text-body-sm-size)", marginTop: 4 }}>
                <Loader2 size={15} className="animate-spin" />
                Redirigiendo a la ficha del caso…
              </div>
            ) : (
              <Button
                variant="primary"
                onClick={() => router.push(RUTAS.agente.caso(exito.casoId))}
              >
                Ir a la ficha del caso
              </Button>
            )}
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
            <PrioritySelector
              value={prioridad}
              onChange={(p) => {
                setPrioridad(p);
                // Cambiar la prioridad es EDITAR el alta: si no descartáramos el id, un
                // reintento devolvería el caso ya creado con la prioridad vieja y el
                // cambio se perdería en silencio. (El checkbox NO descarta el id: la
                // invitación se re-decide en el reintento, así que se respeta igual.)
                solicitudRef.current = null;
              }}
              disabled={loading}
            />
          </FormSection>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginTop: 22,
              padding: "12px 14px",
              background: "var(--primary-50)",
              border: "1px solid var(--primary-100)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span style={{ color: "var(--primary-600)", display: "flex", flexShrink: 0, marginTop: 1 }}>
              <Mail size={17} />
            </span>
            <Checkbox
              label="Enviar invitación por email"
              checked={invitarChecked}
              // Deshabilitado hasta saber el default: si dejáramos togglear antes,
              // el estado visible podría no ser el que se va a aplicar.
              disabled={loading || !flagResuelto}
              onChange={(e) => setInvitarOverride(e.target.checked)}
              helperText={
                emailsActivos === false
                  ? "Los avisos automáticos por email al damnificado están apagados en este entorno. Si no enviás la invitación ahora, vas a poder enviarla —o copiar el link de activación— desde la ficha del caso. Si ya tiene cuenta activa, no recibe ningún email."
                  : // Ojo: el checkbox sólo gobierna la INVITACIÓN. A un damnificado que
                    // ya tiene cuenta no se lo invita, pero igual le llega el aviso de
                    // "caso abierto" (eso lo gobierna el interruptor, no este check).
                    "Sólo aplica si el damnificado todavía no tiene cuenta. Si ya la tiene, no se lo invita, pero igual recibe el aviso de que se abrió el caso."
              }
            />
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
            // Sin el flag resuelto no sabemos si el alta invitaría o no: crear a
            // ciegas podría mandarle un email al damnificado sin que el agente lo
            // haya decidido. Es un instante (la query resuelve por WebSocket).
            disabled={!flagResuelto}
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
