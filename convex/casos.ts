import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { resolveRole } from "./users";
import { normalizeEmail } from "./lib";
import { crearNotificacion } from "./notificaciones";

/**
 * Funciones del Caso.
 *
 * Regla de seguridad (ver convex/users.ts): la identidad se DERIVA de la
 * sesión con `resolveRole`. Ninguna función pública acepta `agenteId` /
 * `damnificadoId` desde el cliente como identidad o autorización.
 */

const tipoSiniestro = v.union(
  v.literal("ACCIDENTE"),
  v.literal("ROBO"),
  v.literal("INCENDIO"),
  v.literal("INUNDACION"),
  v.literal("OTRO"),
);

const prioridad = v.union(
  v.literal("ALTA"),
  v.literal("MEDIA"),
  v.literal("BAJA"),
);

const ORDEN_PRIORIDAD: Record<"ALTA" | "MEDIA" | "BAJA", number> = {
  ALTA: 0,
  MEDIA: 1,
  BAJA: 2,
};

// Validador de la etapa (mirror de la union `etapa` de `convex/schema.ts`;
// mismo criterio que `tipoSiniestro`/`prioridad` arriba). Valida el arg
// `etapaActual` de la concurrencia optimista en `avanzarEtapa`.
const etapa = v.union(
  v.literal("NUEVO"),
  v.literal("EXPEDIENTE_EN_ARMADO"),
  v.literal("EXPEDIENTE_COMPLETO"),
  v.literal("PRESENTADO_A_ASEGURADORA"),
  v.literal("EN_NEGOCIACION"),
  v.literal("CERRADO"),
);

// Validador del resultado de cierre (mirror de la union `resultadoCierre` de
// `convex/schema.ts` y de `RESULTADOS_CIERRE` de `src/lib/constants.ts`).
const resultadoCierre = v.union(
  v.literal("RESUELTO"),
  v.literal("RECHAZADO"),
  v.literal("EN_APELACION"),
);

// Orden canónico del pipeline. MANTENER SINCRONIZADO con la union `etapa` de
// `convex/schema.ts` y con `ETAPAS` de `src/lib/constants.ts` (no hay import
// compartido). Se usa para resolver "la etapa siguiente". `CERRADO` se lista
// para poder indexar, pero NO se alcanza desde `avanzarEtapa`: el cierre (con
// resultado) es la pantalla Cerrar caso (REC-30).
const ORDEN_ETAPAS = [
  "NUEVO",
  "EXPEDIENTE_EN_ARMADO",
  "EXPEDIENTE_COMPLETO",
  "PRESENTADO_A_ASEGURADORA",
  "EN_NEGOCIACION",
  "CERRADO",
] as const;

// Última etapa desde la que `avanzarEtapa` puede mover es PRESENTADO (idx 3),
// cuyo siguiente es EN_NEGOCIACION (idx 4). Desde EN_NEGOCIACION en adelante el
// botón se deshabilita: el único "siguiente" sería CERRADO → Cerrar caso.
const IDX_EN_NEGOCIACION = 4;

/**
 * Lista de casos activos del **agente autenticado** (REC-18).
 * No recibe `agenteId`: lo deriva de la sesión. Enriquece con el nombre del
 * damnificado y el vencimiento más próximo, y ordena por prioridad y — dentro
 * de cada prioridad — por vencimiento (los sin vencimiento, al final).
 */
export const listMine = query({
  // `hoyISO` es la fecha LOCAL del cliente (YYYY-MM-DD). La regla de "plazo
  // inminente" es de calendario local (AR): calcular "hoy" en el server (UTC)
  // correría la frontera un día de noche en Argentina. `hoyISO` NO participa
  // de la autorización ni de la selección de casos (sólo del flag de display).
  args: { hoyISO: v.string() },
  handler: async (ctx, { hoyISO }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }
    // Validación de formato: evita derivar un `limiteISO` disparatado si
    // llegara un valor inválido (nuestro cliente siempre manda YYYY-MM-DD).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoyISO)) {
      throw new Error("hoyISO inválido: se espera formato YYYY-MM-DD.");
    }
    const agenteId = resolved.agente._id;

    // Límite de "inminente": hoy + 3 días en aritmética de CALENDARIO. Se ancla
    // en medianoche UTC de `hoyISO` y se suman 3×24h; ambos extremos caen en
    // medianoche UTC, así que el resultado es la fecha-calendario +3 exacta,
    // sin corrimiento por timezone. Comparar strings YYYY-MM-DD = comparar fechas.
    const limiteISO = new Date(
      new Date(`${hoyISO}T00:00:00Z`).getTime() + 3 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);

    const casos = await ctx.db
      .query("casos")
      .withIndex("by_agente", (q) =>
        q.eq("agenteId", agenteId).eq("cerrado", false),
      )
      .collect();

    const filas = await Promise.all(
      casos.map(async (caso) => {
        const damnificado = await ctx.db.get(caso.damnificadoId);
        // Todos los plazos del caso, ordenados por fechaVencimiento asc
        // (índice by_caso_fecha; ISO YYYY-MM-DD = orden cronológico).
        const plazos = await ctx.db
          .query("plazos")
          .withIndex("by_caso_fecha", (q) => q.eq("casoId", caso._id))
          .collect();
        // "Inminente" (REC-18): ALGÚN plazo a ≤3 días —incluye vencidos, sin
        // cota inferior— que además NO fue avisado al agente (avisadoAlAgente
        // se marcará con el job de alertas de Fase 5; hoy siempre es false).
        const inminente = plazos.some(
          (p) => !p.avisadoAlAgente && p.fechaVencimiento <= limiteISO,
        );
        return {
          _id: caso._id,
          numeroCaso: caso.numeroCaso,
          damnificadoNombre: damnificado?.nombre ?? "",
          tipoSiniestro: caso.tipoSiniestro,
          etapa: caso.etapa,
          prioridad: caso.prioridad,
          // El más próximo (plazos[0]) para la columna; sin filtrar por avisado.
          vencimiento: plazos[0]?.fechaVencimiento ?? null,
          inminente,
          creadoEn: caso._creationTime,
        };
      }),
    );

    filas.sort((a, b) => {
      const p = ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad];
      if (p !== 0) return p;
      if (a.vencimiento && b.vencimiento) {
        return a.vencimiento < b.vencimiento
          ? -1
          : a.vencimiento > b.vencimiento
            ? 1
            : 0;
      }
      if (a.vencimiento) return -1; // con vencimiento primero
      if (b.vencimiento) return 1; // sin vencimiento, al final
      return 0;
    });

    return filas;
  },
});

/**
 * Casos CERRADOS del agente autenticado (histórico, REC-66). Espejo reducido de
 * `listMine`: mismo índice `by_agente` pero con `cerrado=true`. Sin
 * vencimiento/prioridad (no aplican a cerrados); proyecta el resultado del
 * cierre y la fecha de cierre, y ordena por `cerradoEn` desc (más reciente
 * primero). Los casos cerrados antes de REC-66 (sin `cerradoEn`) caen a
 * `_creationTime`.
 */
export const listClosed = query({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }
    const agenteId = resolved.agente._id;

    const casos = await ctx.db
      .query("casos")
      .withIndex("by_agente", (q) =>
        q.eq("agenteId", agenteId).eq("cerrado", true),
      )
      .collect();

    const filas = await Promise.all(
      casos.map(async (caso) => {
        const damnificado = await ctx.db.get(caso.damnificadoId);
        return {
          _id: caso._id,
          numeroCaso: caso.numeroCaso,
          damnificadoNombre: damnificado?.nombre ?? "",
          tipoSiniestro: caso.tipoSiniestro,
          resultadoCierre: caso.resultadoCierre ?? null,
          cerradoEn: caso.cerradoEn ?? caso._creationTime,
          creadoEn: caso._creationTime,
        };
      }),
    );

    // Orden por fecha de cierre, más reciente primero.
    filas.sort((a, b) => b.cerradoEn - a.cerradoEn);
    return filas;
  },
});

/**
 * Ficha de un caso, con validación de **ownership** (REC-20).
 * Contrato único: devuelve `null` tanto si el caso no existe como si no
 * pertenece al que llama (no filtra la existencia de casos ajenos).
 *
 * Enriquece el caso con lo que muestra la ficha —damnificado, relato,
 * documentos, pedidos y plazos— TODO leído **después** de confirmar ownership,
 * por índice (orden determinístico, sin `.sort()` en JS) y en paralelo. Es
 * dual-rol: el dueño (agente o damnificado) ve estos datos de su propio caso.
 *
 * Proyecciones (nunca se filtra al cliente más de lo necesario):
 *  - damnificado: sólo `{ _id, nombre, email, telefono }` (SIN `invitacionToken`
 *    —credencial de activación— ni flags de cuenta).
 *  - documentos: SIN `storageId` (interno de File Storage).
 *  - opcionales normalizados a `null` (que la UI no mezcle `undefined`/`null`).
 */
export const get = query({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved) return null;

    const caso = await ctx.db.get(casoId);
    if (!caso) return null;

    const esDueño =
      resolved.rol === "agente"
        ? caso.agenteId === resolved.agente._id
        : caso.damnificadoId === resolved.damnificado._id;
    if (!esDueño) return null;

    // Enriquecimiento — SÓLO tras confirmar ownership. Todas las lecturas van
    // por índice (`by_caso` / `by_caso_fecha`), en paralelo; el orden lo da el
    // propio índice: documentos/pedidos por `_creationTime` asc, plazos por
    // `fechaVencimiento` asc.
    const [damnificadoDoc, relatoDoc, documentos, pedidos, plazos] =
      await Promise.all([
        ctx.db.get(caso.damnificadoId),
        ctx.db
          .query("relatosSiniestro")
          .withIndex("by_caso", (q) => q.eq("casoId", casoId))
          .first(),
        ctx.db
          .query("documentos")
          .withIndex("by_caso", (q) => q.eq("casoId", casoId))
          .collect(),
        ctx.db
          .query("pedidosDocumentacion")
          .withIndex("by_caso", (q) => q.eq("casoId", casoId))
          .collect(),
        ctx.db
          .query("plazos")
          .withIndex("by_caso_fecha", (q) => q.eq("casoId", casoId))
          .collect(),
      ]);

    return {
      ...caso,
      damnificado: damnificadoDoc && {
        _id: damnificadoDoc._id,
        nombre: damnificadoDoc.nombre,
        email: damnificadoDoc.email,
        telefono: damnificadoDoc.telefono,
      },
      relato: relatoDoc && {
        respuestas: relatoDoc.respuestas,
        completo: relatoDoc.completo,
        completadoEn: relatoDoc.completadoEn ?? null,
      },
      documentos: documentos.map((d) => ({
        _id: d._id,
        nombreArchivo: d.nombreArchivo,
        subidoPor: d.subidoPor,
        tipoMime: d.tipoMime ?? null,
        tamanoBytes: d.tamanoBytes ?? null,
        url: d.url ?? null,
        creadoEn: d._creationTime,
      })),
      pedidos: pedidos.map((p) => ({
        _id: p._id,
        descripcion: p.descripcion,
        respondido: p.respondido,
        respondidoEn: p.respondidoEn ?? null,
        creadoEn: p._creationTime,
      })),
      plazos: plazos.map((p) => ({
        _id: p._id,
        descripcion: p.descripcion,
        fechaVencimiento: p.fechaVencimiento,
        avisadoAlAgente: p.avisadoAlAgente,
        creadoEn: p._creationTime,
      })),
    };
  },
});

/**
 * Hub "Mi caso" del damnificado (REC-27). Resuelve el caso DESDE la sesión (no
 * recibe `casoId`) y devuelve SÓLO lo que muestra el hub, en proyección
 * estricta: nunca se expone `agenteId`, `prioridad`, `tipoSiniestro`,
 * `aseguradora` ni `storageId` (ver "Lo que NO muestra" del issue). Por eso NO
 * se hace `...caso`: se listan los campos permitidos uno por uno.
 *
 * Fail-closed: sin sesión de damnificado → `null`. Si el damnificado no tiene
 * caso → `null`. Si tuviera más de uno (no pasa en el MVP), se toma el más
 * reciente (`by_damnificado` + `order desc`); los cerrados también se muestran
 * (estado final resuelto/rechazado/apelación).
 */
export const miCaso = query({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") return null;

    const caso = await ctx.db
      .query("casos")
      .withIndex("by_damnificado", (q) =>
        q.eq("damnificadoId", resolved.damnificado._id),
      )
      .order("desc") // más reciente por `_creationTime`
      .first();
    if (!caso) return null;

    // Enriquecimiento SÓLO tras tener el caso, por índice y en paralelo (igual
    // que `casos.get`). `novedades`: las 3 más recientes del damnificado.
    const [relato, pedidos, novedades] = await Promise.all([
      ctx.db
        .query("relatosSiniestro")
        .withIndex("by_caso", (q) => q.eq("casoId", caso._id))
        .first(),
      ctx.db
        .query("pedidosDocumentacion")
        .withIndex("by_caso", (q) => q.eq("casoId", caso._id))
        .collect(),
      ctx.db
        .query("notificaciones")
        .withIndex("by_caso_destinatario", (q) =>
          q.eq("casoId", caso._id).eq("destinatario", "DAMNIFICADO"),
        )
        .order("desc")
        .take(3),
    ]);

    return {
      // Proyección estricta (NO `...caso`): sólo lo que el hub necesita.
      caso: {
        _id: caso._id,
        numeroCaso: caso.numeroCaso,
        etapa: caso.etapa,
        cerrado: caso.cerrado,
        resultadoCierre: caso.resultadoCierre ?? null,
      },
      nombre: resolved.damnificado.nombre,
      relato: relato ? { completo: relato.completo } : null,
      pedidosPendientes: pedidos
        .filter((p) => !p.respondido)
        .map((p) => ({ _id: p._id, descripcion: p.descripcion })),
      novedades: novedades.map((n) => ({
        _id: n._id,
        motivo: n.motivo,
        creadoEn: n._creationTime,
        visto: n.visto,
      })),
    };
  },
});

/**
 * Genera el numeroCaso legible `SIN-AAAA-NNNNN` (correlativo del año).
 * Helper compartido por el alta (REC-19) y el seed. Para producción conviene
 * un contador atómico dedicado.
 */
export async function generarNumeroCaso(
  ctx: MutationCtx,
  anio: number,
): Promise<string> {
  const delAnio = await ctx.db
    .query("casos")
    .withIndex("by_numeroCaso", (q) =>
      q.gte("numeroCaso", `SIN-${anio}-`).lt("numeroCaso", `SIN-${anio}-999999`),
    )
    .collect();
  const correlativo = String(delAnio.length + 1).padStart(5, "0");
  return `SIN-${anio}-${correlativo}`;
}

/**
 * Alta pública de un caso (REC-19) — el punto de entrada de todos los datos.
 *
 * Contrato transaccional: crea o reusa el damnificado por email, genera y
 * PERSISTE el `invitacionToken` cuando corresponde, da de alta el caso en
 * etapa NUEVO y la notificación CASO_ABIERTO — TODO en esta única transacción
 * (atómica: si algo lanza, rollback completo). La ENTREGA de la invitación se
 * agenda con `scheduler.runAfter` (se encola sólo si la mutation commitea); el
 * email real es REC-65 (ver `invitaciones.enviarInvitacion`).
 *
 * Seguridad (regla del módulo): la identidad del agente se DERIVA de la sesión
 * con `resolveRole`; nunca se acepta `agenteId` del cliente. Los errores de
 * formulario/negocio usan `ConvexError` (mensaje legible en el cliente);
 * `Error` queda sólo para el guard de sesión.
 */
export const crear = mutation({
  args: {
    nombre: v.string(),
    email: v.string(),
    telefono: v.string(),
    tipoSiniestro,
    aseguradora: v.string(),
    prioridad: v.optional(prioridad),
  },
  handler: async (ctx, args) => {
    // 1) Autorización: sólo un agente autenticado (guard → Error, no es de formulario).
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }
    const agenteId = resolved.agente._id;

    // 2) Validación de campos (defensa server; la UI también valida).
    const nombre = args.nombre.trim();
    const telefono = args.telefono.trim();
    const aseguradora = args.aseguradora.trim();
    const email = normalizeEmail(args.email);
    if (!nombre) throw new ConvexError("Ingresá el nombre del damnificado.");
    if (!telefono) throw new ConvexError("Ingresá un teléfono de contacto.");
    if (!aseguradora) throw new ConvexError("Indicá la aseguradora involucrada.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Ingresá un email válido (ej: nombre@dominio.com).");
    }

    // 3) Resolver el damnificado por email, respetando la unicidad global de
    //    email entre `agentes` y `damnificados` (invariante de `resolveRole`).
    const [agentesMatch, damnificadosMatch] = await Promise.all([
      ctx.db
        .query("agentes")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(1),
      ctx.db
        .query("damnificados")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(2), // take(2): detecta un duplicado intra-tabla (no debería pasar)
    ]);
    if (agentesMatch.length > 0) {
      throw new ConvexError("Ese email ya pertenece a un agente.");
    }
    if (damnificadosMatch.length > 1) {
      throw new ConvexError(
        "Conflicto de cuenta: el email no es único entre damnificados.",
      );
    }

    const existente = damnificadosMatch[0];
    let damnificadoId: Id<"damnificados">;
    let invitar: boolean;
    let token: string | undefined;
    if (!existente) {
      // (a) No existe → crear con token e invitar.
      token = crypto.randomUUID();
      damnificadoId = await ctx.db.insert("damnificados", {
        nombre,
        email,
        telefono,
        invitacionToken: token,
        invitacionEnviadaEn: Date.now(),
        cuentaActivada: false,
        onboardingCompletado: false,
      });
      invitar = true;
    } else if (!existente.cuentaActivada) {
      // (b) Existe y sin activar → reusar y regenerar token (invalida de facto
      //     el anterior: el link viejo deja de resolver) para reenviar la invitación.
      token = crypto.randomUUID();
      await ctx.db.patch(existente._id, {
        invitacionToken: token,
        invitacionEnviadaEn: Date.now(),
      });
      damnificadoId = existente._id;
      invitar = true;
    } else {
      // (c) Existe y ya activado → reusar; NO regenerar token, NO invitar.
      damnificadoId = existente._id;
      invitar = false;
    }

    // 4) Alta del caso. `generarNumeroCaso` corre INLINE acá, dentro de esta
    //    mutation e inmediatamente antes del insert: no moverlo a una action ni
    //    a un helper externo no transaccional (la unicidad del correlativo se
    //    apoya en el aislamiento serializable / reintentos por OCC de Convex).
    const numeroCaso = await generarNumeroCaso(ctx, new Date().getFullYear());
    const casoId = await ctx.db.insert("casos", {
      numeroCaso,
      damnificadoId,
      agenteId,
      tipoSiniestro: args.tipoSiniestro,
      aseguradora,
      etapa: "NUEVO",
      prioridad: args.prioridad ?? "MEDIA",
      cerrado: false,
    });

    // 5) Notificación de "caso abierto" para el damnificado. El registro se
    //    crea siempre; el EMAIL depende de si además va una invitación:
    if (invitar && token) {
      // (a/b) Damnificado nuevo o sin activar: registramos la novedad pero NO
      //       mandamos el email de "caso abierto" — la invitación (abajo) ya le
      //       anuncia el caso y le da acceso. Evita el doble mail casi idéntico.
      await ctx.db.insert("notificaciones", {
        destinatario: "DAMNIFICADO",
        casoId,
        motivo: "CASO_ABIERTO",
        visto: false,
      });
      await ctx.scheduler.runAfter(0, internal.invitaciones.enviarInvitacion, {
        email,
        token,
      });
    } else {
      // (c) Damnificado con cuenta ya activada (p. ej. su segundo caso): no hay
      //     invitación, así que acá SÍ va el email de "tu caso fue abierto"
      //     (antes este escenario no enviaba nada — bug que REC-28 corrige).
      await crearNotificacion(ctx, {
        casoId,
        destinatario: "DAMNIFICADO",
        email,
        datos: { motivo: "CASO_ABIERTO" },
      });
    }

    return { casoId, numeroCaso, email, invitacionEnviada: invitar };
  },
});

/**
 * Alta de un caso — **internal** (usada por el seed). La versión pública con
 * identidad de sesión + invitación por email es `crear` (arriba, REC-19).
 */
export const crearInterno = internalMutation({
  args: {
    damnificadoId: v.id("damnificados"),
    agenteId: v.id("agentes"),
    tipoSiniestro,
    aseguradora: v.string(),
    prioridad: v.optional(prioridad),
  },
  handler: async (ctx, args) => {
    const numeroCaso = await generarNumeroCaso(ctx, new Date().getFullYear());
    return ctx.db.insert("casos", {
      numeroCaso,
      damnificadoId: args.damnificadoId,
      agenteId: args.agenteId,
      tipoSiniestro: args.tipoSiniestro,
      aseguradora: args.aseguradora,
      etapa: "NUEVO",
      prioridad: args.prioridad ?? "MEDIA",
      cerrado: false,
    });
  },
});

/**
 * Avanza el caso a la etapa inmediata siguiente del pipeline (REC-21).
 *
 * Reglas del issue: sólo el agente **dueño**; un único paso **hacia adelante**
 * (nunca retrocede ni saltea); se detiene en `EN_NEGOCIACION` — llegar a
 * `CERRADO` (con resultado) es la pantalla Cerrar caso (REC-30), no este botón.
 * Cada avance registra una notificación `AVANCE_ETAPA` para el damnificado (el
 * envío por email es el motor de notificaciones, REC-28).
 *
 * `etapaActual` (concurrencia optimista): el cliente manda la etapa que el
 * agente vio al confirmar; si el caso ya cambió de etapa, se rechaza. Bajo el
 * aislamiento serializable de Convex, un doble submit (o una ficha
 * desactualizada) no avanza dos pasos ni duplica la notificación.
 */
export const avanzarEtapa = mutation({
  args: { casoId: v.id("casos"), etapaActual: etapa },
  handler: async (ctx, { casoId, etapaActual }) => {
    // Auth: sólo agente autenticado (guard de sesión, no de formulario).
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }
    // Ownership fail-closed (mismo mensaje para inexistente y ajeno).
    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) {
      throw new Error("No autorizado: el caso no existe o no es tuyo.");
    }
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no se puede avanzar de etapa.");
    }
    // Concurrencia optimista: sólo aplica sobre la etapa que el agente confirmó.
    if (caso.etapa !== etapaActual) {
      throw new ConvexError(
        "La etapa del caso cambió. Actualizá la ficha e intentá de nuevo.",
      );
    }
    const idx = ORDEN_ETAPAS.indexOf(caso.etapa);
    if (idx < 0) {
      throw new Error("Estado inconsistente: etapa desconocida.");
    }
    if (idx >= IDX_EN_NEGOCIACION) {
      throw new ConvexError(
        "El caso está en la última etapa antes del cierre; para finalizarlo usá “Cerrar caso”.",
      );
    }
    const siguiente = ORDEN_ETAPAS[idx + 1];
    // Cargar el damnificado ANTES de escribir (para el email; patrón del
    // módulo). Si faltara, abortamos sin avanzar la etapa.
    const damnificado = await ctx.db.get(caso.damnificadoId);
    if (!damnificado) {
      throw new Error("Estado inconsistente: el caso no tiene damnificado.");
    }
    // 1) Avanzar la etapa.
    await ctx.db.patch(casoId, { etapa: siguiente });
    // 2) Notificación + email al damnificado. El email lleva la etapa NUEVA
    //    (`siguiente`), que es la que el damnificado tiene que ver.
    await crearNotificacion(ctx, {
      casoId,
      destinatario: "DAMNIFICADO",
      email: damnificado.email,
      datos: { motivo: "AVANCE_ETAPA", etapa: siguiente },
    });
    return { etapa: siguiente };
  },
});

/**
 * Cambia la prioridad del caso (REC-37). Acción del agente sobre la ficha; se
 * guarda al instante (la live query de `get` refleja el cambio sin recargar).
 *
 * Espeja los guards de `avanzarEtapa`: identidad y pertenencia se DERIVAN de la
 * sesión (nunca del cliente); `Error` para sesión/pertenencia, `ConvexError`
 * para negocio. No genera notificación: la prioridad es interna del agente y el
 * damnificado está excluido del campo (REC-35). Set de valor absoluto → no
 * necesita concurrencia optimista; idempotente (no escribe si no cambió).
 */
export const cambiarPrioridad = mutation({
  args: { casoId: v.id("casos"), prioridad },
  handler: async (ctx, { casoId, prioridad: nueva }) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }
    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) {
      throw new Error("No autorizado: el caso no existe o no es tuyo.");
    }
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no se puede cambiar la prioridad.");
    }
    if (caso.prioridad !== nueva) {
      await ctx.db.patch(casoId, { prioridad: nueva });
    }
    return { prioridad: nueva };
  },
});

/**
 * Cierra el caso con su resultado final (REC-30). Última acción del ciclo de
 * vida del reclamo: `avanzarEtapa` se detiene en EN_NEGOCIACION y el paso a
 * CERRADO (con resultado) es esta pantalla.
 *
 * Espeja `avanzarEtapa`: identidad y pertenencia se DERIVAN de la sesión; `Error`
 * para guards de sesión/pertenencia/estado, `ConvexError` para negocio legible.
 * Se puede cerrar desde CUALQUIER etapa abierta (un rechazo/apelación puede
 * llegar temprano); lo único que se exige es que el caso no esté ya cerrado.
 *
 * ORDEN (fijo): auth → pertenencia → idempotencia → cargar damnificado ANTES de
 * escribir → patch → notificación → scheduler email → return.
 */
export const cerrar = mutation({
  args: { casoId: v.id("casos"), resultadoCierre },
  handler: async (ctx, { casoId, resultadoCierre: resultado }) => {
    // 1) Autorización: sólo un agente autenticado.
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }
    // 2) Pertenencia fail-closed (mismo mensaje para inexistente y ajeno).
    const caso = await ctx.db.get(casoId);
    if (!caso || caso.agenteId !== resolved.agente._id) {
      throw new Error("No autorizado: el caso no existe o no es tuyo.");
    }
    // 3) Idempotencia: no re-cerrar (evita doble notificación/email).
    if (caso.cerrado) {
      throw new ConvexError("Este caso ya está cerrado.");
    }
    // 4) Cargar el damnificado ANTES de escribir (para el email); si faltara
    //    (dato inconsistente), abortamos sin dejar el caso a medio cerrar.
    const damnificado = await ctx.db.get(caso.damnificadoId);
    if (!damnificado) {
      throw new Error("Estado inconsistente: el caso no tiene damnificado.");
    }
    // 5) Cerrar: resultado + etapa final. Sale de la lista de activos (índice
    //    `by_agente` por `cerrado`), pero el caso NO se borra (historial/métricas).
    await ctx.db.patch(casoId, {
      cerrado: true,
      resultadoCierre: resultado,
      etapa: "CERRADO",
      cerradoEn: Date.now(),
    });
    // 6) Notificación + email de cierre al damnificado. El texto por resultado
    //    (RESUELTO/RECHAZADO/EN_APELACION) lo arma el motor (`notificaciones`).
    await crearNotificacion(ctx, {
      casoId,
      destinatario: "DAMNIFICADO",
      email: damnificado.email,
      datos: { motivo: "CASO_CERRADO", resultadoCierre: resultado },
    });
    return { ok: true };
  },
});
