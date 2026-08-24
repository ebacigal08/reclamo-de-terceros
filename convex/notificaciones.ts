import { internalAction, mutation, query } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { resolveRole } from "./users";
import { normalizeEmail } from "./lib";
import {
  avisoAlDamnificadoActivo,
  baseUrl,
  damnificadoPuedeRecibir,
  direccionCopia,
  emailsAlDamnificadoActivos,
  emailTexto,
  renderEmailHtml,
  sendEmail,
} from "./email";

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
 * NOTA sobre invitación y reset de contraseña: NO pasan por este motor. El email de
 * invitación (`invitaciones.entregarInvitacion`) y el provider de reset
 * (`passwordReset.ts`) son REC-65 y usan `email.sendEmailOrThrow` directo. Eso no es
 * un detalle: como no pasan por `enviar`, el interruptor de REC-71 —que silencia los
 * avisos automáticos al damnificado— NO puede afectarlos. Quedan a salvo POR
 * CONSTRUCCIÓN, no porque alguien se acuerde de no romperlos.
 *
 * Que `enviar` sea el único consumidor de `sendEmail` DENTRO DEL CAMINO DE LOS AVISOS
 * AUTOMÁTICOS es, a esta altura, la propiedad más rentable del módulo: es también donde
 * se engancha la COPIA a la segunda casilla (REC-84, `enviarCopia`). Un solo lugar cubre
 * los 8 avisos automáticos y los que vengan después — y por el mismo motivo de arriba, la
 * copia tampoco puede alcanzar a la invitación ni al reset, cuyo OTP es una credencial
 * que no debe duplicarse.
 *
 * ⚠️ REC-151 · Ese "único consumidor" era literal hasta que apareció `convex/leads.ts`,
 * el aviso al ESTUDIO cuando entra una consulta de la web pública, que también llama
 * `sendEmail` directo. La propiedad de arriba sigue en pie —ningún aviso al damnificado
 * escapa a `enviar`— y el lead no la debilita, porque su destino es siempre la env var
 * `EMAIL_LEADS` y no una dirección de nadie. Pero la frase, tal como estaba, ya no era
 * cierta, y de eso justamente dependía el argumento de por qué alcanza con un solo
 * guard. Si algún día aparece un TERCER consumidor de `sendEmail` cuyo destinatario sí
 * salga de la base, esta nota es la que tiene que hacer sonar la alarma: ése sí hay que
 * meterlo por `enviar` o darle su propio guard.
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
  // `pedidoId` es OPCIONAL porque discrimina los DOS carriles que emiten este motivo:
  // el pedido de texto libre (REC-24) tiene su fila en `pedidosDocumentacion` y se
  // responde en su propia pantalla; el checklist tipado (REC-77) no tiene fila de
  // pedido y se responde subiendo por ítem desde "Mi caso". Su PRESENCIA decide, en el
  // email, tanto la redacción como el link (ver el `case` en `plantilla`).
  //
  // Es un discriminante de CARRIL, no de autorización: llevar el id en el email no
  // amplía ningún permiso. `/damnificado/pedido/[id]` se sirve con `pedidos.get`, que
  // deriva la identidad de la sesión con `resolveRole` y valida la pertenencia vía
  // pedido → caso → `caso.damnificadoId` — un id ajeno devuelve `null` igual que uno
  // inexistente. El link no es una credencial (a diferencia del de invitación).
  v.object({
    motivo: v.literal("NUEVO_PEDIDO"),
    descripcion: v.string(),
    pedidoId: v.optional(v.id("pedidosDocumentacion")),
  }),
  v.object({ motivo: v.literal("CASO_CERRADO"), resultadoCierre }),
  v.object({ motivo: v.literal("PEDIDO_RESPONDIDO"), descripcion: v.string() }),
  // REC-83 · sin campos a propósito: el aviso AGRUPA una tanda de subidas, así que
  // nombrar un archivo mentiría en cuanto haya dos. Tampoco lleva el nombre del
  // damnificado —igual que `PEDIDO_RESPONDIDO`—, y así `documentos.registrar` no
  // paga una lectura extra sólo para el asunto.
  v.object({ motivo: v.literal("NUEVO_DOCUMENTO") }),
  v.object({
    motivo: v.literal("PLAZO_PROXIMO"),
    descripcion: v.string(),
    fechaVencimiento: v.string(),
    damnificadoNombre: v.string(),
  }),
);
type DatosNotificacion = Infer<typeof datosNotificacion>;
type Destinatario = Infer<typeof destinatario>;

/**
 * Motivos que SÓLO mandan email, SIN registrarse en la tabla `notificaciones`
 * (REC-34 · chat).
 *
 * Por qué el chat no deja fila: el feed de "Mi caso" (`casos.miCaso`) es un
 * `.take(3)` de HITOS del caso —avances de etapa, pedidos— y una conversación de
 * cinco mensajes lo taparía entero. Peor: esa fila tiene su propio `visto`, que el
 * feed marca al renderizar → el damnificado podría "ver la novedad" sin abrir el
 * chat, y quedaríamos con DOS verdades desincronizadas sobre lo mismo (`visto` vs
 * `mensajes.leidoAt`). El chat ya tiene su propio indicador de no leídos.
 *
 * Está FUERA de `datosNotificacion` a propósito, no por prolijidad: `crearNotificacion`
 * hace `insert("notificaciones", { motivo: datos.motivo })`, así que si un motivo que
 * NO está en el enum `motivoNotificacion` del schema entrara a ese union, el insert
 * DEJARÍA DE COMPILAR. Al separarlo, `crearNotificacion` sencillamente no lo acepta:
 * "el chat no entra al feed" pasa a ser una garantía del compilador, no una convención
 * que alguien puede olvidar. Por lo mismo, `NUEVO_MENSAJE` NO se agrega al enum del
 * schema: nunca se persiste.
 */
export const datosSoloEmail = v.union(
  v.object({
    motivo: v.literal("NUEVO_MENSAJE"),
    // Para el asunto del email al AGENTE (mismo criterio que PLAZO_PROXIMO, que lleva
    // el nombre en el subject para poder triar). El damnificado lo ignora.
    damnificadoNombre: v.string(),
  }),
);

/** Todo lo que `enviar` sabe mandar por email, se registre o no. */
export const datosEmail = v.union(datosNotificacion, datosSoloEmail);
type DatosEmail = Infer<typeof datosEmail>;

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

type Plantilla = { subject: string; text: string; html: string };

// Reusa el shell de marca compartido (`convex/email.ts`); el botón-link envuelve
// el `cta`+`url`. El texto/HTML resultante es equivalente al de antes de REC-65.
function armar(subject: string, titulo: string, cuerpo: string, url: string, cta: string): Plantilla {
  const contenido = { titulo, cuerpo, boton: { url, label: cta } };
  return {
    subject,
    text: emailTexto(contenido),
    html: renderEmailHtml(contenido),
  };
}

/**
 * Asunto/cuerpo del email según el motivo. `switch` exhaustivo sobre el union ANCHO
 * (`DatosEmail` = los que se registran + los de sólo-email): agregar un miembro
 * ROMPE LA COMPILACIÓN acá hasta escribirle su `case`. Es la red de seguridad.
 */
function plantilla(datos: DatosEmail, dest: Destinatario, casoId: Id<"casos">): Plantilla {
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
      // Dos carriles, un solo motivo (ver el comentario de `datosNotificacion`). La
      // presencia de `pedidoId` es el discriminante, y de ahí salen las dos diferencias:
      //
      //  - CON `pedidoId` (texto libre): se responde en `/damnificado/pedido/[id]`, así
      //    que el botón entra DIRECTO ahí. Es el único aviso del damnificado que no cae
      //    en "Mi caso" —por eso arma su URL acá en vez de usar `linkPara`.
      //  - SIN `pedidoId` (checklist): no hay pantalla de pedido; se sube por ítem desde
      //    "Mi caso", que es adonde apunta `url`.
      //
      // La `descripcion` llega PELADA de los dos call-sites (el checklist manda la lista
      // de documentos, sin prefijo): la muletilla la pone la plantilla, una sola vez.
      return datos.pedidoId
        ? armar(
            ASUNTO_DAMNIFICADO,
            "Tu agente te pidió algo",
            `Tu agente necesita que le acerques: ${datos.descripcion}. Entrá para responder.`,
            `${baseUrl()}/damnificado/pedido/${datos.pedidoId}`,
            "Responder el pedido",
          )
        : armar(
            ASUNTO_DAMNIFICADO,
            "Tu agente te pidió documentación",
            `Tu agente necesita que le acerques: ${datos.descripcion}. Entrá para subirla.`,
            url,
            "Ver qué me piden",
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
    case "NUEVO_DOCUMENTO":
      // En plural y sin nombrar archivos: el aviso agrupa la tanda (ver el gate en
      // `documentos.registrar`), así que puede haber uno o varios.
      return armar(
        "Un damnificado subió documentación",
        "Documentación nueva",
        "Un damnificado subió documentación a su caso. Entrá para revisar lo que cargó.",
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
    case "NUEVO_MENSAJE":
      // El TEXTO del mensaje no va en el email, a propósito: (a) la política es
      // "avisar una vez hasta que lea", así que un solo correo puede representar
      // cinco mensajes y citar uno mentiría; (b) no volcamos contenido del caso al
      // correo (mismo criterio que `email.ts`, que ni siquiera loguea el body).
      //
      // Desde REC-70 esto sólo se invoca con dest === "AGENTE" (el chat al damnificado
      // ya no manda email; ver el gate en `mensajes.enviar`). La rama del damnificado
      // queda inalcanzable pero se deja por robustez si se reactivara.
      return dest === "AGENTE"
        ? armar(
            `Mensaje nuevo — ${datos.damnificadoNombre}`,
            "Tenés un mensaje nuevo",
            `${datos.damnificadoNombre} te escribió en el chat del caso. Entrá para leerlo y responder.`,
            url,
            "Ver el caso",
          )
        : armar(
            ASUNTO_DAMNIFICADO,
            "Tu agente te escribió",
            "Tenés un mensaje nuevo de tu agente. Entrá al chat de tu caso para leerlo y responder.",
            url,
            "Ver mi caso",
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
    // Union ANCHO: acepta tanto los motivos que se registran en `notificaciones`
    // (vía `crearNotificacion`) como los de sólo-email (el chat, que lo encola
    // directo con `scheduler.runAfter`).
    datos: datosEmail,
  },
  handler: async (ctx, { email, casoId, destinatario: dest, datos }) => {
    // La plantilla se arma UNA vez y la comparten el envío primario y la copia
    // (REC-84): el cuerpo de la copia va idéntico al original —el punto es ver lo
    // que salió—, y sólo se le antepone un prefijo al asunto.
    const { subject, text, html } = plantilla(datos, dest, casoId);

    // Interruptor de avisos al damnificado (REC-71). El corte va ACÁ porque es el
    // único consumidor de `sendEmail` EN EL CAMINO DE LOS AVISOS AL DAMNIFICADO:
    // pasan por este action tanto lo que encola `crearNotificacion` como el
    // encolado directo del chat, así que un solo guard los cubre a los dos (y a
    // cualquier aviso al damnificado que se agregue después).
    //
    // ⚠️ REC-151 · Antes esta línea decía "el ÚNICO consumidor de `sendEmail`", a
    // secas, y desde `convex/leads.ts` dejó de ser cierto. La corrección no es
    // cosmética: esa frase era el argumento de COMPLETITUD de este guard, o sea
    // la razón por la que alcanza con cortar acá. Dejarla como estaba convertía
    // una invariante de seguridad en una afirmación falsa, que es peor que no
    // tener el comentario.
    //
    // Por qué `leads.avisarEstudio` puede quedar afuera sin abrir un agujero: su
    // destino es SIEMPRE la env var `EMAIL_LEADS` —una constante de entorno, nunca
    // una dirección derivada de datos de nadie—, así que no existe forma de que
    // ese email termine en la casilla de un damnificado. Es inmunidad por
    // construcción, igual que la invitación y el reset, que salen por
    // `sendEmailOrThrow` y tampoco pasan por acá.
    //
    // Corta por DESTINATARIO y RECIÉN AHÍ mira el motivo. El orden importa: el motivo
    // solo no alcanza para deducir a quién va (NUEVO_MENSAJE va a los dos roles), así
    // que el destinatario sigue siendo la primera condición y nada de esto puede
    // alcanzar a un aviso del agente. Y por lo mismo, la invitación y el reset quedan
    // intactos POR CONSTRUCCIÓN: salen por `sendEmailOrThrow`, que no pasa por acá —
    // no dependen de que alguien se acuerde de no romperlos.
    //
    // REC-149 · `avisoAlDamnificadoActivo` = el interruptor maestro (REC-71) MÁS la
    // lista de motivos exceptuados. Con la lista ausente se comporta exactamente como
    // `emailsAlDamnificadoActivos`, que es lo que había acá antes.
    //
    // REC-150 · La allowlist de casillas se evalúa PRIMERO, y el orden no es estético:
    // decide qué dice el log. "BLOQUEADO" (esta persona no recibe NADA mientras dure el
    // modo pruebas) y "SILENCIADO" (este motivo está apagado para todos) son diagnósticos
    // distintos, y el más fuerte tiene que ganar — si no, el día que algo no llegue vas a
    // buscar el problema en la variable equivocada.
    //
    // Sólo se suprime el EMAIL: la fila de `notificaciones` ya se insertó en la
    // mutation (antes del runAfter), así que el feed in-app sigue intacto.
    //
    // REC-84 · Dejó de ser un `return` temprano y pasó a ser un `if/else`: la COPIA
    // sale igual cuando el aviso al damnificado está silenciado (decisión del
    // usuario). Por eso no puede haber una salida anticipada antes de `enviarCopia`.
    const corte =
      dest !== "DAMNIFICADO"
        ? null
        : !damnificadoPuedeRecibir(email)
          ? "BLOQUEADO"
          : !avisoAlDamnificadoActivo(datos.motivo)
            ? "SILENCIADO"
            : null;
    const silenciado = corte !== null;
    if (silenciado) {
      // Ruidoso a propósito: un email que desaparece en silencio es imposible de
      // depurar. Sin la dirección, igual que el resto del módulo (PII).
      console.log(
        `[email][${corte}] motivo=${datos.motivo} destinatario=DAMNIFICADO caso=${casoId}`,
      );
    } else {
      const resendId = await sendEmail({ to: email, subject, text, html, motivo: datos.motivo });
      // REC-74 · registrar el envío para correlacionarlo con los webhooks de entrega.
      if (resendId) {
        await registrarEntrega(ctx, {
          resendId,
          motivo: datos.motivo,
          destinatario: dest,
          casoId,
          to: email,
        });
      }
    }

    // REC-84 · La copia va DESPUÉS del primario y no puede afectarlo: si este action
    // se cortara en el medio, lo que ya salió es el aviso al destinatario real.
    await enviarCopia(ctx, {
      casoId,
      dest,
      motivo: datos.motivo,
      subject,
      text,
      html,
      silenciado,
      destinoPrimario: email,
    });
  },
});

/**
 * Registro del envío en `entregasEmail` (REC-74). Best-effort: un fallo del registro
 * no debe voltear un email que YA se mandó, así que se loguea y se traga.
 */
async function registrarEntrega(
  ctx: ActionCtx,
  args: {
    resendId: string;
    motivo: string;
    destinatario: Destinatario;
    casoId: Id<"casos">;
    to: string;
    esCopia?: boolean;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.entregas.registrar, args);
  } catch (err) {
    console.error(
      `[entregas] no se pudo registrar el envío ${args.resendId}: ${String(err)}`,
    );
  }
}

// ── Copia a la segunda casilla (REC-84) ─────────────────────────────
/**
 * Prefijo del asunto de la copia. Tres etiquetas distintas, todas filtrables en el
 * cliente de correo, porque las tres situaciones son distintas y confundirlas sería
 * el peor resultado posible de esta feature:
 *
 *   [Copia · SIN-2026-00031]              → aviso dirigido al agente
 *   [Copia al cliente · SIN-2026-00031]   → aviso al damnificado, que SÍ se le envió
 *   [Sin enviar al cliente · SIN-…]       → aviso al damnificado SILENCIADO (REC-71):
 *                                           el cliente NO lo recibió, y por eso deja
 *                                           de ser una "copia" en sentido estricto.
 *
 * Sin número si no se pudo leer: la copia nunca se pierde por un prefijo.
 */
function prefijoCopia(
  dest: Destinatario,
  silenciado: boolean,
  numeroCaso: string | null,
): string {
  const etiqueta =
    dest === "AGENTE" ? "Copia" : silenciado ? "Sin enviar al cliente" : "Copia al cliente";
  return numeroCaso ? `[${etiqueta} · ${numeroCaso}]` : `[${etiqueta}]`;
}

/**
 * Manda la copia del aviso a la segunda casilla, si hay una configurada (REC-84).
 *
 * ENTERAMENTE best-effort, por condición de auditoría: todo el cuerpo va dentro de un
 * `try`, así que ni un fallo al leer el número de caso, ni uno al enviar, ni uno al
 * registrar la entrega pueden voltear este action —y menos todavía el envío primario,
 * que ya ocurrió—. La copia es redundancia: perderla nunca puede costar el original.
 */
async function enviarCopia(
  ctx: ActionCtx,
  args: {
    casoId: Id<"casos">;
    dest: Destinatario;
    motivo: string;
    subject: string;
    text: string;
    html: string;
    silenciado: boolean;
    destinoPrimario: string;
  },
): Promise<void> {
  try {
    const copia = direccionCopia();
    if (!copia) return; // sin `EMAIL_COPIA_AVISOS`: feature inerte

    // Nadie recibe el mismo aviso dos veces en la misma bandeja. Éste es el ÚNICO
    // punto que compara dos direcciones, así que las normaliza a las dos acá (por eso
    // `direccionCopia` no normaliza: una sola fuente para el criterio).
    //
    // Alcanza con trim+lowercase (`normalizeEmail`, el mismo criterio de unicidad de
    // todo el repo): NO intentamos entender alias con `+` ni puntos, porque esas
    // reglas son específicas de cada proveedor y "adivinar" que dos direcciones son la
    // misma terminaría SALTEANDO copias legítimas — justo lo contrario de lo que se
    // busca acá, que es que el aviso llegue a dos lados.
    if (normalizeEmail(copia) === normalizeEmail(args.destinoPrimario)) return;

    let numeroCaso: string | null = null;
    try {
      numeroCaso = await ctx.runQuery(internal.casos.numeroDeCaso, {
        casoId: args.casoId,
      });
    } catch (err) {
      // Sin dirección ni asunto en el log (condición de auditoría): sólo el caso y
      // el motivo alcanzan para ubicarlo, y el prefijo degrada a `[Copia]`.
      console.error(
        `[email][copia] no se pudo leer el número del caso ${args.casoId} (motivo=${args.motivo}): ${String(err)}`,
      );
    }

    const subject = `${prefijoCopia(args.dest, args.silenciado, numeroCaso)} ${args.subject}`;
    const resendId = await sendEmail({
      to: copia,
      subject,
      text: args.text,
      html: args.html,
      // El `motivo` es SÓLO observabilidad (no viaja a Resend), así que se decora
      // para distinguir la copia en los logs. La fila de `entregasEmail`, en cambio,
      // guarda el motivo LIMPIO: ahí la copia se distingue por `esCopia`.
      motivo: `${args.motivo}·copia`,
    });
    if (resendId) {
      await registrarEntrega(ctx, {
        resendId,
        motivo: args.motivo,
        // Qué carril espeja esta copia (el aviso original iba al agente o al
        // damnificado). Quién la recibió está en `to`.
        destinatario: args.dest,
        casoId: args.casoId,
        to: copia,
        esCopia: true,
      });
    }
  } catch (err) {
    console.error(
      `[email][copia] fallo motivo=${args.motivo} caso=${args.casoId}: ${String(err)}`,
    );
  }
}

/**
 * ¿Están activos los avisos automáticos por email al damnificado? (REC-71)
 *
 * La consume el checkbox "Enviar invitación por email" del alta, para que su valor
 * por defecto lo dicte el mismo interruptor que gobierna todo lo demás (una sola
 * fuente de verdad, en las dos capas). Devuelve SÓLO un booleano: nunca el nombre
 * ni el valor crudo de la env var.
 */
export const emailsDamnificadoActivos = query({
  args: {},
  handler: async (ctx): Promise<boolean | null> => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") return null; // fail-closed
    return emailsAlDamnificadoActivos();
  },
});

// ── Novedades del AGENTE (REC-68) ───────────────────────────────────
/**
 * REC-68 · Hasta acá, las notificaciones con `destinatario: "AGENTE"` se insertaban
 * en la base y NADIE LAS LEÍA JAMÁS: no había query que las trajera y la campana del
 * header estaba deshabilitada. El agente sólo se enteraba por email, y si no miraba
 * el correo, no se enteraba. Estas dos functions le dan salida.
 *
 * Hoy son dos motivos: `PEDIDO_RESPONDIDO` (pedidos.responder) y `PLAZO_PROXIMO`
 * (el cron de plazos).
 *
 * Los mensajes del chat (REC-34) NO están acá, a propósito: no se persisten como
 * notificación (ver `datosSoloEmail`), ya tienen su propio indicador de no leídos, y
 * meterlos obligaría a mantener DOS estados de lectura sobre el mismo hecho
 * (`visto` vs `mensajes.leidoAt`), desincronizables.
 */
const MAX_NOVEDADES = 20;

/**
 * Casos del agente — TODOS, abiertos y cerrados.
 *
 * `notificaciones` no guarda `agenteId`, sólo `casoId`, así que las del agente se
 * resuelven vía sus casos. El índice `by_agente` es `["agenteId", "cerrado"]`:
 * consultarlo sólo con el prefijo `agenteId` trae los dos. Es lo que queremos —un
 * plazo por vencer de un caso que se cerró ayer sigue siendo una novedad que el
 * agente no vio— y evita que queden notificaciones imposibles de marcar.
 */
async function casosDelAgente(ctx: QueryCtx, agenteId: Id<"agentes">) {
  return await ctx.db
    .query("casos")
    .withIndex("by_agente", (q) => q.eq("agenteId", agenteId))
    .collect();
}

/**
 * Novedades del agente autenticado, de más reciente a más vieja, con el caso al que
 * pertenecen (para el link). `null` sin sesión de agente (fail-closed).
 *
 * Costo: una lectura indexada y acotada por caso. Es el mismo N+1 que ya hace
 * `casos.listMine` (que por cada caso lee el damnificado y TODOS los plazos, sin
 * tope), así que no agrega una clase de costo nueva.
 */
export const listAgente = query({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") return null;

    const casos = await casosDelAgente(ctx, resolved.agente._id);

    const porCaso = await Promise.all(
      casos.map(async (caso) => {
        const notifs = await ctx.db
          .query("notificaciones")
          .withIndex("by_caso_destinatario", (q) =>
            q.eq("casoId", caso._id).eq("destinatario", "AGENTE"),
          )
          .order("desc")
          .take(MAX_NOVEDADES);
        const damnificado = await ctx.db.get(caso.damnificadoId);
        return notifs.map((n) => ({
          _id: n._id,
          motivo: n.motivo,
          visto: n.visto,
          creadoEn: n._creationTime,
          casoId: caso._id,
          numeroCaso: caso.numeroCaso,
          damnificadoNombre: damnificado?.nombre ?? "",
        }));
      }),
    );

    const todas = porCaso.flat().sort((a, b) => b.creadoEn - a.creadoEn);
    return {
      novedades: todas.slice(0, MAX_NOVEDADES),
      // El contador se cuenta sobre TODAS las traídas, no sobre la ventana que se
      // devuelve: si hay 25 sin ver, el badge tiene que decir 25 aunque la pantalla
      // liste 20.
      noVistas: todas.filter((n) => !n.visto).length,
    };
  },
});

/**
 * Marca como vistas TODAS las novedades sin ver del agente.
 *
 * Los ids se resuelven POR ÍNDICE, no los manda el cliente — a diferencia de
 * `marcarVistas` (el del damnificado), que recibe un array y por eso necesita tope y
 * validación id por id. Misma decisión que `mensajes.marcarLeidos` (REC-34): si el
 * server puede derivar el conjunto, no hay razón para confiar en una lista del
 * cliente ni para acotar cuántas se marcan.
 *
 * Idempotente: sólo escribe las que estaban en `false`.
 */
export const marcarVistasAgente = mutation({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }

    const casos = await casosDelAgente(ctx, resolved.agente._id);
    let marcadas = 0;
    for (const caso of casos) {
      const notifs = await ctx.db
        .query("notificaciones")
        .withIndex("by_caso_destinatario", (q) =>
          q.eq("casoId", caso._id).eq("destinatario", "AGENTE"),
        )
        .collect();
      for (const n of notifs) {
        if (!n.visto) {
          await ctx.db.patch(n._id, { visto: true });
          marcadas++;
        }
      }
    }
    return { marcadas };
  },
});

// ── Marcar novedades como vistas (damnificado) ──────────────────────
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
