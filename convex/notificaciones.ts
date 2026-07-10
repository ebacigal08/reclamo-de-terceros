import { internalAction, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { resolveRole } from "./users";
import { baseUrl, sendEmail } from "./email";

/**
 * Motor de notificaciones al damnificado (y al agente) — REC-28.
 *
 * `crearNotificacion` es el helper reutilizable que pide el issue: inserta el
 * registro en `notificaciones` y encola el email en una sola llamada. Lo usan
 * las mutations de casos/pedidos/plazos, reemplazando los 4 `internalAction`
 * stub que antes vivían dispersos (`notificarPedido`, `notificarRespuesta`,
 * `notificarCierre`, `notificarPlazo`). El envío real lo hace el único action
 * `enviar`, que arma asunto/cuerpo según el motivo y delega en `email.sendEmail`.
 *
 * `marcarVistas` cierra el otro extremo: el damnificado marca como leídas las
 * novedades que el feed de "Mi caso" le mostró.
 *
 * Seguridad (regla del módulo, ver convex/users.ts): la identidad se DERIVA de
 * la sesión con `resolveRole`; nunca se acepta id de identidad del cliente.
 *
 * NOTA sobre invitación y reset de contraseña: NO pasan por este motor. El
 * email de invitación (`invitaciones.enviarInvitacion`) y el provider de reset
 * (`passwordReset.ts`) son REC-65; sólo van a reusar `email.sendEmail`.
 */

// ── Validators (mirror local; MANTENER SINCRONIZADO con schema.ts) ──
// `etapa` y `resultadoCierre` espejan las unions de `convex/schema.ts` (mismo
// criterio que los mirrors de `convex/casos.ts`; el bundle de Convex no puede
// importar de `src/`).
const etapa = v.union(
  v.literal("NUEVO"),
  v.literal("EXPEDIENTE_EN_ARMADO"),
  v.literal("EXPEDIENTE_COMPLETO"),
  v.literal("PRESENTADO_A_ASEGURADORA"),
  v.literal("EN_NEGOCIACION"),
  v.literal("CERRADO"),
);

const resultadoCierre = v.union(
  v.literal("RESUELTO"),
  v.literal("RECHAZADO"),
  v.literal("EN_APELACION"),
);

const destinatario = v.union(v.literal("AGENTE"), v.literal("DAMNIFICADO"));

/**
 * Payload de una notificación, discriminado por `motivo`. Cada motivo trae
 * exactamente los datos que su plantilla de email necesita, y el union le da
 * type-safety a los call-sites (pasar `descripcion` a un `CASO_ABIERTO` no
 * compila). `EXPEDIENTE_VALIDADO` queda fuera a propósito: la feature "validar
 * expediente" no existe todavía (issue aparte).
 */
export const datosNotificacion = v.union(
  v.object({ motivo: v.literal("CASO_ABIERTO") }),
  v.object({ motivo: v.literal("AVANCE_ETAPA"), etapa }),
  v.object({ motivo: v.literal("NUEVO_PEDIDO"), descripcion: v.string() }),
  v.object({ motivo: v.literal("CASO_CERRADO"), resultadoCierre }),
  v.object({ motivo: v.literal("PEDIDO_RESPONDIDO"), descripcion: v.string() }),
  v.object({
    motivo: v.literal("PLAZO_PROXIMO"),
    descripcion: v.string(),
    fechaVencimiento: v.string(),
    damnificadoNombre: v.string(),
  }),
);
type DatosNotificacion = Infer<typeof datosNotificacion>;
type Destinatario = Infer<typeof destinatario>;

// ── Textos (mirror local; MANTENER SINCRONIZADO con src/lib/constants.ts) ──
// Label humano de cada etapa para el cuerpo del email de AVANCE_ETAPA. Espeja
// `ETAPAS[].labelHumano` de `src/lib/constants.ts` (sin import compartido).
const ETAPA_LABEL_HUMANO: Record<Infer<typeof etapa>, string> = {
  NUEVO: "Tu caso fue registrado",
  EXPEDIENTE_EN_ARMADO: "Estamos armando tu expediente",
  EXPEDIENTE_COMPLETO: "Tu expediente está completo",
  PRESENTADO_A_ASEGURADORA: "Tu reclamo fue presentado a la aseguradora",
  EN_NEGOCIACION: "Tu reclamo está en negociación con la aseguradora",
  CERRADO: "Tu caso fue cerrado",
};

// Mensaje humano por resultado de cierre (mudado desde `casos.ts`).
const MENSAJE_CIERRE: Record<Infer<typeof resultadoCierre>, string> = {
  RESUELTO:
    "Tu reclamo fue resuelto. Comunicate con tu agente para los próximos pasos.",
  RECHAZADO:
    "Tu reclamo fue rechazado por la aseguradora. Comunicate con tu agente para entender los motivos.",
  EN_APELACION:
    "Tu reclamo fue rechazado, pero tu agente está apelando la decisión. Te avisaremos de los avances.",
};

// ── Helper reutilizable: registro + encolado del email ──────────────
/**
 * Crea la notificación en la base y encola su email. Recibe `email` ya resuelto
 * (las mutations cargan al destinatario ANTES de escribir, a propósito, para
 * fallar temprano sin dejar notificación huérfana ni email sin destinatario).
 * `destinatario` es redundante con el motivo pero explícito, igual que el
 * insert que hacía cada call-site.
 */
export async function crearNotificacion(
  ctx: MutationCtx,
  args: {
    casoId: Id<"casos">;
    destinatario: Destinatario;
    email: string;
    datos: DatosNotificacion;
  },
): Promise<void> {
  await ctx.db.insert("notificaciones", {
    destinatario: args.destinatario,
    casoId: args.casoId,
    motivo: args.datos.motivo,
    visto: false,
  });
  // Atado al commit de la mutation: `runAfter` sólo dispara si la transacción
  // commitea (mismo patrón que los stubs que reemplaza).
  await ctx.scheduler.runAfter(0, internal.notificaciones.enviar, {
    email: args.email,
    casoId: args.casoId,
    destinatario: args.destinatario,
    datos: args.datos,
  });
}

// ── Plantillas de email ─────────────────────────────────────────────
function linkPara(dest: Destinatario, casoId: Id<"casos">): string {
  return dest === "AGENTE"
    ? `${baseUrl()}/agente/casos/${casoId}`
    : `${baseUrl()}/damnificado/mi-caso`;
}

/** Escapa lo que va embebido en el HTML (la descripción es texto libre del usuario). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Envuelve título + cuerpo + CTA en un HTML de email mínimo y legible. */
function renderHtml(titulo: string, cuerpo: string, url: string, cta: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <tr><td>
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6d28d9;font-weight:700">Amparo</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(titulo)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46">${esc(cuerpo)}</p>
      <a href="${url}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">${esc(cta)}</a>
      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">Si el botón no funciona, copiá este link:<br>${url}</p>
    </td></tr>
  </table>
</body></html>`;
}

type Plantilla = { subject: string; text: string; html: string };

function armar(subject: string, titulo: string, cuerpo: string, url: string, cta: string): Plantilla {
  return {
    subject,
    text: `${titulo}\n\n${cuerpo}\n\n${cta}: ${url}`,
    html: renderHtml(titulo, cuerpo, url, cta),
  };
}

/** Asunto/cuerpo del email según el motivo. `switch` exhaustivo sobre el union. */
function plantilla(datos: DatosNotificacion, dest: Destinatario, casoId: Id<"casos">): Plantilla {
  const url = linkPara(dest, casoId);
  // Todo lo que va al damnificado comparte asunto (pedido del issue).
  const ASUNTO_DAMNIFICADO = "Novedad en tu reclamo";
  switch (datos.motivo) {
    case "CASO_ABIERTO":
      return armar(
        ASUNTO_DAMNIFICADO,
        "Tu caso fue abierto",
        "Tu agente abrió tu caso en Amparo y va a acompañarte durante todo el reclamo. Entrá para ver el estado y los próximos pasos.",
        url,
        "Ver mi caso",
      );
    case "AVANCE_ETAPA":
      return armar(
        ASUNTO_DAMNIFICADO,
        "Tu reclamo avanzó",
        `Ahora está en: ${ETAPA_LABEL_HUMANO[datos.etapa]}. Entrá para ver el detalle.`,
        url,
        "Ver mi caso",
      );
    case "NUEVO_PEDIDO":
      return armar(
        ASUNTO_DAMNIFICADO,
        "Tu agente te pidió algo",
        `Tu agente necesita que le acerques: ${datos.descripcion}. Entrá para responder.`,
        url,
        "Responder el pedido",
      );
    case "CASO_CERRADO":
      return armar(
        ASUNTO_DAMNIFICADO,
        "Tu reclamo fue cerrado",
        MENSAJE_CIERRE[datos.resultadoCierre],
        url,
        "Ver mi caso",
      );
    case "PEDIDO_RESPONDIDO":
      return armar(
        "Un damnificado respondió tu pedido",
        "Respuesta a tu pedido",
        `El damnificado respondió tu pedido: ${datos.descripcion}. Entrá al caso para revisar lo que subió.`,
        url,
        "Ver el caso",
      );
    case "PLAZO_PROXIMO":
      return armar(
        `Plazo próximo a vencer — ${datos.damnificadoNombre}`,
        "Plazo próximo a vencer",
        `Hay un plazo que vence el ${datos.fechaVencimiento} en el caso de ${datos.damnificadoNombre}: ${datos.descripcion}.`,
        url,
        "Ver el caso",
      );
  }
}

// ── Entrega del email (único action; reemplaza los 4 stubs) ─────────
/**
 * Envío real de la notificación. Lo encola `crearNotificacion` con `runAfter`.
 * Arma la plantilla según el motivo y delega en `email.sendEmail`, que degrada
 * a log sin `RESEND_API_KEY` y nunca lanza (el fallo no vuelve a la mutation).
 */
export const enviar = internalAction({
  args: {
    email: v.string(),
    casoId: v.id("casos"),
    destinatario,
    datos: datosNotificacion,
  },
  handler: async (_ctx, { email, casoId, destinatario: dest, datos }) => {
    const { subject, text, html } = plantilla(datos, dest, casoId);
    await sendEmail({ to: email, subject, text, html, motivo: datos.motivo });
  },
});

// ── Marcar novedades como vistas ────────────────────────────────────
/** Tope de ids por llamada: coincide con el `.take(3)` del feed de "Mi caso". */
const MAX_MARCAR = 3;

/**
 * Marca como vistas las novedades que el feed de "Mi caso" le mostró al
 * damnificado. Mutation PÚBLICA, así que se blinda:
 *  - tope `MAX_MARCAR` (no itera sobre un array arbitrario del cliente);
 *  - identidad derivada de `resolveRole`; cada id debe ser del caso del
 *    damnificado y con `destinatario === "DAMNIFICADO"` (un id ajeno se ignora
 *    en silencio — sin log, para no meter ruido si el efecto reintenta);
 *  - idempotente: sólo escribe si estaba en `false`.
 * El caso se resuelve igual que `miCaso` (más reciente por `by_damnificado`).
 */
export const marcarVistas = mutation({
  args: { ids: v.array(v.id("notificaciones")) },
  handler: async (ctx, { ids }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") {
      throw new Error("No autorizado: se requiere una sesión de damnificado.");
    }
    if (ids.length > MAX_MARCAR) {
      throw new ConvexError("Demasiadas notificaciones para marcar de una vez.");
    }
    const caso = await ctx.db
      .query("casos")
      .withIndex("by_damnificado", (q) =>
        q.eq("damnificadoId", resolved.damnificado._id),
      )
      .order("desc")
      .first();
    if (!caso) return null;

    for (const id of ids) {
      const notif = await ctx.db.get(id);
      if (
        !notif ||
        notif.casoId !== caso._id ||
        notif.destinatario !== "DAMNIFICADO"
      ) {
        continue; // id ajeno o de otro destinatario: se ignora
      }
      if (!notif.visto) {
        await ctx.db.patch(id, { visto: true });
      }
    }
    return null;
  },
});
