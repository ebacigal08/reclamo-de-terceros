import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { mapearTipo, verificarFirmaResend } from "./resendWebhook";

/** Rutas HTTP de Convex (se sirven en el dominio `.convex.site`, NO `.convex.cloud`). */
const http = httpRouter();

/** Parsea un timestamp ISO a ms. Fallback `Date.now()`: no descartamos el evento
 *  por un timestamp ilegible (el `recibidoEn` de `eventosResend` igual queda fiable). */
function parseFecha(iso: unknown): number {
  if (typeof iso === "string") {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

/**
 * REC-74 · Webhook de Resend: refleja la ENTREGA REAL de los emails.
 * Verifica la firma Svix; ante firma inválida responde 401. Los eventos válidos
 * (incluye `email.failed`) se aplican en `entregas.registrarEvento` (dedup por
 * svix-id + correlación por el id de Resend). Siempre 200 en lo válido/irrelevante
 * para que Resend no reintente.
 */
const resendWebhook = httpAction(async (ctx, request) => {
  const raw = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("faltan headers de firma", { status: 401 });
  }

  const firmaOk = await verificarFirmaResend({
    raw,
    svixId,
    svixTimestamp,
    svixSignature,
  });
  if (!firmaOk) return new Response("firma inválida", { status: 401 });

  let evento: {
    type?: unknown;
    // Hora del EVENTO: va en `created_at` TOP-LEVEL del payload de Resend. OJO:
    // `data.created_at` es otra cosa (cuándo se creó el email), no la hora del evento.
    created_at?: unknown;
    data?: { email_id?: unknown };
  };
  try {
    evento = JSON.parse(raw);
  } catch {
    return new Response("json inválido", { status: 400 });
  }

  const tipo = mapearTipo(evento.type);
  const resendId = evento.data?.email_id;
  // Tipo irrelevante o sin id correlacionable → 200 (no reintentar).
  if (!tipo || typeof resendId !== "string") {
    return new Response("ok", { status: 200 });
  }

  await ctx.runMutation(internal.entregas.registrarEvento, {
    svixId,
    resendId,
    tipo,
    createdAtEvento: parseFecha(evento.created_at),
  });
  return new Response("ok", { status: 200 });
});

http.route({ path: "/resend-webhook", method: "POST", handler: resendWebhook });

/** Rutas de Convex Auth (callbacks de login, etc.). */
auth.addHttpRoutes(http);

export default http;
