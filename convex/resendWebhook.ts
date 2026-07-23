/**
 * REC-74 · Protocolo de los webhooks de Resend: verificación de firma (Svix) y
 * mapeo de los tipos de evento.
 *
 * Este módulo NO importa nada (ni siquiera del runtime de Convex) a propósito:
 * así se puede ejercitar desde Node (`scripts/webhook-mapeo.test.mjs`), cosa que
 * con `http.ts` no se puede — arrastra `_generated/server`, `auth`, y registra
 * rutas al cargarse.
 *
 * Resend firma sus webhooks con el esquema de Svix. Se verifica a mano con Web
 * Crypto (`crypto.subtle`, HMAC-SHA256) — el runtime default de Convex ya expone
 * el global `crypto` (se usa `crypto.randomUUID`/`getRandomValues` en el resto del
 * backend), así que NO hace falta la dependencia `svix` ni una Node action.
 *
 * El secreto (`RESEND_WEBHOOK_SECRET`) viene como `whsec_<base64>`: hay que sacarle
 * el prefijo `whsec_` y base64-decodear el resto para obtener los bytes de la clave.
 */

/** Nombre de la env var del secreto del webhook (patrón `VAR_SILENCIO` de email.ts). */
export const VAR_WEBHOOK_SECRET = "RESEND_WEBHOOK_SECRET";

/** Anti-replay: el `svix-timestamp` debe estar dentro de esta ventana. */
const TOLERANCIA_MS = 5 * 60_000;

export type TipoEvento = "delivered" | "bounced" | "complained" | "failed";

/** Mapea el `type` del evento de Resend a nuestro `tipo`. `null` = irrelevante. */
export function mapearTipo(type: unknown): TipoEvento | null {
  switch (type) {
    case "email.delivered":
      return "delivered";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
      return "failed";
    // Casilla SUPRIMIDA en Resend: es el modo de falla EXACTO de REC-73 —Resend
    // acepta el envío, devuelve un id y lo descarta en silencio, sin rebote—, o
    // sea justo el agujero que REC-74 vino a tapar. Se trata como no-entrega.
    case "email.suppressed":
      return "failed";
    default:
      return null;
  }
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

/** Comparación en tiempo constante de dos strings ASCII (base64). */
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * ¿La firma del webhook es válida? Verifica HMAC-SHA256 sobre
 * `${svixId}.${svixTimestamp}.${raw}` contra el secreto, y que el timestamp esté
 * dentro de la tolerancia (anti-replay). Devuelve `false` (no lanza) ante cualquier
 * problema: el handler responde 401.
 */
export async function verificarFirmaResend(args: {
  raw: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
}): Promise<boolean> {
  const secreto = process.env[VAR_WEBHOOK_SECRET];
  if (!secreto) {
    console.error(`[resend-webhook] ${VAR_WEBHOOK_SECRET} no configurada`);
    return false;
  }

  // Anti-replay: `svix-timestamp` son segundos epoch.
  const tsSeg = Number(args.svixTimestamp);
  if (!Number.isFinite(tsSeg)) return false;
  if (Math.abs(Date.now() - tsSeg * 1000) > TOLERANCIA_MS) return false;

  // `whsec_<base64>` → bytes de la clave HMAC.
  const b64 = secreto.startsWith("whsec_")
    ? secreto.slice("whsec_".length)
    : secreto;
  let claveBytes: Uint8Array<ArrayBuffer>;
  try {
    claveBytes = base64ToBytes(b64);
  } catch {
    console.error(`[resend-webhook] ${VAR_WEBHOOK_SECRET} no es base64 válido`);
    return false;
  }

  const clave = await crypto.subtle.importKey(
    "raw",
    claveBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firmado = `${args.svixId}.${args.svixTimestamp}.${args.raw}`;
  // Copia a un Uint8Array respaldado por ArrayBuffer (no SharedArrayBuffer) para
  // satisfacer el tipo `BufferSource` de `crypto.subtle.sign`.
  const datos = new Uint8Array(new TextEncoder().encode(firmado));
  const mac = await crypto.subtle.sign("HMAC", clave, datos);
  const esperada = bytesToBase64(mac);

  // `svix-signature` trae una o más firmas separadas por espacio, cada una
  // `v<version>,<base64>`. Sólo consideramos la versión `v1` (la que usan
  // Svix/Resend hoy); ignoramos cualquier otra. Alcanza con que UNA coincida.
  for (const parte of args.svixSignature.split(" ")) {
    if (!parte.startsWith("v1,")) continue;
    const sig = parte.slice("v1,".length);
    if (igualConstante(sig, esperada)) return true;
  }
  return false;
}
