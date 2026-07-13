import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  createAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import {
  enCooldownInvitacion,
  estadoInvitacion,
  normalizeEmail,
  type EstadoEnvioInvitacion,
} from "./lib";
import { casoDeAgente } from "./autorizacion";
import { baseUrl, emailTexto, renderEmailHtml, sendEmailOrThrow } from "./email";

/**
 * Invitación y activación de cuenta del damnificado (REC-17).
 *
 * El damnificado no tiene registro público: lo crea el agente (REC-19) y queda
 * con `cuentaActivada=false` y un `invitacionToken`. Este módulo consume ese
 * token: valida el link, deja que el damnificado fije su contraseña (crea la
 * cuenta Password de Convex Auth) y marca la cuenta como activada.
 *
 * El disparo real (email de invitación al crear el caso) es de REC-19; acá se
 * incluye `generarInvitacionDemo` (sólo dev) para poder probar el flujo ahora.
 *
 * Los errores destinados al usuario usan `ConvexError` (mensaje legible en
 * `err.data` del lado cliente); ver src/app/activar/[token]/ActivarForm.tsx.
 */

/** Busca un damnificado por su token de invitación (null si no hay match). */
async function buscarPorToken(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"damnificados"> | null> {
  if (!token) return null;
  return await ctx.db
    .query("damnificados")
    .withIndex("by_invitacionToken", (q) => q.eq("invitacionToken", token))
    .first();
}

// ── Lectura pública para la pantalla /activar/[token] ────────────
type EstadoInvitacion =
  | { estado: "valido"; nombre: string; email: string }
  | { estado: "usado" }
  | { estado: "invalido" };

export const porToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<EstadoInvitacion> => {
    const dam = await buscarPorToken(ctx, token);
    if (!dam) return { estado: "invalido" };
    if (dam.cuentaActivada) return { estado: "usado" };
    return { estado: "valido", nombre: dam.nombre, email: dam.email };
  },
});

// ── Entrega de la invitación (REC-19 → REC-65 → REC-71) ──────────
/**
 * Arma y entrega el email de invitación. LANZA si Resend no lo acepta.
 *
 * Privado: el único que lo llama es `entregarYRegistrar`, que además registra el
 * desenlace. Entregar SIN registrar el resultado dejaría el estado del envío colgado
 * en "EN_CURSO" para siempre y bloquearía el cooldown; que no haya forma de hacerlo
 * desde afuera del módulo es a propósito.
 *
 * REC-71: antes esto era un `internalAction` que `casos.crear` disparaba con
 * `scheduler.runAfter` — o sea, DESPUÉS del commit y sin poder esperarlo. Si
 * Resend fallaba, el caso se creaba igual, el front decía "se envió una
 * invitación" y no había forma de reintentar ni de reenviar. Ahora los dos
 * llamadores lo AWAITEAN y reportan el resultado real. No queda ningún envío
 * fire-and-forget en el sistema.
 *
 * NO se loguea el link: es una credencial (ver `accesoDamnificado`).
 */
async function entregarInvitacion(email: string, token: string): Promise<void> {
  const url = `${baseUrl()}/activar/${token}`;
  const contenido = {
    titulo: "Activá tu cuenta en Amparo",
    cuerpo:
      "Tu agente creó tu caso en Amparo. Activá tu cuenta para seguir el " +
      "estado de tu reclamo, cargar la documentación que te pidan y recibir " +
      "las novedades.",
    boton: { url, label: "Activar mi cuenta" },
  };
  await sendEmailOrThrow({
    to: email,
    subject: "Activá tu cuenta en Amparo",
    motivo: "invitacion",
    text: emailTexto(contenido),
    html: renderEmailHtml(contenido),
  });
}

// ── Reenvío on-demand desde la ficha del caso (REC-71) ───────────
/**
 * Guard solo-agente-dueño + resolución del damnificado del caso.
 *
 * El arg es `casoId` y NO `damnificadoId` a propósito: el caso es la unidad de
 * autorización del sistema (mismo criterio que `notasInternas.notaAutorizada`), y
 * al resolver el damnificado por `caso.damnificadoId` la pertenencia
 * damnificado↔caso queda garantizada POR CONSTRUCCIÓN, no por un chequeo extra.
 *
 * NO usa `exigirCasoAutorizadoDual`: ese guard es dual (agente O damnificado) y acá
 * el damnificado no tiene nada que hacer — no puede invitarse a sí mismo ni leer su
 * propio token. Mismo mensaje para "no existe" y "no es tuyo" (no filtra ajenos).
 */
async function casoDeAgenteConDamnificado(
  ctx: QueryCtx,
  casoId: Id<"casos">,
): Promise<{ caso: Doc<"casos">; dam: Doc<"damnificados"> } | null> {
  const autorizado = await casoDeAgente(ctx, casoId);
  if (!autorizado) return null;

  const dam = await ctx.db.get(autorizado.caso.damnificadoId);
  if (!dam) return null;

  return { caso: autorizado.caso, dam };
}

/**
 * Chequea el cooldown y CLAMA el intento, en el mismo commit → atómico.
 *
 * Sin la escritura acá adentro, dos llamadas concurrentes (dos pestañas, o dos POST
 * directos al endpoint) pasarían las dos el chequeo antes de que exista el timestamp
 * nuevo: sería un check-then-act, no un rate-limit. Con el claim en la transacción,
 * una gana y la otra reintenta por OCC, ve el timestamp y corta.
 *
 * Reacción al cooldown: LANZA. Es la diferencia deliberada con `casos.crearRegistro`,
 * que aplica la MISMA regla (mismo helper, misma ventana) pero lo reporta como estado
 * en vez de lanzar. Acá apretaste un botón que dice "Enviar invitación": merecés saber
 * que no se envió.
 */
export const prepararInvitacion = internalMutation({
  args: { casoId: v.id("casos") },
  handler: async (
    ctx,
    { casoId },
  ): Promise<{
    damnificadoId: Id<"damnificados">;
    email: string;
    token: string;
  }> => {
    const autorizado = await casoDeAgenteConDamnificado(ctx, casoId);
    if (!autorizado) {
      throw new Error("No autorizado: el caso no existe o no es tuyo.");
    }
    const { dam } = autorizado;

    if (dam.cuentaActivada) {
      throw new ConvexError("Este damnificado ya activó su cuenta.");
    }

    const ahora = Date.now();
    const { estado } = estadoInvitacion(dam, ahora);
    if (enCooldownInvitacion(dam, ahora)) {
      // El mensaje dice la VERDAD sobre lo que pasó. Un intento FALLIDO no llega
      // hasta acá (no consume cooldown): reintentar después de un fallo es
      // exactamente lo que el error de `enviarAhora` le pide al agente que haga.
      throw new ConvexError(
        estado === "EN_CURSO"
          ? "Hay un envío en curso. Esperá unos segundos y volvé a mirar."
          : "Ya se le envió una invitación hace menos de un minuto. Esperá un momento o pasale el link de activación.",
      );
    }

    // Reusa el token si ya hay uno: regenerarlo mataría en silencio un link que el
    // agente ya copió y mandó por fuera del sistema (WhatsApp). Para INVALIDAR un link
    // filtrado está `rotarLinkActivacion`, que es explícito.
    const token = dam.invitacionToken ?? crypto.randomUUID();

    await ctx.db.patch(dam._id, {
      invitacionToken: token,
      invitacionIntentoEn: ahora, // ← el claim
      // Este envío lo produjo la FICHA, no un alta: se borra la marca del alta que haya
      // reclamado el intento anterior. Si no, el reintento idempotente de aquella alta
      // se atribuiría un email que en realidad mandó el agente desde acá.
      invitacionSolicitudId: undefined,
    });

    return { damnificadoId: dam._id, email: dam.email, token };
  },
});

/**
 * Registra CÓMO terminó el intento: entregado o rechazado. Se llama siempre, con el
 * desenlace real.
 *
 * Las dos escrituras son necesarias y no son simétricas con el claim: sin el registro
 * del FALLO, "en curso" y "falló" serían indistinguibles, y hay que tratarlos al revés
 * (uno bloquea un envío nuevo, el otro debe permitir el reintento inmediato). Ver
 * `estadoInvitacion` en lib.ts.
 */
export const marcarResultado = internalMutation({
  args: { damnificadoId: v.id("damnificados"), entregado: v.boolean() },
  handler: async (ctx, { damnificadoId, entregado }) => {
    await ctx.db.patch(
      damnificadoId,
      entregado
        ? { invitacionEnviadaEn: Date.now() }
        : { invitacionFalloEn: Date.now() },
    );
  },
});

/**
 * Entrega la invitación y registra el desenlace. Devuelve si Resend la aceptó.
 *
 * Lo comparten los DOS caminos de envío (el alta y el reenvío on-demand), que sólo
 * difieren en cómo REACCIONAN al booleano — el alta lo reporta como estado, la ficha
 * lanza. La mecánica de entregar-y-registrar, que es la parte delicada, vive una sola
 * vez: si mañana hay que reintentar o guardar el error de Resend, se toca acá.
 */
export async function entregarYRegistrar(
  ctx: ActionCtx,
  args: {
    damnificadoId: Id<"damnificados">;
    email: string;
    token: string;
    casoId: Id<"casos">;
  },
): Promise<boolean> {
  let entregado = false;
  try {
    await entregarInvitacion(args.email, args.token);
    entregado = true;
  } catch (err) {
    console.error(`[invitacion] Resend rechazó → caso ${args.casoId}: ${err}`);
  }

  // Registrar el desenlace es un paso APARTE, y su fallo NO puede cambiar el veredicto:
  // si el email salió, salió, aunque después no hayamos podido anotarlo (sería mentir
  // en la otra dirección). Queda logueado.
  try {
    await ctx.runMutation(internal.invitaciones.marcarResultado, {
      damnificadoId: args.damnificadoId,
      entregado,
    });
  } catch (err) {
    console.error(
      `[invitacion] no se pudo registrar el desenlace (entregado=${entregado}) → caso ${args.casoId}: ${err}`,
    );
  }

  return entregado;
}

/**
 * Envía (o reenvía) la invitación cuando el agente lo decide, desde la ficha.
 *
 * Es una ACTION y no una mutation porque una mutation sólo puede `scheduler.runAfter`
 * → fire-and-forget → el front tendría que decir "se envió" sobre algo que apenas se
 * agendó. Acá esperamos la respuesta de Resend y devolvemos el resultado REAL.
 */
export const enviarAhora = action({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }): Promise<{ email: string }> => {
    const { damnificadoId, email, token } = await ctx.runMutation(
      internal.invitaciones.prepararInvitacion,
      { casoId },
    );

    const entregado = await entregarYRegistrar(ctx, {
      damnificadoId,
      email,
      token,
      casoId,
    });

    if (!entregado) {
      // El fallo quedó registrado (`invitacionFalloEn`), así que la ficha lo muestra
      // Y el reintento inmediato está permitido: el cooldown no lo bloquea.
      throw new ConvexError(
        "No pudimos enviar el email de invitación. Probá de nuevo o pasale el link de activación.",
      );
    }

    return { email };
  },
});

// ── Acceso del damnificado: link de activación para el agente (REC-71) ──
/**
 * Devuelve el LINK DE ACTIVACIÓN del damnificado de un caso, para que el agente lo
 * copie y se lo pase por el canal que quiera (WhatsApp, en persona).
 *
 * ⚠️ SEGURIDAD — decisión de producto consciente. El `invitacionToken` ES UNA
 * CREDENCIAL: quien lo tenga puede fijar la contraseña de esa cuenta (`activar` sólo
 * pide token + password) y entrar COMO el damnificado. No expira. Hasta REC-71 sólo
 * viajaba al inbox del damnificado; exponerlo al agente amplía la superficie de forma
 * real — el agente ya ve todo el caso, pero antes NO podía hacerse pasar por él (p. ej.
 * escribir en el chat como el damnificado). Y el link va a viajar por WhatsApp y por el
 * portapapeles. Se acota así:
 *   - query PROPIA, nunca colgada de `casos.get` (que es dual-rol y hace spread);
 *   - sólo AGENTE DUEÑO del caso (fail-closed a null: ni un damnificado lee su token);
 *   - sólo mientras la cuenta NO esté activada (después, el link ya no sirve para nada);
 *   - la URL se arma en el server (`baseUrl()`), el token crudo nunca sale solo.
 *
 * `urlActivacion: null` con cuenta sin activar = todavía no hay token (damnificados del
 * seed, o previos a REC-71) → el front ofrece "Generar link".
 *
 * El `estado` viene DERIVADO del server (`estadoInvitacion`): la lectura de los tres
 * timestamps es una sola, y no se reimplementa en el cliente.
 */
export const accesoDamnificado = query({
  args: { casoId: v.id("casos") },
  handler: async (
    ctx,
    { casoId },
  ): Promise<{
    nombre: string;
    email: string;
    urlActivacion: string | null;
    estado: EstadoEnvioInvitacion;
    invitacionEnviadaEn: number | null;
  } | null> => {
    const autorizado = await casoDeAgenteConDamnificado(ctx, casoId);
    if (!autorizado) return null;
    const { dam } = autorizado;

    // Defensa en profundidad: con la cuenta activa no hay nada que entregar.
    if (dam.cuentaActivada) return null;

    return {
      nombre: dam.nombre,
      email: dam.email,
      urlActivacion: dam.invitacionToken
        ? `${baseUrl()}/activar/${dam.invitacionToken}`
        : null,
      estado: estadoInvitacion(dam).estado,
      invitacionEnviadaEn: dam.invitacionEnviadaEn ?? null,
    };
  },
});

/**
 * Crea el link de activación, o lo ROTA si ya existía.
 *
 * Rotar = REVOCAR: el token anterior deja de resolver, así que cualquier link que haya
 * circulado (un email reenviado, una casilla compartida, el link que el agente copió y
 * mandó por WhatsApp a un número equivocado) queda muerto.
 *
 * Esto NO es un extra: hasta REC-71, la única invalidación que existía era un efecto
 * colateral —abrirle otro caso al damnificado regeneraba el token—. Al pasar a reusar
 * el token (para no matar en silencio un link recién enviado), esa vía desapareció, y
 * el token es una CREDENCIAL que no expira. Sin esta función, un link filtrado sería
 * irrevocable salvo tocando la base a mano. Acá la revocación es explícita y visible,
 * que es como tiene que ser.
 *
 * No toca el cooldown: no envía ningún email, sólo materializa/rota el link.
 */
export const rotarLinkActivacion = mutation({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }): Promise<void> => {
    const autorizado = await casoDeAgenteConDamnificado(ctx, casoId);
    if (!autorizado) {
      throw new Error("No autorizado: el caso no existe o no es tuyo.");
    }
    const { dam } = autorizado;

    if (dam.cuentaActivada) {
      throw new ConvexError("Este damnificado ya activó su cuenta.");
    }

    await ctx.db.patch(dam._id, { invitacionToken: crypto.randomUUID() });
  },
});

// ── Internos usados por la action `activar` ──────────────────────
export const damnificadoPorToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => buscarPorToken(ctx, token),
});

export const contarPorEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // take(2) por tabla: alcanza para detectar cualquier duplicado.
    const [agentes, damnificados] = await Promise.all([
      ctx.db
        .query("agentes")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(2),
      ctx.db
        .query("damnificados")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(2),
    ]);
    return {
      agentes: agentes.length,
      damnificadoIds: damnificados.map((d) => d._id),
    };
  },
});

export const authAccountExiste = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const cuenta = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .first();
    return cuenta !== null;
  },
});

export const marcarActivado = internalMutation({
  args: { damnificadoId: v.id("damnificados") },
  handler: async (ctx, { damnificadoId }) => {
    // NO borramos invitacionToken: el uso único ya lo garantiza el chequeo de
    // `cuentaActivada` en `activar` (rechaza reactivación). Conservarlo permite
    // que `porToken` distinga un link ya usado (→ "usado") de uno inexistente
    // (→ "invalido"), en vez de mostrar ambos como "invalido".
    await ctx.db.patch(damnificadoId, { cuentaActivada: true });
  },
});

// ── Activación (action: crea la cuenta Password server-side) ─────
export const activar = action({
  args: { token: v.string(), password: v.string() },
  handler: async (ctx, { token, password }): Promise<{ email: string }> => {
    if (password.length < 8) {
      throw new ConvexError("La contraseña debe tener al menos 8 caracteres.");
    }

    const dam = await ctx.runQuery(internal.invitaciones.damnificadoPorToken, {
      token,
    });
    if (!dam) throw new ConvexError("Invitación inválida o vencida.");
    if (dam.cuentaActivada) {
      throw new ConvexError("Esta cuenta ya fue activada. Iniciá sesión.");
    }

    const email = normalizeEmail(dam.email);

    // Invariante de unicidad global (alineado con resolveRole): el email debe
    // corresponder a EXACTAMENTE 1 damnificado —el del token— y 0 agentes.
    const { agentes, damnificadoIds } = await ctx.runQuery(
      internal.invitaciones.contarPorEmail,
      { email },
    );
    if (agentes > 0) {
      throw new ConvexError(
        "Conflicto de cuenta: el email ya pertenece a un agente.",
      );
    }
    if (damnificadoIds.length !== 1 || damnificadoIds[0] !== dam._id) {
      throw new ConvexError(
        "Conflicto de cuenta: el email no es único entre damnificados.",
      );
    }

    // Idempotente ante una activación a medias: si ya existe la cuenta Password
    // (por un intento previo interrumpido), sólo (re)fija la contraseña.
    const yaTieneCuenta = await ctx.runQuery(
      internal.invitaciones.authAccountExiste,
      { email },
    );
    if (yaTieneCuenta) {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: password },
      });
    } else {
      await createAccount(ctx, {
        provider: "password",
        account: { id: email, secret: password },
        profile: { email, name: dam.nombre },
      });
    }

    await ctx.runMutation(internal.invitaciones.marcarActivado, {
      damnificadoId: dam._id,
    });

    return { email };
  },
});

// ── Helper DEV: generar una invitación para probar el flujo ──────
// Sustituye el disparo real (REC-19). Es `internalAction` a propósito: NO se
// expone a la app/cliente. Se invoca sólo desde el CLI admin — `npx convex run`
// puede correr funciones internal — y está gated a `DEPLOYMENT_ENV==="dev"`.
//   npx convex run invitaciones:generarInvitacionDemo
//   npx convex run invitaciones:generarInvitacionDemo '{"email":"marta.coledani@example.com"}'
export const setTokenDemo = internalMutation({
  args: { email: v.optional(v.string()), token: v.string() },
  handler: async (ctx, { email, token }): Promise<{ email: string }> => {
    let dam: Doc<"damnificados"> | null = null;
    if (email) {
      dam = await ctx.db
        .query("damnificados")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
    } else {
      // Sin email explícito: el primer damnificado que aún no activó su cuenta.
      const todos = await ctx.db.query("damnificados").collect();
      dam = todos.find((d) => !d.cuentaActivada) ?? todos[0] ?? null;
    }
    if (!dam) {
      throw new Error("No hay damnificado para invitar (¿corriste el seed?).");
    }
    // NO toca `invitacionEnviadaEn`: este helper genera un link, no envía ningún
    // email. Escribirlo diría "invitación enviada el …" en la ficha por un correo
    // que nunca salió (REC-71: ese campo significa "Resend lo aceptó", y nada más).
    await ctx.db.patch(dam._id, { invitacionToken: token });
    return { email: dam.email };
  },
});

export const generarInvitacionDemo = internalAction({
  args: { email: v.optional(v.string()) },
  handler: async (
    ctx,
    { email },
  ): Promise<{ email: string; token: string; url: string }> => {
    if (process.env.DEPLOYMENT_ENV !== "dev") {
      throw new Error("generarInvitacionDemo: sólo disponible en dev.");
    }
    const token = crypto.randomUUID();
    const objetivo = email ? normalizeEmail(email) : undefined;
    const res = await ctx.runMutation(internal.invitaciones.setTokenDemo, {
      email: objetivo,
      token,
    });
    const url = `${baseUrl()}/activar/${token}`;
    console.log(
      `[invitacion][DEV] Link de activación para ${res.email}: ${url}`,
    );
    return { email: res.email, token, url };
  },
});
