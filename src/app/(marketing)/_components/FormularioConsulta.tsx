"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { Alert, Button, Checkbox, Input, Select, Textarea } from "@/components/ui";
import {
  LEAD_MAX_MENSAJE,
  LEAD_MAX_NOMBRE,
  LEAD_MAX_TELEFONO,
  LEAD_MIN_NOMBRE,
  TIPOS_SINIESTRO,
} from "@/lib/constants";

/**
 * El único componente de la landing con `"use client"`.
 *
 * Escribe en `leads` a través de `api.leads.crear`, la ÚNICA función pública que
 * expone el backend además de las de auth. Es una `mutation` (no una action), así
 * que va con `useMutation`.
 *
 * El server revalida TODO lo que se valida acá —longitudes, formato de email,
 * consentimiento— más el rate limit por casilla y el tope global. La validación
 * de este archivo existe para que la persona vea el error sin esperar un round
 * trip, no para proteger nada: nunca es la última línea.
 */

/** Extrae el mensaje legible de un `ConvexError` (o cae al fallback). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errores = Partial<Record<"nombre" | "email" | "tipoSiniestro" | "consentimiento", string>>;

export function FormularioConsulta() {
  const crear = useMutation(api.leads.crear);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoSiniestro, setTipoSiniestro] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [consentimiento, setConsentimiento] = useState(false);
  // Honeypot: ningún humano lo ve ni lo tabula. Si viene con texto, el server
  // devuelve `{ok:true}` sin guardar nada.
  const [sitioWeb, setSitioWeb] = useState("");

  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  function validar(): Errores {
    const e: Errores = {};
    if (nombre.trim().length < LEAD_MIN_NOMBRE) e.nombre = "Escribí tu nombre.";
    if (!EMAIL_RE.test(email.trim())) e.email = "Revisá el email: no parece válido.";
    if (tipoSiniestro === "") e.tipoSiniestro = "Elegí qué te pasó.";
    if (!consentimiento) e.consentimiento = "Necesitamos tu autorización para contactarte.";
    return e;
  }

  async function onSubmit(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);

    const e = validar();
    setErrores(e);
    if (Object.keys(e).length > 0) return;

    setEnviando(true);
    try {
      await crear({
        nombre: nombre.trim(),
        email: email.trim(),
        // `undefined` y no `""`: los opcionales del validador no aceptan vacío
        // como "no vino", y una cadena vacía guardada es ruido en la tabla.
        telefono: telefono.trim() === "" ? undefined : telefono.trim(),
        tipoSiniestro: tipoSiniestro as (typeof TIPOS_SINIESTRO)[number]["value"],
        mensaje: mensaje.trim() === "" ? undefined : mensaje.trim(),
        consentimiento,
        sitioWeb: sitioWeb === "" ? undefined : sitioWeb,
      });
      setEnviado(true);
    } catch (err) {
      setErrorGeneral(
        mensajeError(err, "No pudimos enviar tu consulta. Probá de nuevo en un momento."),
      );
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div id="consulta" style={tarjeta}>
        <Alert variant="success" title="Recibimos tu consulta">
          Te vamos a escribir a <strong>{email.trim()}</strong>. Si no ves nuestro mensaje,
          revisá la carpeta de spam.
        </Alert>
      </div>
    );
  }

  return (
    <form id="consulta" onSubmit={onSubmit} style={tarjeta} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: "var(--text-h3-size)", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Contanos qué te pasó
        </h2>
        <p style={{ margin: 0, fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
          Dejanos tus datos y te respondemos por email.
        </p>
      </div>

      <Input
        label="Nombre y apellido"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errores.nombre}
        maxLength={LEAD_MAX_NOMBRE}
        autoComplete="name"
        required
      />

      <Input
        label="Email"
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errores.email}
        autoComplete="email"
        required
      />

      <Input
        label="Teléfono (opcional)"
        type="tel"
        inputMode="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        maxLength={LEAD_MAX_TELEFONO}
        autoComplete="tel"
      />

      <Select
        label="¿Qué te pasó?"
        placeholder="Elegí una opción"
        options={TIPOS_SINIESTRO}
        value={tipoSiniestro}
        onChange={(e) => setTipoSiniestro(e.target.value)}
        error={errores.tipoSiniestro}
        required
      />

      <Textarea
        label="Contanos brevemente (opcional)"
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        maxLength={LEAD_MAX_MENSAJE}
        rows={4}
        showCount
        placeholder="Cuándo pasó, dónde, y qué necesitás."
      />

      {/* Honeypot. Fuera de pantalla —no `display:none`, que algunos bots
          detectan—, sin tabulación, sin autocompletado y oculto para lectores
          de pantalla. Un humano no puede completarlo. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="mkt-sitio-web">No completes este campo</label>
        <input
          id="mkt-sitio-web"
          name="sitioWeb"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={sitioWeb}
          onChange={(e) => setSitioWeb(e.target.value)}
        />
      </div>

      <Checkbox
        label="Autorizo a que usen mis datos para contactarme por esta consulta."
        checked={consentimiento}
        onChange={(e) => setConsentimiento(e.target.checked)}
        error={errores.consentimiento}
        helperText="Los usamos para responderte y gestionar tu consulta."
      />

      {errorGeneral && <Alert variant="error">{errorGeneral}</Alert>}

      <Button type="submit" size="lg" loading={enviando} fullWidth>
        Enviar consulta
      </Button>
    </form>
  );
}

const tarjeta = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
  // `--shadow-lift` es la firma "card levantada" del registro damnificado
  // (tokens/elevation.css): es la card que reposa sobre el lienzo, que es
  // exactamente lo que hace ésta sobre la banda navy del hero.
  boxShadow: "var(--shadow-lift)",
  scrollMarginTop: 80,
};
