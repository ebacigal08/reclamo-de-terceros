/**
 * Transporte de email — Amparo CRM (REC-28).
 *
 * `sendEmail` es el ÚNICO punto de salida de correo del sistema. Va contra la
 * HTTP API de Resend con `fetch` (disponible en el runtime default de Convex),
 * sin el SDK: así no arrastra la dependencia `resend` ni obliga a `"use node"`
 * en los módulos que envían. Lo consumen los `internalAction` de notificación
 * (ver `convex/notificaciones.ts`); nunca una mutation (no puede hacer I/O).
 *
 * Dos garantías de las que dependen las mutations que encolan envíos:
 *  - **Degrada sin credencial**: si falta `RESEND_API_KEY`, loguea y retorna.
 *    Preserva el comportamiento DEV de siempre, así que la rama se puede
 *    mergear/deployar antes de setear la variable sin romper nada.
 *  - **Nunca lanza**: cualquier fallo de red o respuesta !ok se loguea y se
 *    traga. El issue lo exige: si el email falla, no debe voltear la acción
 *    del agente. Como el envío ya corre desacoplado por `scheduler.runAfter`,
 *    la mutation ya commiteó cuando esto ejecuta.
 *
 * El log lleva SÓLO destinatario y motivo — nunca el asunto ni el cuerpo. El
 * `motivo` ya identifica la notificación, y algunos asuntos incluyen PII (el de
 * `PLAZO_PROXIMO` lleva el nombre del damnificado). Cierra además el TODO que
 * arrastraban los viejos stubs en `pedidos.ts` (logueaban la descripción).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Remitente por defecto. `onboarding@resend.dev` es SÓLO dev/test: en prod
 *  hay que setear `EMAIL_FROM` a un remitente de dominio verificado. */
const FROM_DEFAULT = "Amparo <onboarding@resend.dev>";

/**
 * Base pública del sitio para los links de los emails. Centraliza el
 * `SITE_URL ?? localhost` que estaba triplicado y normaliza la barra final
 * para no generar `//damnificado/...` si `SITE_URL` viene con `/`.
 */
export function baseUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Recorta un mensaje de error para el log (no volcamos bodies enteros). */
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

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Sólo para observabilidad en el log; no viaja a Resend. */
  motivo: string;
}): Promise<void> {
  const { to, subject, text, html, motivo } = args;
  const apiKey = process.env.RESEND_API_KEY;

  // Degradación: sin API key no se envía (dev local, o deployment sin la var).
  // No logueamos el asunto: puede contener PII (ver docstring). `subject` se
  // usa sólo para el envío real de abajo.
  if (!apiKey) {
    console.log(`[email][DEV] motivo=${motivo} → ${to}`);
    return;
  }

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
    // El 403 de Resend en modo test (destinatario que no es el dueño de la
    // cuenta) cae acá: se loguea y no rompe nada.
    if (!res.ok) {
      console.error(
        `[email] fallo motivo=${motivo} → ${to}: ${res.status} ${await resumenError(res)}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] fallo motivo=${motivo} → ${to}: ${acotar(msg)}`);
  }
}
