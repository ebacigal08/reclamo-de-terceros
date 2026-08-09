import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeEmail } from "./lib";

/**
 * REC-99 · Herramienta administrativa por CLI para dar de baja un damnificado y
 * TODO lo que cuelga de él. Nació para vaciar producción de los datos de prueba
 * antes de empezar a operar, y queda como escotilla — igual que
 * `agentes:configurarRol`, y por el mismo motivo: no hay (ni debería haber) una
 * pantalla que borre un cliente con un click.
 *
 * Es `internalMutation`: no la expone el cliente, se corre con `npx convex run`.
 *
 *   # 1) SIEMPRE primero en seco, y se lee la salida:
 *   npx convex run limpieza:borrarDamnificado \
 *     '{"damnificadoId":"<id>","dryRun":true}' --prod
 *
 *   # 2) recién después, el borrado real:
 *   npx convex run limpieza:borrarDamnificado \
 *     '{"damnificadoId":"<id>","dryRun":false}' --prod
 *
 * `dryRun` es un booleano REQUERIDO, sin default: un borrado irreversible no
 * debería poder dispararse por omitir un argumento.
 *
 * ⚠️ NO HAY DESHACER. La única red es un snapshot previo
 * (`npx convex export --prod --include-file-storage`).
 */

/** Las 13 tablas que cuelgan de `casoId`. Ocho tienen `by_caso`; cuatro lo llevan
 *  como PREFIJO de un índice compuesto, que sirve igual y evita el scan.
 *  `entregasEmail` queda afuera: es la única sin índice por caso (ver abajo). */
async function recolectarDelCaso(ctx: QueryCtx, casoId: Id<"casos">) {
  const [
    relatosSiniestro,
    documentos,
    itemsDocumentacion,
    pedidosDocumentacion,
    plazos,
    notasInternas,
    historialEtapas,
    mensajes,
    respuestasAseguradora,
    gestiones,
    chatEstado,
    notificaciones,
  ] = await Promise.all([
    ctx.db.query("relatosSiniestro").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("documentos").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("itemsDocumentacion").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("pedidosDocumentacion").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("plazos").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("notasInternas").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("historialEtapas").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("mensajes").withIndex("by_caso", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("respuestasAseguradora").withIndex("by_caso_fecha", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("gestiones").withIndex("by_caso_fecha", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("chatEstado").withIndex("by_caso_participante", (q) => q.eq("casoId", casoId)).collect(),
    ctx.db.query("notificaciones").withIndex("by_caso_destinatario", (q) => q.eq("casoId", casoId)).collect(),
  ]);

  return {
    relatosSiniestro,
    documentos,
    itemsDocumentacion,
    pedidosDocumentacion,
    plazos,
    notasInternas,
    historialEtapas,
    mensajes,
    respuestasAseguradora,
    gestiones,
    chatEstado,
    notificaciones,
  };
}

export const borrarDamnificado = internalMutation({
  args: {
    damnificadoId: v.id("damnificados"),
    dryRun: v.boolean(),
  },
  handler: async (ctx: MutationCtx, { damnificadoId, dryRun }) => {
    const dam = await ctx.db.get(damnificadoId);
    if (!dam) {
      throw new ConvexError(`No existe el damnificado ${damnificadoId}.`);
    }

    const casos = await ctx.db
      .query("casos")
      .withIndex("by_damnificado", (q) => q.eq("damnificadoId", damnificadoId))
      .collect();

    // ── Filas dependientes, caso por caso ──────────────────────────────────
    const porTabla: Record<string, number> = {};
    const idsDependientes: Id<never>[] = [];
    const storageIds: Id<"_storage">[] = [];

    for (const caso of casos) {
      const grupos = await recolectarDelCaso(ctx, caso._id);
      for (const [tabla, filas] of Object.entries(grupos)) {
        porTabla[tabla] = (porTabla[tabla] ?? 0) + filas.length;
        for (const f of filas) idsDependientes.push(f._id as Id<never>);
      }
      for (const doc of grupos.documentos) {
        if (doc.storageId) storageIds.push(doc.storageId);
      }
    }

    // `entregasEmail` es la ÚNICA sin índice por caso (sólo `by_resend_id`), así
    // que hay que escanearla. Es aceptable acá —tabla chica, operación manual y
    // única—, pero es el motivo por el que esto no debe volverse un camino
    // caliente.
    const idsCasos = new Set<string>(casos.map((c) => c._id));
    const entregasDelCaso = (await ctx.db.query("entregasEmail").collect()).filter(
      (e) => e.casoId && idsCasos.has(e.casoId),
    );
    porTabla.entregasEmail = entregasDelCaso.length;

    // ── Cuentas de Convex Auth ─────────────────────────────────────────────
    // Se resuelven por EMAIL y por presencia REAL en `users`/`authAccounts`, nunca
    // por el flag `cuentaActivada`: existe un estado de "activación a medias"
    // (cuenta creada, `marcarActivado` sin aplicar) donde el flag dice `false` y la
    // cuenta igual existe. Guiarse por el flag deja una cuenta huérfana que todavía
    // puede loguearse. Simétricamente, hay damnificados SIN cuenta: nada de esto
    // puede asumir que siempre la hay.
    const email = normalizeEmail(dam.email);

    // Guard: si ese email es TAMBIÉN el de un agente, no se toca nada de Auth.
    // Borrar la cuenta del agente lo dejaría afuera de su propia app.
    const agenteMismoEmail = await ctx.db
      .query("agentes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    const users = agenteMismoEmail
      ? []
      : await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .collect();

    const authAccountIds: Id<"authAccounts">[] = [];
    const authSessionIds: Id<"authSessions">[] = [];
    const authRefreshIds: Id<"authRefreshTokens">[] = [];
    const authVerificationIds: Id<"authVerificationCodes">[] = [];
    const authRateLimitIds: Id<"authRateLimits">[] = [];

    for (const u of users) {
      const cuentas = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", u._id))
        .collect();

      for (const cuenta of cuentas) {
        authAccountIds.push(cuenta._id);

        // Códigos de verificación (reset de contraseña, verificación de email).
        // Cuelgan de la CUENTA, no del user.
        const codigos = await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", cuenta._id))
          .collect();
        authVerificationIds.push(...codigos.map((c) => c._id));

        // `authRateLimits.identifier` NO es un email: es el `_id` de la cuenta
        // (verificado contra el snapshot de producción). Por eso se lo alcanza con
        // una igualdad exacta por índice y no hace falta ninguna heurística sobre
        // direcciones.
        const limites = await ctx.db
          .query("authRateLimits")
          .withIndex("identifier", (q) => q.eq("identifier", cuenta._id))
          .collect();
        authRateLimitIds.push(...limites.map((l) => l._id));
      }

      const sesiones = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", u._id))
        .collect();
      authSessionIds.push(...sesiones.map((s) => s._id));

      for (const s of sesiones) {
        const tokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
          .collect();
        authRefreshIds.push(...tokens.map((t) => t._id));
      }
    }

    const auth = {
      users: users.length,
      authAccounts: authAccountIds.length,
      authSessions: authSessionIds.length,
      authRefreshTokens: authRefreshIds.length,
      authVerificationCodes: authVerificationIds.length,
      authRateLimits: authRateLimitIds.length,
      omitidoPorSerAgente: agenteMismoEmail !== null,
    };

    const plan = {
      damnificado: {
        nombre: dam.nombre,
        email: dam.email,
        cuentaActivada: dam.cuentaActivada,
      },
      casos: casos.map((c) => c.numeroCaso),
      filasPorTabla: porTabla,
      archivosEnStorage: storageIds.length,
      auth,
      totalFilas:
        Object.values(porTabla).reduce((a, b) => a + b, 0) +
        casos.length +
        1 + // el damnificado
        auth.users +
        auth.authAccounts +
        auth.authSessions +
        auth.authRefreshTokens +
        auth.authVerificationCodes +
        auth.authRateLimits,
    };

    if (dryRun) {
      return { dryRun: true, borrado: false, plan };
    }

    // ── Borrado real. Hojas primero, raíces al final. ──────────────────────
    for (const id of idsDependientes) await ctx.db.delete(id);
    for (const e of entregasDelCaso) await ctx.db.delete(e._id);

    // El storage va DESPUÉS de las filas: si algo falla a mitad, la transacción
    // revierte la base pero un archivo ya borrado no vuelve. Este orden deja la
    // ventana lo más chica posible.
    for (const sid of storageIds) await ctx.storage.delete(sid);

    for (const caso of casos) await ctx.db.delete(caso._id);
    await ctx.db.delete(damnificadoId);

    for (const id of authRateLimitIds) await ctx.db.delete(id);
    for (const id of authVerificationIds) await ctx.db.delete(id);
    for (const id of authRefreshIds) await ctx.db.delete(id);
    for (const id of authSessionIds) await ctx.db.delete(id);
    for (const id of authAccountIds) await ctx.db.delete(id);
    for (const u of users) await ctx.db.delete(u._id);

    return { dryRun: false, borrado: true, plan };
  },
});

/**
 * Foto de lo que hay, para tomar el control ANTES y verificar DESPUÉS. Sólo lee.
 *
 *   npx convex run limpieza:inventario --prod
 *
 * Reporta TODAS las tablas que el borrado toca —las 13 dependientes, las 6 de
 * Auth y el storage—, no un subconjunto: si el control posterior depende de mirar
 * tablas a mano, deja de ser un control.
 */
export const inventario = internalQuery({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const damnificados = await ctx.db.query("damnificados").collect();
    const casos = await ctx.db.query("casos").collect();
    const documentos = await ctx.db.query("documentos").collect();

    const cuenta = async (t: Parameters<QueryCtx["db"]["query"]>[0]) =>
      (await ctx.db.query(t).collect()).length;

    const dependientes = {
      relatosSiniestro: await cuenta("relatosSiniestro"),
      documentos: documentos.length,
      itemsDocumentacion: await cuenta("itemsDocumentacion"),
      pedidosDocumentacion: await cuenta("pedidosDocumentacion"),
      plazos: await cuenta("plazos"),
      notasInternas: await cuenta("notasInternas"),
      historialEtapas: await cuenta("historialEtapas"),
      mensajes: await cuenta("mensajes"),
      respuestasAseguradora: await cuenta("respuestasAseguradora"),
      gestiones: await cuenta("gestiones"),
      chatEstado: await cuenta("chatEstado"),
      notificaciones: await cuenta("notificaciones"),
      entregasEmail: await cuenta("entregasEmail"),
    };

    const authTablas = {
      users: await cuenta("users"),
      authAccounts: await cuenta("authAccounts"),
      authSessions: await cuenta("authSessions"),
      authRefreshTokens: await cuenta("authRefreshTokens"),
      authVerificationCodes: await cuenta("authVerificationCodes"),
      authRateLimits: await cuenta("authRateLimits"),
    };

    return {
      damnificados: damnificados.map((d) => ({
        _id: d._id,
        nombre: d.nombre,
        email: d.email,
        cuentaActivada: d.cuentaActivada,
        casos: casos.filter((c) => c.damnificadoId === d._id).map((c) => c.numeroCaso),
      })),
      totales: {
        damnificados: damnificados.length,
        casos: casos.length,
        agentes: await cuenta("agentes"),
        archivosEnStorage: documentos.filter((d) => d.storageId).length,
        ...dependientes,
        ...authTablas,
      },
      // El próximo número que emitiría el alta. Es el control del fix de
      // `generarNumeroCaso`: contando filas daría un número YA USADO.
      proximoNumeroCaso: (() => {
        const anio = new Date().getFullYear();
        const prefijo = `SIN-${anio}-`;
        const validos = casos
          .filter((c) => c.numeroCaso.startsWith(prefijo))
          .map((c) => c.numeroCaso.slice(prefijo.length))
          .filter((s) => /^\d{5}$/.test(s))
          .map(Number);
        const max = validos.length ? Math.max(...validos) : 0;
        return `${prefijo}${String(max + 1).padStart(5, "0")}`;
      })(),
    };
  },
});
