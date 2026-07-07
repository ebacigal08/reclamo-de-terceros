import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { resolveRole } from "./users";
import { normalizeEmail } from "./lib";

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
 * Ficha de un caso, con validación de **ownership** (REC-20).
 * Contrato único: devuelve `null` tanto si el caso no existe como si no
 * pertenece al que llama (no filtra la existencia de casos ajenos).
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

    const damnificado = await ctx.db.get(caso.damnificadoId);
    return { ...caso, damnificado };
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

    // 5) Notificación para el damnificado (primera escritura de esta tabla).
    await ctx.db.insert("notificaciones", {
      destinatario: "DAMNIFICADO",
      casoId,
      motivo: "CASO_ABIERTO",
      visto: false,
    });

    // 6) Entrega de la invitación (sólo casos a/b): se encola atada al commit.
    if (invitar && token) {
      await ctx.scheduler.runAfter(0, internal.invitaciones.enviarInvitacion, {
        email,
        token,
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
