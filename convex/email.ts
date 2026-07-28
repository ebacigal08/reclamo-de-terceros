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
 * Acá viven además los dos INTERRUPTORES por env var que gobiernan los avisos
 * automáticos, los dos con default seguro (ausente = comportamiento histórico):
 * `emailsAlDamnificadoActivos` (REC-71, silencia) y `direccionCopia` (REC-84, manda
 * una copia a una segunda casilla). Los dos los lee `notificaciones.enviar` y ninguno
 * puede tocar la invitación ni el reset, que salen por `sendEmailOrThrow`.
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

// ── Interruptor de avisos automáticos al damnificado (REC-71) ────────────────
/** Env var que silencia los avisos automáticos al damnificado. */
export const VAR_SILENCIO = "SILENCIAR_EMAILS_DAMNIFICADO";

/**
 * ¿Se le mandan al damnificado los emails AUTOMÁTICOS del caso (caso abierto,
 * avance de etapa, nuevo pedido, caso cerrado)? Permite operar el CRM con datos
 * reales sin escribirle solo al cliente, y volver atrás sin deploy de código.
 *
 * Alcance, con precisión:
 *
 *  - APAGA los 4 avisos automáticos al damnificado (caso abierto, avance de etapa,
 *    nuevo pedido, caso cerrado), en `notificaciones.enviar`.
 *  - NO afecta los emails al AGENTE (pedido respondido, plazo próximo, chat).
 *  - NO PUEDE bloquear la INVITACIÓN ni el RESET de contraseña: salen por
 *    `sendEmailOrThrow`, que no pasa por ese guard → intactos POR CONSTRUCCIÓN.
 *  - PERO sí define el valor por DEFECTO del checkbox "Enviar invitación por email"
 *    del alta (`casos.crear`: `args.enviarInvitacion ?? emailsAlDamnificadoActivos()`).
 *    O sea: con el interruptor puesto, un alta que no diga nada NO invita. Una
 *    invitación EXPLÍCITA —el checkbox tildado, o el botón de la ficha— se manda
 *    igual, siempre. El interruptor cambia el default, nunca veta un acto explícito.
 *  - NO afecta el feed in-app: las filas de `notificaciones` se crean igual.
 *
 * El nombre es NEGATIVO a propósito: así "ausente = emails encendidos" cae solo y
 * nadie se olvida de reactivarlos. Sólo `"true"`/`"1"` silencian; cualquier otro
 * valor (incluido un typo) deja los emails ACTIVOS, que es el comportamiento
 * histórico. El canary de que el silencio está puesto es humano y está a la vista:
 * el checkbox de "Nuevo caso" viene desmarcado.
 *
 * Para apagar/prender:  npx convex env set|remove SILENCIAR_EMAILS_DAMNIFICADO
 */
export function emailsAlDamnificadoActivos(): boolean {
  const raw = process.env[VAR_SILENCIO];
  if (raw === undefined || raw === "") return true;
  const valor = raw.trim().toLowerCase();
  if (valor === "true" || valor === "1") return false;
  if (valor === "false" || valor === "0") return true;
  console.warn(`[email] ${VAR_SILENCIO}="${raw}" no reconocido → asumo ACTIVOS`);
  return true;
}

// ── Casilla de copia de los avisos (REC-84) ─────────────────────────────────
/** Env var con la segunda casilla que recibe copia de los avisos automáticos. */
export const VAR_COPIA = "EMAIL_COPIA_AVISOS";

/**
 * Segunda casilla que recibe COPIA de los avisos automáticos, o `null` si no hay
 * ninguna configurada (REC-84).
 *
 * Existe porque hasta acá cada aviso tenía UN solo destinatario, y el del agente era
 * un punto único de falla: si esa casilla se rompe o Resend la suprime —lo que pasó
 * en REC-73, con MESES de avisos no entregados en silencio— nadie más se entera.
 * REC-74 hizo que el sistema lo SUPIERA (alerta in-app `AVISO_NO_ENTREGADO`), pero
 * esa alerta la ve el mismo agente cuya casilla está rota. La copia permanente es lo
 * que saca la dependencia.
 *
 * Alcance: la lee SÓLO `notificaciones.enviar`, que es el único consumidor de
 * `sendEmail`. Por lo tanto copia los 8 avisos automáticos (4 al agente + 4 al
 * damnificado) y NO PUEDE copiar la invitación ni el reset de contraseña, que salen
 * por `sendEmailOrThrow` y no pasan por ese action. Eso es deliberado y vale
 * subrayarlo: el código de reset es una CREDENCIAL, y copiarlo a otra casilla le
 * daría a esa casilla la capacidad de tomar cuentas. Queda afuera POR CONSTRUCCIÓN,
 * no porque alguien se acuerde de excluirlo.
 *
 * Ausente o vacía ⇒ `null` ⇒ feature inerte: cero copias y cero cambios respecto del
 * comportamiento histórico. Es el default seguro (y el control de la verificación).
 *
 * Devuelve la dirección SÓLO recortada, sin bajar a minúsculas: normalizar es asunto
 * del único lugar que compara dos direcciones (`enviarCopia`, que ya pasa las dos por
 * `normalizeEmail`). Así este módulo no importa nada —igual que `resendWebhook.ts`— y
 * puede cargarse fuera del runtime de Convex, que es lo que hace testeable el guard
 * de abajo en `scripts/email-copia.test.mjs`.
 *
 * Para poner/sacar:  npx convex env set|remove EMAIL_COPIA_AVISOS
 */
export function direccionCopia(): string | null {
  const raw = process.env[VAR_COPIA];
  if (raw === undefined) return null;
  const dir = raw.trim();
  if (!dir) return null;
  // Un typo acá no debe mandar avisos a una dirección basura: en la cuenta de Resend
  // eso se paga con rebotes y supresiones (la enfermedad de REC-73). Ante la duda, no
  // se copia — la copia es redundancia, y perderla nunca es peor que ensuciar la cuenta.
  if (!dir.includes("@")) {
    console.warn(`[email] ${VAR_COPIA}="${raw}" no parece una dirección → sin copia`);
    return null;
  }
  return dir;
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

// REC-74 · el `id` que devuelve Resend en el 200 se usa para correlacionar el
// envío con los eventos del webhook (entrega/rebote/fallo).
type Entrega = { ok: true; id?: string } | { ok: false; detalle: string };

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
    // El 200 trae `{ id }`: se conserva para correlacionar con el webhook (REC-74).
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id };
  } catch (err) {
    return { ok: false, detalle: acotar(err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * Envío best-effort (notificaciones). Degrada a log sin `RESEND_API_KEY` y nunca
 * lanza; un fallo se loguea (sin asunto ni cuerpo) y se traga.
 */
export async function sendEmail(args: ArgsEnvio): Promise<string | null> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email][DEV] motivo=${args.motivo} → ${args.to}`);
    return null;
  }
  const r = await entregar(args);
  if (!r.ok) {
    console.error(`[email] fallo motivo=${args.motivo} → ${args.to}: ${r.detalle}`);
    return null;
  }
  // Devuelve el `id` de Resend (o null) para registrar la entrega (REC-74).
  return r.id ?? null;
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

/** Escapa lo que va embebido en el HTML (texto libre del usuario, OTP, URL, etc.).
 *  Incluye la comilla doble para que sea seguro también dentro de un atributo
 *  (p. ej. `href="..."`). */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const urlSegura = boton ? esc(boton.url) : "";
  const bloqueBoton = boton
    ? `<a href="${urlSegura}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">${esc(boton.label)}</a>
      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">Si el botón no funciona, copiá este link:<br>${urlSegura}</p>`
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
