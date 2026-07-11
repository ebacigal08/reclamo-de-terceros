import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { casoAutorizadoDual, exigirCasoAutorizadoDual } from "./autorizacion";

/**
 * REC-34 · Chat interno agente ↔ damnificado, por caso.
 *
 * ES LA PRIMERA FEATURE DUAL-ROL del proyecto. Las tres bitácoras anteriores
 * (respuestasAseguradora, gestiones, notasInternas) son solo-agente, y toda su
 * seguridad se apoyaba en que el damnificado no ve NADA. Acá el damnificado es
 * parte: lee y escribe. Eso NO afloja el guard, cambia a quién autoriza — un
 * damnificado con el `casoId` de otro caso sigue sin pasar (`casoAutorizadoDual`).
 *
 * Sigue el precedente arquitectónico igual que las bitácoras: módulo propio y query
 * propia, NO un campo colgado de `casos.get` (que hace spread del caso y expone
 * `agenteId`/`prioridad`/`aseguradora`). Y las notas internas viven en otra tabla,
 * así que no hay forma de que aparezcan en este canal.
 *
 * ── LAS DOS FUENTES DE VERDAD, SEPARADAS A PROPÓSITO ───────────────────────────
 * · `mensajes.leidoAt`      → LECTURA: contador de no leídos y acuse de "leído".
 * · `chatEstado.avisoPendiente` → NOTIFICACIÓN: si el destinatario ya tiene un aviso
 *                             por email pendiente de atender.
 *
 * Usar la lectura como proxy de la notificación (el gate ingenuo "¿tiene mensajes
 * míos sin leer? entonces ya fue avisado") produce dos bugs reales:
 *   (a) Damnificado sin cuenta activada —el estado por DEFECTO de un caso nuevo—:
 *       el 1er mensaje no manda email (el link iría a un login que no puede pasar)
 *       pero queda sin leer; cuando activa la cuenta, el 2º mensaje ve "hay sin
 *       leer" y tampoco avisa → NUNCA recibe un aviso.
 *   (b) Si el email falla (`sendEmail` es best-effort y no lanza), el gate igual
 *       asume que fue avisado y no reintenta jamás.
 * Por eso `avisoPendiente` se marca SÓLO cuando el email se encola de verdad.
 */

const MAX_TEXTO = 1000; // escalón del repo: pedidos 500 · gestiones 1000 · notas 2000

const LIMITE_DEFAULT = 30;
const LIMITE_MAX = 200; // tope duro: `listPorCaso` es una query PÚBLICA

/** A partir de acá el badge muestra "9+" en vez del número exacto. */
const TOPE_BADGE = 9;

/** Tope de mensajes marcados por llamada. Si quedaran más, la live query re-emite
 *  con `noLeidos > 0` y el efecto vuelve a llamar hasta drenar (converge). */
const MAX_MARCAR = 200;

type Participante = "AGENTE" | "DAMNIFICADO";

const contraparte = (p: Participante): Participante =>
  p === "AGENTE" ? "DAMNIFICADO" : "AGENTE";

/** Valida y normaliza el texto de un mensaje. */
function validarTexto(texto: string): string {
  const contenido = texto.trim();
  if (!contenido) {
    throw new ConvexError("Escribí el mensaje antes de enviarlo.");
  }
  if (contenido.length > MAX_TEXTO) {
    throw new ConvexError(
      `El mensaje es demasiado largo (máx. ${MAX_TEXTO} caracteres).`,
    );
  }
  return contenido;
}

/**
 * Marca como leídos los mensajes que la contraparte le mandó a `quien`, y limpia su
 * `avisoPendiente`. Lo comparten `marcarLeidos` (acuse explícito de la UI) y
 * `enviar` (porque ESCRIBIR IMPLICA HABER LEÍDO: no se puede responder sin ver el
 * hilo).
 *
 * Esa regla no es una comodidad: es lo que vuelve IMPOSIBLE EN LA BASE —y no sólo
 * improbable en la UI— el estado "el damnificado escribió pero no leyó lo anterior",
 * que rompía el gate del email cuando los mensajes de los dos autores se intercalan.
 * Un guard de servidor no puede depender de que el front marque leído al renderizar.
 *
 * Los no leídos se resuelven POR ÍNDICE, no con una lista de ids que mande el
 * cliente (a diferencia de `notificaciones.marcarVistas`, que además tiene tope 3 y
 * es damnificado-only → no se puede reusar). Así se marcan TODOS, incluso los que
 * quedaron fuera de la ventana que la UI está mostrando; si no, el badge nunca
 * llegaría a cero.
 *
 * Idempotente por construcción: el índice ya excluye los leídos.
 */
async function marcarLeidosDe(
  ctx: MutationCtx,
  casoId: Id<"casos">,
  quien: Participante,
): Promise<number> {
  const pendientes = await ctx.db
    .query("mensajes")
    .withIndex("by_caso_autor_leido", (q) =>
      q
        .eq("casoId", casoId)
        .eq("autorTipo", contraparte(quien))
        .eq("leidoAt", undefined),
    )
    .take(MAX_MARCAR);

  // Todos comparten el mismo instante: se leyeron en el mismo acto.
  const ahora = Date.now();
  for (const m of pendientes) {
    await ctx.db.patch(m._id, { leidoAt: ahora });
  }

  await setAvisoPendiente(ctx, casoId, quien, false);
  return pendientes.length;
}

/**
 * Setea el `avisoPendiente` de un participante, creando la fila si no existía.
 *
 * SIEMPRE lee por el índice ANTES de insertar, en la misma transacción: así el rango
 * queda en el read-set y dos envíos concurrentes conflictúan en el OCC de Convex (la
 * perdedora reintenta y ya ve la fila) en vez de crear DOS filas para el mismo
 * `(casoId, participante)`, lo que volvería el gate del email no determinístico.
 */
async function setAvisoPendiente(
  ctx: MutationCtx,
  casoId: Id<"casos">,
  quien: Participante,
  valor: boolean,
): Promise<void> {
  const fila = await ctx.db
    .query("chatEstado")
    .withIndex("by_caso_participante", (q) =>
      q.eq("casoId", casoId).eq("participante", quien),
    )
    .unique();

  if (!fila) {
    // `false` es el estado por defecto: no hace falta materializar la fila.
    if (!valor) return;
    await ctx.db.insert("chatEstado", {
      casoId,
      participante: quien,
      avisoPendiente: true,
    });
    return;
  }
  if (fila.avisoPendiente !== valor) {
    await ctx.db.patch(fila._id, { avisoPendiente: valor });
  }
}

/** ¿El destinatario tiene un aviso por email pendiente de atender? */
async function tieneAvisoPendiente(
  ctx: MutationCtx,
  casoId: Id<"casos">,
  quien: Participante,
): Promise<boolean> {
  const fila = await ctx.db
    .query("chatEstado")
    .withIndex("by_caso_participante", (q) =>
      q.eq("casoId", casoId).eq("participante", quien),
    )
    .unique();
  return fila?.avisoPendiente ?? false;
}

/**
 * Conversación de un caso. Guard DUAL fail-closed → `null` (sin sesión, caso
 * inexistente o ajeno; mismo trato para los tres → no filtra existencia).
 *
 * `limite` significa **LOS ÚLTIMOS N MENSAJES**, no los primeros. El índice `by_caso`
 * devuelve en orden de creación ASCENDENTE, así que un `.take()` directo traería los
 * MÁS VIEJOS y el chat abriría en la conversación de hace tres semanas. Por eso se
 * baja en `desc`, se toma la ventana y se re-invierte a ASC para renderizar.
 */
export const listPorCaso = query({
  args: { casoId: v.id("casos"), limite: v.optional(v.number()) },
  handler: async (ctx, { casoId, limite }) => {
    const auth = await casoAutorizadoDual(ctx, casoId);
    if (!auth) return null;
    const { resolved, caso } = auth;

    const yo: Participante = resolved.rol === "agente" ? "AGENTE" : "DAMNIFICADO";

    // Saneado en el SERVER: la query es pública, así que un `limite` negativo, cero,
    // fraccionario, NaN o enorme no puede llegar nunca al `.take()`.
    const bruto = Math.trunc(limite ?? LIMITE_DEFAULT);
    const n = Number.isFinite(bruto)
      ? Math.min(Math.max(bruto, 1), LIMITE_MAX)
      : LIMITE_DEFAULT;

    // El +1 existe SÓLO para saber si hay más; no se devuelve.
    const recientesDesc = await ctx.db
      .query("mensajes")
      .withIndex("by_caso", (q) => q.eq("casoId", casoId))
      .order("desc")
      .take(n + 1);

    const hayMas = recientesDesc.length > n;
    const ventana = recientesDesc.slice(0, n).reverse(); // → cronológico ascendente

    // El contador NO se cuenta sobre la ventana: un mensaje sin leer puede haber
    // quedado FUERA de ella (la contraparte mandó 40 y nunca abrí el chat) y el badge
    // tiene que contarlo igual. Va por índice, acotado (nunca lee más de 10 docs).
    const noLeidos = await ctx.db
      .query("mensajes")
      .withIndex("by_caso_autor_leido", (q) =>
        q
          .eq("casoId", casoId)
          .eq("autorTipo", contraparte(yo))
          .eq("leidoAt", undefined),
      )
      .take(TOPE_BADGE + 1);

    return {
      // Quién es el que llama, derivado de la SESIÓN. Va en el payload para que la
      // UI no tenga que asumirlo: alinear las burbujas al lado equivocado sería un
      // bug de identidad, y el server ya sabe la respuesta.
      yo,
      // PROYECCIÓN SIMÉTRICA (un solo payload para los dos roles) y ESTRICTA: nunca
      // sale `autorId` —le filtraría el `Id<"agentes">` al damnificado, justo lo que
      // la proyección de `casos.miCaso` se cuida de no exponer— ni ningún campo del
      // caso (prioridad, aseguradora, agenteId).
      //
      // `leidoAt` es simétrico por diseño: si el mensaje es MÍO, es el acuse de la
      // contraparte; si es SUYO, es cuándo lo leí yo. Ambos son parte de la
      // conversación, así que ninguno de los dos ve algo que no le corresponda.
      mensajes: ventana.map((m) => ({
        _id: m._id,
        autorTipo: m.autorTipo,
        texto: m.texto,
        enviadoEn: m._creationTime, // el `enviadoAt` del issue
        leidoAt: m.leidoAt ?? null,
      })),
      hayMas,
      noLeidos: noLeidos.length, // 0..10 → la UI pinta "9+" en el tope
      cerrado: caso.cerrado,
    };
  },
});

/**
 * Envía un mensaje. Lo pueden llamar los DOS roles.
 *
 * ORDEN: auth+pertenencia dual → cerrado → validación → enviar-implica-leer →
 * cargar contraparte → insert → gate de aviso → scheduler → return.
 */
export const enviar = mutation({
  args: { casoId: v.id("casos"), texto: v.string() },
  handler: async (ctx, { casoId, texto }) => {
    // 1-2) Sesión + pertenencia DUAL (lanza; mismo mensaje para inexistente y ajeno).
    const { resolved, caso } = await exigirCasoAutorizadoDual(ctx, casoId);

    // 3) Cerrado = congelado, para AMBOS roles (invariante uniforme del módulo).
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no se pueden enviar mensajes.");
    }

    // 4) Validación (ConvexError = legible en el cliente).
    const contenido = validarTexto(texto);

    const esAgente = resolved.rol === "agente";
    const yo: Participante = esAgente ? "AGENTE" : "DAMNIFICADO";
    const destinatario = contraparte(yo);

    // 5) ESCRIBIR IMPLICA HABER LEÍDO: se marcan como leídos los mensajes entrantes
    //    y se limpia mi propio aviso. Ver `marcarLeidosDe`.
    await marcarLeidosDe(ctx, casoId, yo);

    // 6) Cargar la contraparte ANTES de escribir (patrón del módulo: fallar temprano,
    //    sin dejar un mensaje con un email sin destinatario).
    const damnificado = await ctx.db.get(caso.damnificadoId);
    if (!damnificado) {
      throw new Error("Estado inconsistente: el caso no tiene damnificado.");
    }
    const agente = await ctx.db.get(caso.agenteId);
    if (!agente) {
      throw new Error("Estado inconsistente: el caso no tiene agente.");
    }

    // 7) Alta. `leidoAt` queda AUSENTE (nunca `null`: ver el comentario del schema).
    const mensajeId = await ctx.db.insert("mensajes", {
      casoId,
      autorId: esAgente ? resolved.agente._id : resolved.damnificado._id,
      autorTipo: yo,
      texto: contenido,
    });

    // 8) GATE DE AVISO — "avisar una vez, hasta que lea".
    //
    //    Consulta `chatEstado`, NO los mensajes sin leer (ver el encabezado). Si el
    //    destinatario ya tiene un aviso pendiente de atender, no se le manda otro
    //    email: 5 mensajes seguidos = 1 solo correo. Cuando lee (o escribe), su
    //    `avisoPendiente` se limpia y el próximo mensaje vuelve a avisarle.
    //
    //    Un damnificado sin cuenta activada NO puede recibir el aviso: el link lo
    //    llevaría a un login que todavía no puede pasar (`resolveRole` es fail-closed
    //    con él). En ese caso el mensaje se guarda igual —lo va a leer al activarse—,
    //    NO se manda el email y, sobre todo, NO se marca `avisoPendiente`: así el
    //    próximo mensaje, ya con la cuenta activa, sí le avisa.
    //
    //    RACE (dos envíos casi simultáneos): ambas transacciones leen y escriben la
    //    misma fila de `chatEstado` → el OCC de Convex serializa y reintenta a la
    //    perdedora, que ya ve `avisoPendiente = true` y no manda un segundo email.
    const puedeRecibir = destinatario === "AGENTE" ? true : damnificado.cuentaActivada;
    const yaAvisado = await tieneAvisoPendiente(ctx, casoId, destinatario);
    const avisoEnviado = puedeRecibir && !yaAvisado;

    if (avisoEnviado) {
      // Email SIN fila en `notificaciones`, a propósito: el feed de "Mi caso" es un
      // `.take(3)` de HITOS del caso (avances de etapa, pedidos) y una conversación
      // lo taparía entero. Además esa fila tiene su propio `visto`, que sería una
      // SEGUNDA verdad sobre lo mismo, desincronizable de `leidoAt`. El chat ya lleva
      // su propio indicador de no leídos.
      await ctx.scheduler.runAfter(0, internal.notificaciones.enviar, {
        email: destinatario === "AGENTE" ? agente.email : damnificado.email,
        casoId,
        destinatario,
        datos: { motivo: "NUEVO_MENSAJE", damnificadoNombre: damnificado.nombre },
      });
      await setAvisoPendiente(ctx, casoId, destinatario, true);
    }

    // `avisoEnviado` se devuelve para que la política sea OBSERVABLE desde el E2E
    // (probar "un solo email" mirando sólo la pantalla es imposible). La UI lo ignora.
    return { mensajeId, avisoEnviado };
  },
});

/**
 * Acuse de recibo del que está mirando la conversación. Lo llaman las dos UIs al
 * renderizar el chat.
 *
 * FUNCIONA CON EL CASO CERRADO, y es la ÚNICA escritura del módulo que atraviesa el
 * freeze de "cerrado = congelado". No es una escritura de negocio: es un acuse. Si la
 * bloqueáramos, el último mensaje enviado antes del cierre quedaría SIN LEER PARA
 * SIEMPRE y el destinatario vería un badge eterno que no puede apagar. Y no habilita
 * nada: lo único que `leidoAt` gobierna, además del badge, es el gate del email — y
 * en un caso cerrado nadie puede enviar.
 */
export const marcarLeidos = mutation({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const { resolved } = await exigirCasoAutorizadoDual(ctx, casoId);
    const yo: Participante = resolved.rol === "agente" ? "AGENTE" : "DAMNIFICADO";
    const marcados = await marcarLeidosDe(ctx, casoId, yo);
    return { marcados };
  },
});
