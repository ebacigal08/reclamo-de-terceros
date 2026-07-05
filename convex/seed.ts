import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { normalizeEmail } from "./lib";
import { generarNumeroCaso } from "./casos";

/**
 * Seed de datos DEMO para desarrollo (REC-17 / REC-18).
 *
 * ⚠️ Sólo dev, nunca prod. Se corre a mano:
 *   npx convex run seed:seedDemo
 * y requiere, en el env del deployment, AMBAS:
 *   SEED_ENABLED=true  Y  DEPLOYMENT_ENV=dev
 * (así un SEED_ENABLED habilitado por error en prod igual aborta).
 *
 * La contraseña demo es un dato de DESARROLLO, no un secreto productivo.
 */

const EMAIL_AGENTE = "agente@amparo.ar";
const NOMBRE_AGENTE = "María Gómez";

type DominioResumen = {
  agentes: number;
  damnificados: number;
  casos: number;
  plazos: number;
};
type SeedResult =
  | { status: "skip"; motivo: string }
  | ({ status: "ok" } & DominioResumen);

/** ISO YYYY-MM-DD a `dias` de hoy (negativo = pasado). */
function isoEnDias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Honra el invariante de unicidad global de email entre las dos tablas. */
async function assertEmailLibreEn(
  ctx: MutationCtx,
  tabla: "agentes" | "damnificados",
  email: string,
) {
  const otra = tabla === "agentes" ? "damnificados" : "agentes";
  const enOtra = await ctx.db
    .query(otra)
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (enOtra) {
    // Sin PII: no incluimos el email en el mensaje.
    throw new Error(
      `Conflicto de unicidad: el email ya existe en ${otra}.`,
    );
  }
}

export const seedDemo = internalAction({
  args: {},
  // Tipo de retorno explícito: rompe la inferencia circular de `internal.seed`.
  handler: async (ctx): Promise<SeedResult> => {
    if (
      process.env.SEED_ENABLED !== "true" ||
      process.env.DEPLOYMENT_ENV !== "dev"
    ) {
      throw new Error(
        "seedDemo bloqueado: requiere SEED_ENABLED=true Y DEPLOYMENT_ENV=dev en el env del deployment.",
      );
    }

    const email = normalizeEmail(EMAIL_AGENTE);

    // Idempotencia: si el agente demo ya está, no hacemos nada.
    if (await ctx.runQuery(internal.seed.agenteExiste, { email })) {
      return { status: "skip", motivo: "el agente demo ya existe" };
    }

    // Cuenta Password: crear SÓLO si no existe ya (idempotente ante corridas
    // a medias). No usamos try/catch: si createAccount falla por config/env/
    // provider, el error se propaga y NO seguimos insertando dominio con una
    // cuenta de auth rota (login demo inservible).
    const password = process.env.SEED_AGENT_PASSWORD ?? "reclamo2026";
    if (!(await ctx.runQuery(internal.seed.authAccountExiste, { email }))) {
      await createAccount(ctx, {
        provider: "password",
        account: { id: email, secret: password },
        profile: { email, name: NOMBRE_AGENTE },
      });
    }

    const res: DominioResumen = await ctx.runMutation(
      internal.seed.insertarDominioDemo,
      { email },
    );
    return { status: "ok", ...res };
  },
});

export const agenteExiste = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const a = await ctx.db
      .query("agentes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    return a !== null;
  },
});

/** ¿Existe ya la cuenta Password (authAccounts) para este email? */
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

export const insertarDominioDemo = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<DominioResumen> => {
    await assertEmailLibreEn(ctx, "agentes", email);
    const agenteId = await ctx.db.insert("agentes", {
      nombre: NOMBRE_AGENTE,
      email,
    });

    const damnificadosDemo = [
      { nombre: "Marta Coledani", email: "marta.coledani@example.com", telefono: "11-5555-0001" },
      { nombre: "Mónica Alsina", email: "monica.alsina@example.com", telefono: "11-5555-0002" },
      { nombre: "Hernán Ríos", email: "hernan.rios@example.com", telefono: "11-5555-0003" },
      { nombre: "Rubén Ferreyra", email: "ruben.ferreyra@example.com", telefono: "11-5555-0004" },
      { nombre: "Patricia Vega", email: "patricia.vega@example.com", telefono: "11-5555-0005" },
    ];
    const damnificadoIds = [];
    for (const d of damnificadosDemo) {
      const em = normalizeEmail(d.email);
      await assertEmailLibreEn(ctx, "damnificados", em);
      damnificadoIds.push(
        await ctx.db.insert("damnificados", {
          nombre: d.nombre,
          email: em,
          telefono: d.telefono,
          cuentaActivada: false,
          onboardingCompletado: false,
        }),
      );
    }

    const anio = new Date().getFullYear();
    const casosDemo = [
      { dam: 0, tipo: "ACCIDENTE", aseg: "La Segunda", etapa: "EN_NEGOCIACION", prioridad: "ALTA", vencDias: 2 },
      { dam: 1, tipo: "ACCIDENTE", aseg: "Sancor Seguros", etapa: "EXPEDIENTE_EN_ARMADO", prioridad: "ALTA", vencDias: -1 },
      { dam: 2, tipo: "ROBO", aseg: "Federación Patronal", etapa: "EXPEDIENTE_EN_ARMADO", prioridad: "MEDIA", vencDias: 6 },
      { dam: 3, tipo: "ROBO", aseg: "Rivadavia Seguros", etapa: "PRESENTADO_A_ASEGURADORA", prioridad: "MEDIA", vencDias: null },
      { dam: 4, tipo: "INUNDACION", aseg: "Mercantil Andina", etapa: "NUEVO", prioridad: "BAJA", vencDias: null },
    ] as const;

    let plazos = 0;
    for (const c of casosDemo) {
      const numeroCaso = await generarNumeroCaso(ctx, anio);
      const casoId = await ctx.db.insert("casos", {
        numeroCaso,
        damnificadoId: damnificadoIds[c.dam],
        agenteId,
        tipoSiniestro: c.tipo,
        aseguradora: c.aseg,
        etapa: c.etapa,
        prioridad: c.prioridad,
        cerrado: false,
      });
      if (c.vencDias !== null) {
        await ctx.db.insert("plazos", {
          casoId,
          descripcion: "Vencimiento de presentación ante la aseguradora",
          fechaVencimiento: isoEnDias(c.vencDias),
          avisadoAlAgente: false,
        });
        plazos++;
      }
    }

    return {
      agentes: 1,
      damnificados: damnificadoIds.length,
      casos: casosDemo.length,
      plazos,
    };
  },
});
