import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { resolveRole } from "./users";

/**
 * Contactos: prospectos a contactar (REC-164).
 *
 * Mismo esqueleto que `cartera.ts`, cuya maquinaria de import ya está
 * auditada, y separado de ella a propósito. Son otras personas (ninguna está
 * en la cartera) y otras tablas, y comparten sólo la forma.
 *
 *   - La CARGA son `internalMutation`s que corre `scripts/importar-contactos.mjs`
 *     con `npx convex run`, detrás de una habilitación propia.
 *   - La LECTURA son dos `query` solo-agente para la sección Contactos.
 *   - `cambiarEstado` es la única mutation PÚBLICA: el agente marca a quién
 *     llamó. Es uso diario, no carga masiva, y por eso NO pide la habilitación.
 *
 * ⚠️ El `estado` es del agente. El import lo pone en "pendiente" al crear y
 * nunca lo vuelve a tocar: un re-import del Excel no puede borrar el trabajo de
 * quién ya fue contactado.
 */

// ───────────────────────── Habilitación de la carga ─────────────────────────

/**
 * Propia, y no la de cartera: habilitar un import no tiene que habilitar el
 * otro. Tampoco `DEPLOYMENT_ENV` ni `SEED_ENABLED` (ver la cabecera de
 * `cartera.ts`: arman el seed demo contra prod).
 *
 *   npx convex env set    CONTACTOS_IMPORT_ENABLED true
 *   node scripts/importar-contactos.mjs --simular
 *   node scripts/importar-contactos.mjs --aplicar
 *   npx convex env remove CONTACTOS_IMPORT_ENABLED
 */
const VAR_HABILITACION = "CONTACTOS_IMPORT_ENABLED";

/** Lo llaman las TRES mutations de carga, no sólo la primera. */
function exigirImportHabilitado() {
  if (process.env[VAR_HABILITACION] !== "true") {
    throw new Error(
      `Import de contactos bloqueado: requiere ${VAR_HABILITACION}=true en el env del deployment. ` +
        `Se setea a mano antes de importar y se REMUEVE después.`,
    );
  }
}

// ───────────────────────────── Carga (CLI) ─────────────────────────────

const alternativoValidator = v.object({
  condicionIva: v.optional(v.string()),
  direccion: v.optional(v.string()),
  localidad: v.optional(v.string()),
  codigoPostal: v.optional(v.string()),
  tipoDocumento: v.optional(v.string()),
  numeroDocumento: v.optional(v.string()),
  telefono: v.optional(v.string()),
  email: v.optional(v.string()),
  observacion: v.optional(v.string()),
  faltanDatosObligatorios: v.boolean(),
});

/**
 * Un contacto ya armado por el script (`aContactos`). Nada se sanea acá. No
 * trae `estado`: el estado no viene del archivo.
 */
const contactoValidator = v.object({
  clave: v.string(),
  nombre: v.string(),
  productor: v.string(),
  productorNombre: v.string(),
  cuit: v.optional(v.string()),
  condicionIva: v.optional(v.string()),
  direccion: v.optional(v.string()),
  localidad: v.optional(v.string()),
  codigoPostal: v.optional(v.string()),
  tipoDocumento: v.optional(v.string()),
  numeroDocumento: v.optional(v.string()),
  telefono: v.optional(v.string()),
  email: v.optional(v.string()),
  observacion: v.optional(v.string()),
  faltanDatosObligatorios: v.boolean(),
  marcas: v.array(v.string()),
  aVerificar: v.boolean(),
  alternativos: v.optional(v.array(alternativoValidator)),
});

const anomaliasValidator = v.object({
  filas: v.number(),
  filasFaltanDatos: v.number(),
  filasConObservacion: v.number(),
  contactos: v.number(),
  fusionados: v.number(),
  sinCuit: v.number(),
  sinIdentificador: v.number(),
  cuitCompartido: v.number(),
  aVerificar: v.number(),
});

/** Abre una corrida. `filasEsperadas` = contactos validados por el script. */
export const abrirImport = internalMutation({
  args: {
    archivo: v.string(),
    modo: v.union(v.literal("REAL"), v.literal("SIMULACION")),
    filasEsperadas: v.number(),
    anomalias: anomaliasValidator,
  },
  handler: async (ctx, args) => {
    exigirImportHabilitado();
    return await ctx.db.insert("contactosImports", {
      fuente: "xlsx",
      modo: args.modo,
      archivo: args.archivo,
      iniciadoEn: Date.now(),
      filasEsperadas: args.filasEsperadas,
      // `completadoEn` ausente: la corrida arranca INCOMPLETA.
      creadas: 0,
      actualizadas: 0,
      anomalias: args.anomalias,
    });
  },
});

/**
 * Escribe un lote. Upsert por `clave`.
 *
 * Igual que en cartera: `dryRun` es requerido, y al flag NO SE LE CREE. La
 * autoridad es el `modo` de la corrida, y toda incoherencia se rechaza en las
 * dos direcciones.
 */
export const upsertLote = internalMutation({
  args: {
    importId: v.id("contactosImports"),
    contactos: v.array(contactoValidator),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    exigirImportHabilitado();

    const corrida = await ctx.db.get(args.importId);
    if (!corrida) throw new Error(`importId inexistente: ${args.importId}`);

    if (corrida.modo === "SIMULACION" && !args.dryRun) {
      throw new Error(
        "Incoherencia: la corrida es SIMULACION y el lote vino con dryRun=false. " +
          "Una simulación no escribe contactos.",
      );
    }
    if (corrida.modo === "REAL" && args.dryRun) {
      throw new Error(
        "Incoherencia: la corrida es REAL y el lote vino con dryRun=true. " +
          "Una corrida real no puede completarse con lotes simulados.",
      );
    }
    if (corrida.completadoEn !== undefined) {
      throw new Error("La corrida ya está cerrada: no se le pueden agregar lotes.");
    }

    let creadas = 0;
    let actualizadas = 0;

    for (const contacto of args.contactos) {
      const existente = await ctx.db
        .query("contactos")
        .withIndex("by_clave", (q) => q.eq("clave", contacto.clave))
        .unique();

      if (existente) {
        actualizadas++;
        if (!args.dryRun) await patchDelArchivo(ctx, existente._id, contacto, args.importId);
      } else {
        creadas++;
        if (!args.dryRun) {
          await ctx.db.insert("contactos", {
            ...contacto,
            estado: "pendiente",
            importId: args.importId,
          });
        }
      }
    }

    // Se acumulan lote por lote: una corrida interrumpida muestra lo que de
    // verdad escribió.
    await ctx.db.patch(args.importId, {
      creadas: corrida.creadas + creadas,
      actualizadas: corrida.actualizadas + actualizadas,
    });

    return { creadas, actualizadas, dryRun: args.dryRun };
  },
});

/**
 * Reescribe TODOS los campos que vienen del archivo, con `undefined` explícito
 * en los ausentes, igual que `patchCompleto` de cartera: si el Excel vació un
 * teléfono, o dejó de traer la segunda fila de una persona, el dato viejo se
 * BORRA (C4). Recortarlo a "sólo los presentes" dejaría vivo un dato que ya no
 * existe en la fuente.
 *
 * ⚠️ Y NO incluye `estado` ni `estadoActualizadoEn`. Son del agente, y este
 * patch corre en cada re-import. Lo cuida un guard en `contactos.test.mjs`.
 */
async function patchDelArchivo(
  ctx: MutationCtx,
  id: Id<"contactos">,
  contacto: Infer<typeof contactoValidator>,
  importId: Id<"contactosImports">,
) {
  await ctx.db.patch(id, {
    clave: contacto.clave,
    nombre: contacto.nombre,
    productor: contacto.productor,
    productorNombre: contacto.productorNombre,
    cuit: contacto.cuit,
    condicionIva: contacto.condicionIva,
    direccion: contacto.direccion,
    localidad: contacto.localidad,
    codigoPostal: contacto.codigoPostal,
    tipoDocumento: contacto.tipoDocumento,
    numeroDocumento: contacto.numeroDocumento,
    telefono: contacto.telefono,
    email: contacto.email,
    observacion: contacto.observacion,
    faltanDatosObligatorios: contacto.faltanDatosObligatorios,
    marcas: contacto.marcas,
    aVerificar: contacto.aVerificar,
    alternativos: contacto.alternativos,
    importId,
  });
}

/**
 * Cierra la corrida, y la marca completa sólo si los números cuadran.
 *
 * ⚠️ `noVinieron` (C3 de la auditoría) se calcula contra `claves`, el conjunto
 * COMPLETO de claves del archivo validado que manda el script, y no por
 * `importId`. Por `importId` daría mal en una simulación: no actualiza ningún
 * contacto, así que todos los de la base tendrían un `importId` de otra
 * corrida y "no habrían venido". Y sólo se escribe si la corrida cierra
 * COMPLETA: en una incompleta no es un número definitivo.
 *
 * No borra nada. Un contacto que no vino conserva su fila y su estado.
 */
export const cerrarImport = internalMutation({
  args: {
    importId: v.id("contactosImports"),
    claves: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    exigirImportHabilitado();

    const corrida = await ctx.db.get(args.importId);
    if (!corrida) throw new Error(`importId inexistente: ${args.importId}`);

    const delArchivo = new Set(args.claves);
    if (delArchivo.size !== args.claves.length) {
      throw new Error("Las claves del archivo vinieron repetidas: el script no fusionó bien.");
    }

    const procesadas = corrida.creadas + corrida.actualizadas;
    if (procesadas !== corrida.filasEsperadas || delArchivo.size !== corrida.filasEsperadas) {
      const desvio =
        `procesadas ${procesadas} de ${corrida.filasEsperadas} esperadas ` +
        `(creadas ${corrida.creadas}, actualizadas ${corrida.actualizadas}; ` +
        `${delArchivo.size} claves recibidas al cerrar)`;
      await ctx.db.patch(args.importId, { desvioAlCerrar: desvio });
      return { completado: false as const, desvio };
    }

    // 1.472 contactos: un `.collect()` entra holgado en los límites de lectura.
    const enLaBase = await ctx.db.query("contactos").collect();
    const noVinieron = enLaBase.filter((c) => !delArchivo.has(c.clave)).length;

    await ctx.db.patch(args.importId, { completadoEn: Date.now(), noVinieron });
    return { completado: true as const, procesadas, noVinieron };
  },
});

// ───────────────────────────── Pantalla ─────────────────────────────

/**
 * Guard de las dos queries y de `cambiarEstado`. Lanza, no devuelve `null`.
 * `resolveRole` ya devuelve `null` para el agente desactivado (REC-91), así
 * que queda afuera por el mismo camino que una sesión ausente.
 */
async function exigirAgente(ctx: Parameters<typeof resolveRole>[0]) {
  const resolved = await resolveRole(ctx);
  if (!resolved || resolved.rol !== "agente") {
    throw new Error("No autorizado: se requiere una sesión de agente.");
  }
}

/**
 * Todos los contactos, para el listado. La pantalla filtra y busca en el
 * cliente, igual que Cartera: son ~1.500 filas y el agente puede verlas todas.
 */
export const listar = query({
  args: {},
  handler: async (ctx) => {
    await exigirAgente(ctx);

    const filas = await ctx.db.query("contactos").collect();

    // Proyección campo por campo, nunca `...doc`: `importId` y `clave` son
    // plomería interna.
    const contactos = filas.map((c) => ({
      _id: c._id,
      nombre: c.nombre,
      productor: c.productor,
      productorNombre: c.productorNombre,
      cuit: c.cuit,
      condicionIva: c.condicionIva,
      direccion: c.direccion,
      localidad: c.localidad,
      codigoPostal: c.codigoPostal,
      tipoDocumento: c.tipoDocumento,
      numeroDocumento: c.numeroDocumento,
      telefono: c.telefono,
      email: c.email,
      observacion: c.observacion,
      faltanDatosObligatorios: c.faltanDatosObligatorios,
      marcas: c.marcas,
      aVerificar: c.aVerificar,
      alternativos: c.alternativos,
      estado: c.estado,
      estadoActualizadoEn: c.estadoActualizadoEn,
    }));

    // `<`/`>` y no `localeCompare`: determinístico en el runtime de Convex.
    contactos.sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
    return contactos;
  },
});

/**
 * Procedencia de la lista, para el cartel. Mismos cuatro estados que
 * `cartera.estadoCartera` (ver su comentario): ninguno, sólo incompleta, sólo
 * completo, y completo con una incompleta posterior encima.
 */
export const estadoLista = query({
  args: {},
  handler: async (ctx) => {
    await exigirAgente(ctx);

    const reales = await ctx.db
      .query("contactosImports")
      .withIndex("by_modo", (q) => q.eq("modo", "REAL"))
      .order("desc")
      .collect();

    const ultimoCompleto = reales.find((r) => r.completadoEn !== undefined) ?? null;
    const incompleta =
      reales.find(
        (r) =>
          r.completadoEn === undefined &&
          (!ultimoCompleto || r._creationTime > ultimoCompleto._creationTime),
      ) ?? null;

    const resumen = (r: (typeof reales)[number]) => ({
      archivo: r.archivo,
      iniciadoEn: r.iniciadoEn,
      completadoEn: r.completadoEn,
      filasEsperadas: r.filasEsperadas,
      procesadas: r.creadas + r.actualizadas,
      desvioAlCerrar: r.desvioAlCerrar,
      noVinieron: r.noVinieron,
    });

    return {
      ultimoCompleto: ultimoCompleto ? resumen(ultimoCompleto) : null,
      cargaIncompleta: incompleta ? resumen(incompleta) : null,
    };
  },
});

const estadoValidator = v.union(
  v.literal("pendiente"),
  v.literal("contactado"),
  v.literal("interesado"),
  v.literal("descartado"),
);

/**
 * El agente marca el estado de un contacto. Única mutation pública del módulo.
 *
 * Idempotente: marcar el mismo estado no escribe, así `estadoActualizadoEn`
 * sigue diciendo cuándo cambió de verdad y no cuándo alguien volvió a tocar el
 * selector.
 */
export const cambiarEstado = mutation({
  args: { contactoId: v.id("contactos"), estado: estadoValidator },
  handler: async (ctx, args) => {
    await exigirAgente(ctx);

    const contacto = await ctx.db.get(args.contactoId);
    if (!contacto) throw new Error("El contacto no existe.");
    if (contacto.estado === args.estado) return { cambiado: false as const };

    await ctx.db.patch(args.contactoId, { estado: args.estado, estadoActualizadoEn: Date.now() });
    return { cambiado: true as const };
  },
});
