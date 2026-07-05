import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Funciones del Caso — ejemplo inicial para arrancar a construir las pantallas.
 * Ampliar según se implementen REC-18 (lista), REC-19 (alta), REC-20 (ficha),
 * REC-21 (pipeline), REC-30 (cierre), REC-35/37/38 (prioridad).
 *
 * NOTA: la carpeta `_generated/` la crea `npx convex dev`. Hasta correrlo por
 * primera vez, los imports de `./_generated/*` van a marcar error de tipos.
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

/** Lista los casos activos de un agente (REC-18). */
export const listByAgente = query({
  args: { agenteId: v.id("agentes") },
  handler: async (ctx, { agenteId }) => {
    const casos = await ctx.db
      .query("casos")
      .withIndex("by_agente", (q) =>
        q.eq("agenteId", agenteId).eq("cerrado", false),
      )
      .collect();

    // Enriquecemos con el nombre del damnificado para la lista.
    return Promise.all(
      casos.map(async (caso) => {
        const damnificado = await ctx.db.get(caso.damnificadoId);
        return { ...caso, damnificadoNombre: damnificado?.nombre ?? "" };
      }),
    );
  },
});

/** Ficha completa de un caso (REC-20). */
export const get = query({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const caso = await ctx.db.get(casoId);
    if (!caso) return null;
    const damnificado = await ctx.db.get(caso.damnificadoId);
    return { ...caso, damnificado };
  },
});

/**
 * Da de alta un caso (REC-19). Genera el numeroCaso legible SIN-AAAA-NNNNN.
 * TODO: enviar la invitación por email al damnificado (REC-17) y crear la
 * notificación CASO_ABIERTO (REC-28) desde una action/mutation dedicada.
 */
export const crear = mutation({
  args: {
    damnificadoId: v.id("damnificados"),
    agenteId: v.id("agentes"),
    tipoSiniestro,
    aseguradora: v.string(),
    prioridad: v.optional(prioridad),
  },
  handler: async (ctx, args) => {
    const anio = new Date().getFullYear();
    // Correlativo simple del año. Para producción conviene un contador atómico.
    const delAnio = await ctx.db
      .query("casos")
      .withIndex("by_numeroCaso", (q) =>
        q.gte("numeroCaso", `SIN-${anio}-`).lt("numeroCaso", `SIN-${anio}-999999`),
      )
      .collect();
    const correlativo = String(delAnio.length + 1).padStart(5, "0");
    const numeroCaso = `SIN-${anio}-${correlativo}`;

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
