import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { emailTexto, renderEmailHtml, sendEmail } from "./email";
import {
  esEmailValido,
  normalizeEmail,
  podarEnvios,
  superaUmbral,
  type UmbralEnvios,
} from "./lib";
import { TIPO_SINIESTRO_LABEL, tipoSiniestroValidator } from "./tiposSiniestro";

/**
 * REC-151 · Intake de consultas de la web pública (leads).
 *
 * `crear` es la PRIMERA mutation pública sin autenticar del sistema. Hasta acá el
 * único endpoint anónimo era el webhook de Resend, y ése viene con firma Svix; una
 * landing no puede pedir credenciales, así que la frontera es esta función y nada
 * más. Todo lo que sigue —validación, honeypot, dos limiters— existe porque del
 * otro lado no hay sesión a la que responsabilizar.
 *
 * LA REGLA QUE ORDENA TODO EL ARCHIVO: la fila en `leads` es el registro de verdad
 * y el email al estudio es una notificación. No son igual de importantes. Un aviso
 * que no salió se reconstruye mirando la tabla; un lead que nunca se guardó no
 * está en ningún lado. Cuando hay que sacrificar algo, se sacrifica el email.
 */

// ── Límites de longitud ──────────────────────────────────────────────
// Espejo de los que ya usan las tablas equivalentes del CRM, para que un mismo
// dato no tenga dos topes distintos según por dónde entró: `nombre` y `telefono`
// salen de `MAX_NOMBRE`/`MAX_TELEFONO` de `clientes.ts`, y `mensaje` de
// `MAX_DESCRIPCION` de `gestiones.ts`. (El front los replica en `maxLength` sólo
// para UX; la frontera de verdad es ésta, porque la mutation es API pública.)
const MIN_NOMBRE = 2;
const MAX_NOMBRE = 120;
const MAX_TELEFONO = 40;
const MAX_MENSAJE = 1000;

// ── Rate limit ───────────────────────────────────────────────────────
// **En una mutation de Convex no hay IP disponible**: `GenericMutationCtx` expone
// `db`, `auth`, `storage`, `scheduler` y los `run*`, y nada de la request. Es la
// misma limitación que `resetEnvios` documenta para Convex Auth, y tiene una
// consecuencia que conviene decir en voz alta en vez de fingir que no existe:
//
//   un límite POR EMAIL no frena a un atacante — le alcanza con cambiar el email.
//
// Lo que sí frena por email es el caso real y frecuente: la persona que aprieta
// "Enviar" cuatro veces porque no vio el mensaje de éxito, y el goteo lento contra
// una misma casilla. Contra la inundación deliberada el único freno duro es el
// techo GLOBAL.
const UMBRALES_EMAIL: UmbralEnvios[] = [
  { max: 2, ventanaMs: 60 * 60 * 1000 }, // 2 por hora
  { max: 5, ventanaMs: 24 * 60 * 60 * 1000 }, // 5 por día
];

const VENTANA_GLOBAL_MS = 60 * 60 * 1000;
const CLAVE_GLOBAL = "global";

/**
 * Pasado este volumen en una hora se SIGUEN guardando los leads pero se DEJA DE
 * MANDAR el aviso por email.
 *
 * La asimetría es el diseño, no un descuido. Bajo inundación hay dos cosas que
 * proteger y sólo una es irreversible: la cuota y la reputación del dominio en
 * Resend se queman de verdad —y esta cuenta es compartida con staging, así que el
 * daño no se queda en un entorno—, mientras que "no me llegó el mail" se resuelve
 * abriendo la tabla. Fallar en la dirección que conserva el dato.
 *
 * 40/hora es holgadísimo para el volumen real de la web de un estudio: si se
 * alcanza, o pasó algo extraordinario o es un ataque, y en los dos casos la
 * reacción correcta es la misma.
 */
const TECHO_GLOBAL_BLANDO = 40;

/** Techo duro: a partir de acá tampoco se escribe, para que no llenen la base. */
const TECHO_GLOBAL_DURO = 300;

// ⚠️ El contador `global` es un DOCUMENTO CALIENTE: lo escribe cada alta, así que
// dos consultas simultáneas conflictúan siempre en el OCC y una reintenta. Al
// volumen real de la web de un estudio eso es gratis —hablamos de unidades por
// día—, y bajo inundación la serialización del OCC es en sí misma un freno más.
// Queda escrito para que, si algún día una campaña mete un pico de golpe, la
// latencia extra se reconozca como esto y no se salga a buscar otra cosa. Es la
// misma trampa que el comentario de `resetEnvios` ya nombra para su tabla.

/** Casilla del estudio que recibe los avisos. Ausente ⇒ feature inerte (ver abajo). */
const VAR_EMAIL_LEADS = "EMAIL_LEADS";

type FilaEnvios = Doc<"leadsEnvios">;

/**
 * Lee el contador de una clave y lo devuelve podado, junto con sus filas.
 *
 * Calcado de `passwordReset.registrarEnvio`, con sus dos propiedades que NO son
 * cosméticas:
 *
 *  - **Leer por el índice ANTES de escribir, en la MISMA mutation.** Eso mete el
 *    rango en el read-set de la transacción, así que dos solicitudes concurrentes
 *    conflictúan en el OCC serializable: la perdedora reintenta y ve el timestamp
 *    de la ganadora. Sin esto, dos envíos simultáneos cuentan como uno y el límite
 *    se puentea con una ráfaga — que es exactamente lo que un limiter tiene que
 *    impedir.
 *  - **`.collect()` y no `.unique()`.** Si alguna vez hubiera dos filas para la
 *    misma clave, `.unique()` LANZA y el limiter queda roto (o peor: alguien lo
 *    envuelve en un try/catch y entonces deja pasar todo). Consolidar la unión de
 *    timestamps es correcto igual y se auto-cura borrando los duplicados.
 */
async function leerContador(
  ctx: MutationCtx,
  clave: string,
  ahora: number,
  ventanaMaxMs: number,
): Promise<{ filas: FilaEnvios[]; envios: number[] }> {
  const filas = await ctx.db
    .query("leadsEnvios")
    .withIndex("by_clave", (q) => q.eq("clave", clave))
    .collect();
  const envios = podarEnvios(
    filas.flatMap((f) => f.envios),
    ahora,
    ventanaMaxMs,
  );
  return { filas, envios };
}

/**
 * Persiste el contador con el intento en curso ya sumado, consolidando en UNA fila
 * canónica (la primera) y borrando los duplicados si los hubiera.
 */
async function registrarIntento(
  ctx: MutationCtx,
  clave: string,
  filas: FilaEnvios[],
  enviosPodados: number[],
  ahora: number,
): Promise<void> {
  const envios = [...enviosPodados, ahora];
  if (filas.length === 0) {
    await ctx.db.insert("leadsEnvios", { clave, envios });
    return;
  }
  await ctx.db.patch(filas[0]._id, { envios });
  for (const extra of filas.slice(1)) await ctx.db.delete(extra._id);
}

/** Recorta y normaliza espacios de un texto libre que escribió un desconocido. */
function limpiar(texto: string): string {
  return texto.trim().replace(/\s+/g, " ");
}

/**
 * Alta de una consulta desde la web pública. **Mutation PÚBLICA sin autenticar.**
 *
 * Devuelve siempre `{ ok: true }` cuando la consulta se aceptó, y nunca el `_id`:
 * un llamador anónimo no tiene por qué recibir un identificador de la base con el
 * que después pueda adivinar o referenciar filas ajenas.
 *
 * Los rechazos LANZAN `ConvexError` con un mensaje pensado para que el formulario
 * lo muestre tal cual — con UNA excepción deliberada, el honeypot.
 */
export const crear = mutation({
  args: {
    nombre: v.string(),
    email: v.string(),
    telefono: v.optional(v.string()),
    tipoSiniestro: tipoSiniestroValidator,
    mensaje: v.optional(v.string()),
    // Ley 25.326: la persona acepta que el estudio use sus datos para
    // contactarla. NO es el consentimiento de cookies (REC-11), que es otra cosa
    // y vive en otra fase.
    consentimiento: v.boolean(),
    // Honeypot. Un campo que ningún humano ve ni completa.
    sitioWeb: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    // ── Honeypot ────────────────────────────────────────────────────
    // Éxito silencioso: no se escribe nada y se devuelve exactamente la misma
    // respuesta que un alta buena. Contestarle "sos un bot" a un bot es
    // regalarle la señal que necesita para aprender a esquivar la trampa; el
    // objetivo es que el operador crea que funcionó y no reintente.
    if (args.sitioWeb !== undefined && args.sitioWeb.trim() !== "") {
      return { ok: true };
    }

    // ── Validación ──────────────────────────────────────────────────
    if (!args.consentimiento) {
      throw new ConvexError(
        "Necesitamos tu autorización para usar tus datos y poder contactarte.",
      );
    }

    const nombre = limpiar(args.nombre);
    if (nombre.length < MIN_NOMBRE || nombre.length > MAX_NOMBRE) {
      throw new ConvexError("Ingresá tu nombre y apellido.");
    }

    // `esEmailValido` viene de `convex/lib.ts` y NO se re-escribe acá: el docblock
    // de `RE_EMAIL` dice, con todas las letras, que dos fronteras que validan el
    // mismo campo tienen que validar IDÉNTICO, porque si no la corrección se
    // aplica en una y se olvida en la otra.
    const email = normalizeEmail(args.email);
    if (!esEmailValido(email)) {
      throw new ConvexError("Revisá el email: no parece una dirección válida.");
    }

    const telefono = args.telefono ? limpiar(args.telefono) : undefined;
    if (telefono !== undefined && telefono.length > MAX_TELEFONO) {
      throw new ConvexError("El teléfono es demasiado largo.");
    }

    const mensaje = args.mensaje ? args.mensaje.trim() : undefined;
    if (mensaje !== undefined && mensaje.length > MAX_MENSAJE) {
      throw new ConvexError(
        `Contanos en no más de ${MAX_MENSAJE} caracteres; el resto lo hablamos por teléfono.`,
      );
    }

    const ahora = Date.now();

    // ── Limiter por email ───────────────────────────────────────────
    const claveEmail = `email:${email}`;
    const ventanaEmailMs = Math.max(...UMBRALES_EMAIL.map((u) => u.ventanaMs));
    const porEmail = await leerContador(ctx, claveEmail, ahora, ventanaEmailMs);
    if (superaUmbral(porEmail.envios, ahora, UMBRALES_EMAIL)) {
      // Se lanza ANTES de escribir nada: la transacción entera se revierte, así
      // que un intento rechazado no consume un slot de la ventana. Es la misma
      // semántica que `passwordReset.registrarEnvio`.
      throw new ConvexError(
        "Ya recibimos tu consulta. Te vamos a contactar a la brevedad.",
      );
    }

    // ── Limiter global ──────────────────────────────────────────────
    // Una sola lectura, dos decisiones: el techo duro corta el alta y el blando
    // sólo apaga el aviso. Cuenta ALTAS, no emails, que es la magnitud que de
    // verdad describe "cuánto está entrando ahora mismo".
    const porGlobal = await leerContador(ctx, CLAVE_GLOBAL, ahora, VENTANA_GLOBAL_MS);
    if (
      superaUmbral(porGlobal.envios, ahora, [
        { max: TECHO_GLOBAL_DURO, ventanaMs: VENTANA_GLOBAL_MS },
      ])
    ) {
      throw new ConvexError(
        "Estamos recibiendo muchas consultas en este momento. Probá de nuevo en un rato.",
      );
    }
    const avisar = !superaUmbral(porGlobal.envios, ahora, [
      { max: TECHO_GLOBAL_BLANDO, ventanaMs: VENTANA_GLOBAL_MS },
    ]);

    // ── Alta ────────────────────────────────────────────────────────
    const leadId = await ctx.db.insert("leads", {
      nombre,
      email,
      telefono,
      tipoSiniestro: args.tipoSiniestro,
      mensaje,
      origen: "landing",
      consentimientoEn: ahora,
      estado: "NUEVO",
    });

    await registrarIntento(ctx, claveEmail, porEmail.filas, porEmail.envios, ahora);
    await registrarIntento(ctx, CLAVE_GLOBAL, porGlobal.filas, porGlobal.envios, ahora);

    if (avisar) {
      // Atado al commit: `runAfter` sólo dispara si la transacción commitea, así
      // que nunca sale un aviso por un lead que no quedó guardado (mismo patrón
      // que `crearNotificacion`).
      await ctx.scheduler.runAfter(0, internal.leads.avisarEstudio, { leadId });
    } else {
      console.warn(
        `[leads] techo global blando alcanzado (${TECHO_GLOBAL_BLANDO}/h): el lead se guardó, el aviso NO se envió`,
      );
    }

    return { ok: true };
  },
});

/** Una action no tiene `ctx.db`: lee el lead a través de esta query. */
export const obtener = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => ctx.db.get(leadId),
});

/**
 * Deja la traza de si el estudio se enteró. Es lo único que responde esa pregunta:
 * un aviso de lead NO se registra en `entregasEmail` (REC-74) porque
 * `entregas.registrar` exige un `casoId` y un lead no tiene caso.
 *
 * ⚠️ La contracara, dicha en voz alta: un aviso que REBOTA es silencioso. Acá se
 * sabe si Resend ACEPTÓ el envío, no si llegó. Es la razón operativa de que la
 * fila —y no el email— sea el registro de verdad.
 */
export const marcarAviso = internalMutation({
  args: { leadId: v.id("leads"), ok: v.boolean() },
  handler: async (ctx, { leadId, ok }) => {
    const ahora = Date.now();
    await ctx.db.patch(
      leadId,
      ok ? { avisoEnviadoEn: ahora } : { avisoFalloEn: ahora },
    );
  },
});

/**
 * Avisa al estudio que entró una consulta.
 *
 * ⚠️ **NO pasa por `notificaciones.enviar`, y es a propósito.** Tres razones, la
 * primera dirimente:
 *
 *  1. No compilaría: `enviar` exige `casoId: v.id("casos")` y un lead no tiene caso.
 *  2. `enviar` aplica `damnificadoPuedeRecibir` y `avisoAlDamnificadoActivo`, que
 *     gobiernan el correo AL DAMNIFICADO. Un aviso de lead va AL ESTUDIO. Meterlo
 *     por ese camino es exactamente cómo una consulta se pierde en silencio el día
 *     que alguien enciende el modo pruebas.
 *  3. `datosEmail` es un union cerrado y exhaustivo del que dependen cuatro
 *     call-sites; ensancharlo sería acoplamiento gratuito.
 *
 * Y la inmunidad no depende de que nadie se equivoque después: el destino es
 * SIEMPRE `EMAIL_LEADS`, una constante de entorno, nunca una dirección derivada de
 * lo que escribió el visitante. Aunque alguien mañana encendiera un silenciador,
 * no hay forma de que este email termine en la casilla de un damnificado.
 */
export const avisarEstudio = internalAction({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const destino = process.env[VAR_EMAIL_LEADS]?.trim();
    // Ausente ⇒ feature inerte, que es la cultura del repo ("sin la env var, el
    // comportamiento histórico"). El chequeo del `@` es por el mismo motivo que en
    // `direccionCopia`: una dirección basura se paga con rebotes y supresiones en
    // Resend, que es la enfermedad de REC-73.
    if (!destino || !destino.includes("@")) {
      console.log(
        `[leads] ${VAR_EMAIL_LEADS} no configurada: el lead quedó guardado, sin aviso por email`,
      );
      return;
    }

    const lead = await ctx.runQuery(internal.leads.obtener, { leadId });
    if (!lead) return; // borrado entre el commit y la action: nada que avisar

    const tipo = TIPO_SINIESTRO_LABEL[lead.tipoSiniestro];
    // El shell de marca compone `cuerpo` como UN párrafo y le aplica `esc()`, así
    // que los saltos de línea se colapsarían: por eso los campos van separados por
    // " · " en una sola línea en vez de como lista. El día que exista la bandeja
    // (REC-156) esto se reemplaza por un botón al lead y el cuerpo se acorta.
    const datos = [
      `Tipo: ${tipo}`,
      `Email: ${lead.email}`,
      lead.telefono ? `Teléfono: ${lead.telefono}` : null,
    ]
      .filter((x): x is string => x !== null)
      .join(" · ");

    const contenido = {
      titulo: `Nueva consulta de ${lead.nombre}`,
      cuerpo: lead.mensaje ? `${datos} — "${lead.mensaje}"` : datos,
    };

    // `sendEmail` y NO `sendEmailOrThrow`: el lead ya está guardado, así que un
    // fallo de Resend no puede convertirse en un error en la cara del visitante.
    //
    // El escapado del texto libre lo hace `renderEmailHtml`, que aplica `esc()` a
    // `titulo` y `cuerpo` — por eso acá NO se llama `esc` a mano: sería escapar dos
    // veces y el estudio leería `&amp;` en el nombre de la persona.
    //
    // El `subject` no se escapa porque no es HTML: viaja como campo JSON a la API
    // de Resend. Lo que sí importa ahí es que no lleve saltos de línea, y eso ya
    // está cubierto en el borde: `limpiar()` colapsa todo espacio en blanco antes
    // de guardar, así que `lead.nombre` no puede traer un `\n` con el que armar
    // una cabecera de más.
    const idResend = await sendEmail({
      to: destino,
      subject: `Consulta web · ${lead.nombre} · ${tipo}`,
      text: emailTexto(contenido),
      html: renderEmailHtml(contenido),
      motivo: "lead",
    });

    await ctx.runMutation(internal.leads.marcarAviso, {
      leadId,
      ok: idResend !== null,
    });
  },
});
