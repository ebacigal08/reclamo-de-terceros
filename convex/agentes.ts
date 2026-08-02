import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { RolAgente } from "./lib";
import {
  normalizeEmail,
  emailDeAvisos,
  rolDeAgente,
  esAdmin,
  esAgenteActivo,
} from "./lib";

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

/**
 * REC-91 · Rol y estado de un agente. Idempotente.
 *
 * Es la escotilla por CLI, y hoy es la única forma de que exista el primer
 * `admin` del estudio: el rol se deriva y su default es `"agente"`, así que sin
 * esta llamada nadie puede administrar usuarios y la sección Usuarios (REC-94)
 * nace inoperable para todos. Después de REC-94 sigue existiendo como escotilla
 * de emergencia —revivir al admin que se desactivó a sí mismo, por ejemplo—,
 * igual que `configurarEmailNotificaciones`.
 *
 * Convención de argumentos, calcada de la de arriba:
 *
 *   omitido  → NO se toca
 *   `null`   → BORRA el campo (vuelve al default derivado: "agente" / activo)
 *   valor    → lo setea
 *
 * Los dos omitidos LANZA. Una llamada que no hace nada y devuelve éxito es la
 * forma más barata de creer que promoviste a alguien.
 *
 *   npx convex run agentes:configurarRol \
 *     '{"emailAgente":"agente@amparo.ar","rol":"admin"}' --deployment <deployment>
 *
 * NO toca `email` (la identidad) ni las credenciales: desactivar a alguien deja
 * su cuenta Auth y su contraseña intactas, que es lo que permite reactivarlo sin
 * re-invitarlo. Quien le cierra la puerta es `resolveRole` (users.ts), que hace
 * fail-closed ante `activo: false`.
 */
export const configurarRol = internalMutation({
  args: {
    emailAgente: v.string(),
    rol: v.optional(
      v.union(v.literal("admin"), v.literal("agente"), v.null()),
    ),
    activo: v.optional(v.union(v.boolean(), v.null())),
  },
  handler: async (ctx, { emailAgente, rol, activo }) => {
    if (rol === undefined && activo === undefined) {
      throw new ConvexError(
        "No pasaste ni `rol` ni `activo`: la llamada no haría nada. Para devolver un campo a su default, pasá `null`.",
      );
    }

    const identidad = normalizeEmail(emailAgente);
    const agente = await ctx.db
      .query("agentes")
      .withIndex("by_email", (q) => q.eq("email", identidad))
      .unique();

    if (!agente) {
      throw new ConvexError(`No hay ningún agente con el email ${identidad}.`);
    }

    const antes = { rol: rolDeAgente(agente), activo: esAgenteActivo(agente) };

    // `undefined` en un patch BORRA el campo en Convex (no lo deja en null); una
    // clave ausente lo deja como está. Por eso el objeto se arma condicionalmente
    // en vez de pasar los dos argumentos siempre.
    const cambios: { rol?: RolAgente; activo?: boolean } = {};
    if (rol !== undefined) cambios.rol = rol ?? undefined;
    if (activo !== undefined) cambios.activo = activo ?? undefined;
    await ctx.db.patch(agente._id, cambios);

    const post = await ctx.db.get(agente._id);
    if (!post) {
      throw new ConvexError(`El agente ${identidad} desapareció durante el cambio.`);
    }

    // El conteo se lee DESPUÉS del patch y en la misma transacción, así que ya
    // incluye este cambio: es el número contra el que se verifica el bootstrap
    // sin tener que correr `auditarRoles` a continuación.
    const todos = await ctx.db.query("agentes").collect();

    return {
      agente: agente.nombre,
      identidad: agente.email, // sin cambios: el login no se toca
      antes,
      ahora: { rol: rolDeAgente(post), activo: esAgenteActivo(post) },
      adminsActivos: todos.filter((a) => esAdmin(a) && esAgenteActivo(a)).length,
    };
  },
});

/**
 * REC-91 · Foto del rol y el estado de TODOS los agentes. Sólo lee.
 *
 * Existe para que el bootstrap del primer admin sea verificable y no un acto de
 * fe: `adminsActivos` es literalmente el criterio de aceptación del ticket, y el
 * control obligatorio es correrla ANTES de promover a nadie y ver un **cero**.
 * Sin ese control, "hay un admin" podría ser cierto por accidente.
 *
 *   npx convex run agentes:auditarRoles --deployment <deployment>
 *
 * `rolExplicito` / `activoExplicito` distinguen el valor GUARDADO del default
 * DERIVADO, que es la única forma de leer la salida sin ambigüedad: una fila
 * anterior a REC-91 dice `rol: "agente"` igual que una degradada a propósito.
 */
export const auditarRoles = internalQuery({
  args: {},
  handler: async (ctx) => {
    // `.collect()` sin índice: la tabla tiene unidades de filas y esto corre a
    // mano por CLI, nunca en el camino caliente.
    const agentes = await ctx.db.query("agentes").collect();

    const filas = agentes.map((a) => ({
      nombre: a.nombre,
      email: a.email,
      rol: rolDeAgente(a),
      activo: esAgenteActivo(a),
      rolExplicito: a.rol !== undefined,
      activoExplicito: a.activo !== undefined,
    }));

    return {
      total: filas.length,
      adminsActivos: filas.filter((f) => f.rol === "admin" && f.activo).length,
      agentes: filas,
    };
  },
});
