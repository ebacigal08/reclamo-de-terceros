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

// `agente@amparo.ar` es la credencial de LOGIN de la demo, y NO es una dirección real:
// Resend la tiene en su lista de supresión (rebotó). Se mantiene como identidad para no
// romper la credencial documentada.
//
// ⚠️ Acá había un comentario que decía que esto "no hace daño (suprimido = ni se
// intenta)". ERA FALSO, y salió caro (REC-73): en producción el agente pasó meses sin
// recibir NINGÚN aviso —plazo por vencer, pedido respondido, chat— y el sistema los
// daba por avisados. El cron llegó a marcar plazos como `avisadoAlAgente: true` con el
// email muriendo en la supresión: el estado decía "avisado" y el agente nunca se enteró.
//
// Por eso el destino de los avisos ahora es un campo aparte (`agentes.emailNotificaciones`,
// ver `emailDeAvisos` en lib.ts): la identidad puede seguir siendo falsa, pero los avisos
// van a una casilla que existe.
const EMAIL_AGENTE = process.env.SEED_AGENT_EMAIL ?? "agente@amparo.ar";
// Casilla REAL donde el agente demo recibe los avisos. Opcional, pero conviene setearla
// en cualquier deployment que mande emails de verdad: sin ella, cada aviso al agente es
// un rebote más contra un dominio suprimido — y esos rebotes le pegan a la reputación
// del MISMO dominio remitente que usa producción para invitaciones y resets.
const EMAIL_AVISOS_AGENTE = process.env.SEED_AGENT_NOTIF_EMAIL;
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
      // Ausente ⇒ los avisos van a `email` (que en la demo es la casilla suprimida).
      emailNotificaciones: EMAIL_AVISOS_AGENTE
        ? normalizeEmail(EMAIL_AVISOS_AGENTE)
        : undefined,
    });

    // Alias `+` de una casilla REAL, no `@example.com`.
    //
    // Antes eran `@example.com`, que es un dominio reservado SIN registros MX: todo
    // correo que se le manda REBOTA (hard bounce) y ensucia la reputación del dominio
    // remitente. Con el MVP casi no se notaba —los datos demo generaban un email
    // suelto—, pero el chat (REC-34) manda un aviso por cada tanda de mensajes: basta
    // con demostrar la app sobre un caso demo para disparar rebotes sin enterarse.
    //
    // Los alias `+` van todos a la misma casilla y son direcciones válidas, así que
    // la demo entrega de verdad y se puede ver el correo que le llega al damnificado.
    const damnificadosDemo = [
      { nombre: "Marta Coledani", email: "tote08+marta@gmail.com", telefono: "11-5555-0001" },
      { nombre: "Mónica Alsina", email: "tote08+monica@gmail.com", telefono: "11-5555-0002" },
      { nombre: "Hernán Ríos", email: "tote08+hernan@gmail.com", telefono: "11-5555-0003" },
      { nombre: "Rubén Ferreyra", email: "tote08+ruben@gmail.com", telefono: "11-5555-0004" },
      { nombre: "Patricia Vega", email: "tote08+patricia@gmail.com", telefono: "11-5555-0005" },
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
