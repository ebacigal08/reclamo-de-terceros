import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { resolveRole } from "./users";

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
        q.eq("agenteId", agenteId).eq("cerrado", false),
      )
      .collect();

    const filas = await Promise.all(
      casos.map(async (caso) => {
        const damnificado = await ctx.db.get(caso.damnificadoId);
        // El índice by_caso_fecha viene ordenado por fechaVencimiento asc
        // (ISO YYYY-MM-DD = orden cronológico), así que .first() es el más próximo.
        const proximoPlazo = await ctx.db
          .query("plazos")
          .withIndex("by_caso_fecha", (q) => q.eq("casoId", caso._id))
          .first();
        return {
          _id: caso._id,
          numeroCaso: caso.numeroCaso,
          damnificadoNombre: damnificado?.nombre ?? "",
          tipoSiniestro: caso.tipoSiniestro,
          etapa: caso.etapa,
          prioridad: caso.prioridad,
          vencimiento: proximoPlazo?.fechaVencimiento ?? null,
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
 * Alta de un caso — **internal** por ahora (usada por el seed).
 * La versión pública, con identidad derivada de sesión + invitación por email,
 * es parte de REC-19 (Nuevo caso), fuera del alcance de esta entrega.
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
