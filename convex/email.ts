/**
 * Transporte y plantillas de email — Amparo CRM (REC-28, REC-65).
 *
 * Todo el correo del sistema sale por acá, contra la HTTP API de Resend con
 * `fetch` (runtime default de Convex, sin el SDK ni `"use node"`). Hay DOS
 * semánticas de envío, según qué tan crítica sea la entrega:
 *
 *  - `sendEmail` — **best-effort** (notificaciones, REC-28). Degrada a log sin
 *    `RESEND_API_KEY` y NUNCA lanza: un email de novedad que no sale no debe
 *    voltear la acción del agente.
 *  - `sendEmailOrThrow` — **crítico** (reset de contraseña e invitación, REC-65).
 *    LANZA si no puede entregar (sin key, Resend !ok, o fallo de red). El flujo
 *    de auth debe fallar VISIBLEMENTE en vez de decir "te enviamos el código"
 *    cuando en realidad no se entregó.
 *
 * Ninguna de las dos loguea el asunto ni el cuerpo (evita exponer PII como el
 * OTP de reset o la descripción de un pedido); el log/el error de fallo llevan
 * sólo destinatario, motivo y el detalle acotado de Resend.
 *
 * Las plantillas de marca (`renderEmailHtml`, `emailTexto`, `esc`) también viven
 * acá para que notificaciones, reset e invitación compartan un solo look.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Remitente por defecto. `onboarding@resend.dev` es SÓLO dev/test: en prod
 *  hay que setear `EMAIL_FROM` a un remitente de dominio verificado. */
const FROM_DEFAULT = "Amparo <onboarding@resend.dev>";

/**
 * Base pública del sitio para los links de los emails. Centraliza el
 * `SITE_URL ?? localhost` y normaliza la barra final para no generar
 * `//damnificado/...` si `SITE_URL` viene con `/`.
 */
export function baseUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Recorta un mensaje para el log/el error (no volcamos bodies enteros). */
function acotar(s: string): string {
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

/** Extrae un detalle legible y acotado de una respuesta de error de Resend. */
async function resumenError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "message" in body) {
      const msg = (body as { message?: unknown }).message;
      if (typeof msg === "string") return acotar(msg);
    }
    return acotar(JSON.stringify(body));
  } catch {
    return "(sin cuerpo legible)";
  }
}

type ArgsEnvio = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Sólo para observabilidad; no viaja a Resend ni al mensaje de error. */
  motivo: string;
};

type Entrega = { ok: true } | { ok: false; detalle: string };

/**
 * Hace el POST a Resend y devuelve el resultado. NO lanza y NO loguea (eso lo
 * deciden `sendEmail`/`sendEmailOrThrow` según su semántica). El `detalle` de
 * fallo lleva sólo status/mensaje de Resend, nunca el asunto ni el cuerpo.
 */
async function entregar({ to, subject, text, html }: ArgsEnvio): Promise<Entrega> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, detalle: "RESEND_API_KEY no configurada" };

  const from = process.env.EMAIL_FROM ?? FROM_DEFAULT;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (!res.ok) return { ok: false, detalle: `${res.status} ${await resumenError(res)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detalle: acotar(err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * Envío best-effort (notificaciones). Degrada a log sin `RESEND_API_KEY` y nunca
 * lanza; un fallo se loguea (sin asunto ni cuerpo) y se traga.
 */
export async function sendEmail(args: ArgsEnvio): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email][DEV] motivo=${args.motivo} → ${args.to}`);
    return;
  }
  const r = await entregar(args);
  if (!r.ok) {
    console.error(`[email] fallo motivo=${args.motivo} → ${args.to}: ${r.detalle}`);
  }
}

/**
 * Envío crítico (reset de contraseña, invitación). LANZA si no se pudo entregar,
 * para que el flujo de auth falle visiblemente en vez de simular éxito. El error
 * lleva sólo motivo y el detalle de Resend — NUNCA el asunto, el cuerpo ni el OTP.
 */
export async function sendEmailOrThrow(args: ArgsEnvio): Promise<void> {
  const r = await entregar(args);
  if (!r.ok) {
    throw new Error(`No se pudo enviar el email (motivo=${args.motivo}): ${r.detalle}`);
  }
}

// ── Plantillas de marca (compartidas por notificaciones, reset e invitación) ──

/** Escapa lo que va embebido en el HTML (texto libre del usuario, OTP, etc.). */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type ContenidoEmail = {
  titulo: string;
  cuerpo: string;
  /** Email con botón-link (invitación, notificaciones). */
  boton?: { url: string; label: string };
  /** Email con un código destacado (OTP de reset). */
  codigo?: string;
};

/** Envuelve título + cuerpo + (botón | código) en el HTML de marca de Amparo. */
export function renderEmailHtml({ titulo, cuerpo, boton, codigo }: ContenidoEmail): string {
  const bloqueCodigo = codigo
    ? `<div style="margin:0 0 24px;padding:16px 20px;background:#f4f4f5;border-radius:8px;font-family:'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:.2em;text-align:center;color:#18181b">${esc(codigo)}</div>`
    : "";
  const bloqueBoton = boton
    ? `<a href="${boton.url}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">${esc(boton.label)}</a>
      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">Si el botón no funciona, copiá este link:<br>${boton.url}</p>`
    : "";
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <tr><td>
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6d28d9;font-weight:700">Amparo</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(titulo)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46">${esc(cuerpo)}</p>
      ${bloqueCodigo}${bloqueBoton}
    </td></tr>
  </table>
</body></html>`;
}

/** Versión en texto plano del mismo contenido. */
export function emailTexto({ titulo, cuerpo, boton, codigo }: ContenidoEmail): string {
  let t = `${titulo}\n\n${cuerpo}`;
  if (codigo) t += `\n\n${codigo}`;
  if (boton) t += `\n\n${boton.label}: ${boton.url}`;
  return t;
}
