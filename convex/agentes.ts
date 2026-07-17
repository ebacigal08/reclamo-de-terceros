import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { normalizeEmail, emailDeAvisos } from "./lib";

/**
 * REC-73 · Administración del agente. Hoy sólo una cosa: a qué dirección se le
 * mandan los avisos por email.
 *
 * Por qué existe este módulo. El agente de producción es la identidad demo del
 * seed (`agente@amparo.ar`): una dirección que NO EXISTE, que rebotó, y que Resend
 * tiene en su lista de supresión. Resultado: durante meses ningún aviso al agente
 * se entregó —plazo por vencer, pedido respondido, chat— y nadie se enteró, porque
 * `sendEmail` es best-effort (nunca lanza) y Resend responde 200 aunque tire el
 * mensaje a la basura.
 *
 * Y no había CÓMO arreglarlo: no existe UI de perfil, y en todo el repo no hay un
 * solo `db.patch` sobre `agentes` (la tabla sólo se escribía desde el seed).
 *
 * Es `internalMutation` a propósito: no la expone el cliente, se corre con
 * `npx convex run`. Cambiar la casilla de avisos es una operación de administración,
 * no una feature del producto (cuando exista una pantalla de perfil, será su lugar).
 *
 *   npx convex run agentes:configurarEmailNotificaciones \
 *     '{"emailAgente":"agente@amparo.ar","emailNotificaciones":"casilla@real.com"}' \
 *     --deployment <deployment>
 *
 * OJO con el deployment de destino: a un deployment `dev` (como el que hoy sirve
 * producción) las funciones se publican con `convex dev --once`, NO con
 * `convex deploy` — ver docs/cutover-prod.md (REC-72).
 */

/**
 * Configura (o limpia) la dirección de avisos del agente. Idempotente.
 *
 * - `emailNotificaciones: "casilla@real.com"` → la setea (normalizada).
 * - `emailNotificaciones: null` → LIMPIA el campo; los avisos vuelven a ir a la
 *   dirección de identidad (el comportamiento histórico).
 *
 * La cadena vacía se RECHAZA: guardar `""` haría que el destino sea una dirección
 * inválida en vez de caer al default (para limpiar está `null`). `emailDeAvisos`
 * además se defiende de eso, pero una fila con basura adentro no debería existir.
 *
 * NO toca `email` (la identidad): cambiarla exigiría migrar en sincronía los tres
 * campos que la contienen (`authAccounts.providerAccountId` = login, `users.email`
 * + `agentes.email` = rol), y `resolveRole` es fail-closed → una desincronización
 * le cierra la app entera al agente.
 */
export const configurarEmailNotificaciones = internalMutation({
  args: {
    emailAgente: v.string(),
    // `null` = limpiar. Explícito, para que borrar el campo sea un acto deliberado
    // y no el efecto colateral de omitir un argumento.
    emailNotificaciones: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { emailAgente, emailNotificaciones }) => {
    const identidad = normalizeEmail(emailAgente);

    const agente = await ctx.db
      .query("agentes")
      .withIndex("by_email", (q) => q.eq("email", identidad))
      .unique();

    if (!agente) {
      throw new ConvexError(`No hay ningún agente con el email ${identidad}.`);
    }

    let destino: string | undefined;
    if (emailNotificaciones !== null) {
      destino = normalizeEmail(emailNotificaciones);
      if (!destino) {
        throw new ConvexError(
          "La dirección de avisos no puede estar vacía. Para limpiarla, pasá `null`.",
        );
      }
      if (!destino.includes("@")) {
        throw new ConvexError(`"${destino}" no parece una dirección de email.`);
      }
    }

    const antes = emailDeAvisos(agente);
    // `undefined` en un patch BORRA el campo en Convex (no lo deja en null).
    await ctx.db.patch(agente._id, { emailNotificaciones: destino });

    return {
      agente: agente.nombre,
      identidad: agente.email, // sin cambios: el login no se toca
      avisosAntes: antes,
      avisosAhora: destino ?? agente.email,
      limpiado: destino === undefined,
    };
  },
});
