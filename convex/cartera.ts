import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { resolveRole } from "./users";

/**
 * Cartera de FedPat (REC-163 / REC-160).
 *
 * Dos mitades que no se tocan:
 *
 *   - La CARGA son `internalMutation`s, que se corren con `npx convex run`
 *     desde `scripts/importar-cartera.mjs`. No hay (ni debería haber) una
 *     pantalla que cargue 1.471 personas de un click. Mismo criterio que
 *     `limpieza.ts` y `seed.ts`.
 *   - La LECTURA son dos `query` para la sección Cartera del panel del agente.
 *
 * El módulo se llama por el flujo y no por la tabla, igual que `clientes.ts`
 * (ver su cabecera): `carteraClientes.ts` sugeriría que es el dueño de la
 * tabla, y la API de REC-159 va a ser un segundo escritor legítimo.
 *
 * Regla de seguridad (ver convex/users.ts): la identidad se DERIVA de la
 * sesión. Las dos queries son solo-agente; el damnificado no ve nada de esto
 * —la cartera de seguros no tiene relación con su reclamo—.
 */

// ───────────────────────── Habilitación de la carga ─────────────────────────

/**
 * Nombre de la variable que habilita CUALQUIER escritura de cartera.
 *
 * ⚠️ POR QUÉ NO SE REUSA `DEPLOYMENT_ENV` NI `SEED_ENABLED`.
 *
 * El reflejo era copiar el doble guard de `seed.ts:84-91`
 * (`SEED_ENABLED=true` Y `DEPLOYMENT_ENV=dev`). Está mal por dos motivos, y el
 * segundo es grave:
 *
 *   1. `DEPLOYMENT_ENV=dev` haría IMPOSIBLE el import en producción, que acá es
 *      justamente el objetivo: la cartera real se carga en prod.
 *   2. Peor: `docs/cutover-prod.md:63` deja escrito que `SEED_ENABLED` y
 *      `DEPLOYMENT_ENV` **no deben existir en prod**, y se removieron en el
 *      cutover, porque arman `seed:seedDemo` y `generarInvitacionDemo`
 *      **contra los datos reales**. Setear `DEPLOYMENT_ENV` para habilitar la
 *      cartera volvería a armar el seed demo contra producción. Un interruptor
 *      que enciende dos cosas distintas no es un interruptor.
 *
 * De ahí una variable propia, de un solo propósito, que se enciende, se usa y
 * se APAGA:
 *
 *   npx convex env set    CARTERA_IMPORT_ENABLED true
 *   node scripts/importar-cartera.mjs --simular
 *   node scripts/importar-cartera.mjs --aplicar
 *   npx convex env remove CARTERA_IMPORT_ENABLED
 */
const VAR_HABILITACION = "CARTERA_IMPORT_ENABLED";

/**
 * Guard de escritura. Lo llaman **las tres** mutations, no sólo la primera.
 *
 * Chequear nada más en `abrirImport` dejaría a `upsertLote` invocable con un
 * `importId` cualquiera: la autorización tiene que cubrir cada operación que
 * escribe, no el comienzo de la secuencia.
 */
function exigirImportHabilitado() {
  if (process.env[VAR_HABILITACION] !== "true") {
    throw new Error(
      `Import de cartera bloqueado: requiere ${VAR_HABILITACION}=true en el env del deployment. ` +
        `Se setea a mano antes de importar y se REMUEVE después.`,
    );
  }
}

// ───────────────────────────── Carga (CLI) ─────────────────────────────

/** Una fila ya parseada y normalizada por el script. Nada se sanea acá. */
const filaValidator = v.object({
  matricula: v.string(),
  nombre: v.string(),
  tipoPersona: v.optional(v.string()),
  iva: v.optional(v.string()),
  direccion: v.optional(v.string()),
  cp: v.optional(v.string()),
  cpa: v.optional(v.string()),
  localidad: v.optional(v.string()),
  tipoDocumento: v.optional(v.string()),
  numeroDocumento: v.optional(v.string()),
  telefono: v.optional(v.string()),
  cuit: v.optional(v.string()),
  email: v.optional(v.string()),
  cobrador: v.optional(v.string()),
});

/**
 * Abre una corrida. Devuelve el `importId` con el que el script manda los lotes.
 *
 * `filasEsperadas` llega del script DESPUÉS de haber validado el archivo
 * completo: es el número contra el que `cerrarImport` va a decidir si la
 * corrida terminó de verdad.
 */
export const abrirImport = internalMutation({
  args: {
    archivo: v.string(),
    modo: v.union(v.literal("REAL"), v.literal("SIMULACION")),
    filasEsperadas: v.number(),
  },
  handler: async (ctx, args) => {
    exigirImportHabilitado();
    return await ctx.db.insert("carteraImports", {
      fuente: "csv",
      modo: args.modo,
      archivo: args.archivo,
      iniciadoEn: Date.now(),
      filasEsperadas: args.filasEsperadas,
      // `completadoEn` ausente a propósito: la corrida arranca INCOMPLETA y lo
      // sigue estando hasta que `cerrarImport` valide los contadores.
      creadas: 0,
      actualizadas: 0,
      anomalias: {
        sinEmail: 0,
        emailDuplicado: 0,
        sinDireccion: 0,
        sinDocumento: 0,
      },
    });
  },
});

/**
 * Escribe un lote. Upsert por `matricula`.
 *
 * `dryRun` es booleano REQUERIDO y sin default, igual que en
 * `limpieza.borrarDamnificado` (ver su cabecera): una carga de 1.471 personas
 * no debería poder dispararse por omitir un argumento.
 *
 * ⚠️ Pero al flag NO SE LE CREE: la autoridad es el `modo` guardado en la fila
 * del import, y toda incoherencia se RECHAZA en las dos direcciones. Rechazar
 * en vez de "ignorar el flag en silencio" es deliberado: un llamado con el flag
 * equivocado es un bug de quien llama, y tragárselo lo esconde justo cuando el
 * síntoma sería "la simulación escribió" o "la corrida real no escribió nada".
 */
export const upsertLote = internalMutation({
  args: {
    importId: v.id("carteraImports"),
    filas: v.array(filaValidator),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    exigirImportHabilitado();

    const corrida = await ctx.db.get(args.importId);
    if (!corrida) throw new Error(`importId inexistente: ${args.importId}`);

    if (corrida.modo === "SIMULACION" && !args.dryRun) {
      throw new Error(
        "Incoherencia: la corrida es SIMULACION y el lote vino con dryRun=false. " +
          "Una simulación no escribe clientes.",
      );
    }
    if (corrida.modo === "REAL" && args.dryRun) {
      throw new Error(
        "Incoherencia: la corrida es REAL y el lote vino con dryRun=true. " +
          "Una corrida real no puede completarse con lotes simulados.",
      );
    }
    if (corrida.completadoEn !== undefined) {
      throw new Error(
        "La corrida ya está cerrada: no se le pueden agregar lotes.",
      );
    }

    let creadas = 0;
    let actualizadas = 0;

    for (const fila of args.filas) {
      const existente = await ctx.db
        .query("carteraClientes")
        .withIndex("by_matricula", (q) => q.eq("matricula", fila.matricula))
        .unique();

      if (existente) {
        actualizadas++;
        if (!args.dryRun) await patchCompleto(ctx, existente._id, fila, args.importId);
      } else {
        creadas++;
        if (!args.dryRun) {
          await ctx.db.insert("carteraClientes", { ...fila, importId: args.importId });
        }
      }
    }

    // Los contadores se acumulan ACÁ, lote por lote, y no al cerrar. Si se
    // consolidaran en `cerrarImport`, una corrida interrumpida quedaría en cero
    // habiendo escrito cientos de filas — y el cartel de la pantalla reportaría
    // una cartera que no es la que está en la tabla.
    await ctx.db.patch(args.importId, {
      creadas: corrida.creadas + creadas,
      actualizadas: corrida.actualizadas + actualizadas,
    });

    return { creadas, actualizadas, dryRun: args.dryRun };
  },
});

/**
 * Reescribe TODOS los campos de una fila existente, no sólo los que vienen.
 *
 * ⚠️ El `patch` arma el conjunto completo y pasa `undefined` explícito en los
 * campos ausentes, porque Convex borra el campo cuando recibe `undefined`.
 *
 * Hacerlo sólo con los campos presentes —el reflejo— tiene un modo de falla
 * silencioso: un cliente al que FedPat le borró el teléfono conservaría para
 * siempre el teléfono viejo, y la pantalla mostraría un dato que ya no existe
 * en la fuente, sin forma de notarlo.
 */
async function patchCompleto(
  ctx: MutationCtx,
  id: import("./_generated/dataModel").Id<"carteraClientes">,
  fila: {
    matricula: string;
    nombre: string;
    tipoPersona?: string;
    iva?: string;
    direccion?: string;
    cp?: string;
    cpa?: string;
    localidad?: string;
    tipoDocumento?: string;
    numeroDocumento?: string;
    telefono?: string;
    cuit?: string;
    email?: string;
    cobrador?: string;
  },
  importId: import("./_generated/dataModel").Id<"carteraImports">,
) {
  await ctx.db.patch(id, {
    matricula: fila.matricula,
    nombre: fila.nombre,
    tipoPersona: fila.tipoPersona,
    iva: fila.iva,
    direccion: fila.direccion,
    cp: fila.cp,
    cpa: fila.cpa,
    localidad: fila.localidad,
    tipoDocumento: fila.tipoDocumento,
    numeroDocumento: fila.numeroDocumento,
    telefono: fila.telefono,
    cuit: fila.cuit,
    email: fila.email,
    cobrador: fila.cobrador,
    importId,
  });
}

/**
 * Cierra la corrida — y sólo la marca completa si los números cuadran.
 *
 * `completadoEn` significa **terminación validada**, no "alguien llamó a
 * cerrar". Si lo procesado no coincide con `filasEsperadas`, la corrida queda
 * INCOMPLETA con el desvío escrito, y el cartel de la pantalla la va a mostrar
 * como carga parcial — que es lo que realmente es.
 */
export const cerrarImport = internalMutation({
  args: {
    importId: v.id("carteraImports"),
    anomalias: v.object({
      sinEmail: v.number(),
      emailDuplicado: v.number(),
      sinDireccion: v.number(),
      sinDocumento: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    exigirImportHabilitado();

    const corrida = await ctx.db.get(args.importId);
    if (!corrida) throw new Error(`importId inexistente: ${args.importId}`);

    const procesadas = corrida.creadas + corrida.actualizadas;
    if (procesadas !== corrida.filasEsperadas) {
      const desvio =
        `procesadas ${procesadas} de ${corrida.filasEsperadas} esperadas ` +
        `(creadas ${corrida.creadas}, actualizadas ${corrida.actualizadas})`;
      await ctx.db.patch(args.importId, {
        anomalias: args.anomalias,
        desvioAlCerrar: desvio,
      });
      return { completado: false as const, desvio };
    }

    await ctx.db.patch(args.importId, {
      completadoEn: Date.now(),
      anomalias: args.anomalias,
    });
    return { completado: true as const, procesadas };
  },
});

// ───────────────────────────── Lectura (pantalla) ─────────────────────────────

/** Mismo guard para las dos queries. Lanza, no devuelve `null`. */
async function exigirAgente(ctx: Parameters<typeof resolveRole>[0]) {
  const resolved = await resolveRole(ctx);
  if (!resolved || resolved.rol !== "agente") {
    throw new Error("No autorizado: se requiere una sesión de agente.");
  }
}

/**
 * La cartera completa, para el listado.
 *
 * Trae todo y la pantalla filtra en el cliente, que es el patrón de la sección
 * Clientes (`clientes.listMine` + `clientes/page.tsx`). A 1.471 filas × 13
 * campos son ~250 KB por carga y el agente está autorizado a ver su cartera
 * entera, así que es una decisión de ancho de banda y no de privacidad.
 *
 * Si la cartera creciera a decenas de miles hay que paginar y agregar un
 * `searchIndex`; los dos son puramente aditivos, así que diferirlo no cuesta
 * una migración.
 *
 * Lanza (no devuelve `null`) sin sesión de agente: es el contrato de las
 * queries de LISTADO solo-agente del repo (`casos.listMine`, `clientes.listMine`),
 * y el front las envuelve en un error boundary.
 */
export const listar = query({
  args: {},
  handler: async (ctx) => {
    await exigirAgente(ctx);

    const filas = await ctx.db.query("carteraClientes").collect();

    // Proyección campo por campo, nunca `...doc`: deja afuera `importId`, que
    // es plomería interna y no un dato del cliente.
    const clientes = filas.map((c) => ({
      _id: c._id,
      matricula: c.matricula,
      nombre: c.nombre,
      tipoPersona: c.tipoPersona,
      iva: c.iva,
      direccion: c.direccion,
      cp: c.cp,
      cpa: c.cpa,
      localidad: c.localidad,
      tipoDocumento: c.tipoDocumento,
      numeroDocumento: c.numeroDocumento,
      telefono: c.telefono,
      cuit: c.cuit,
      email: c.email,
      cobrador: c.cobrador,
    }));

    // Alfabético por nombre, con `<`/`>` y no `localeCompare`: determinístico
    // en el runtime de Convex, igual que `casos.listMine` y `clientes.listMine`.
    clientes.sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
    return clientes;
  },
});

/**
 * Estado de la cartera, para el cartel de procedencia.
 *
 * ⚠️ POR QUÉ DEVUELVE DOS COSAS Y NO "EL ÚLTIMO IMPORT COMPLETO".
 *
 * El reflejo era una query que devolviera la última corrida REAL y completa.
 * Tiene un agujero: `listar` devuelve **todas** las filas de la tabla,
 * incluidas las que escribió una corrida que se interrumpió. Con sólo el último
 * import completo, el cartel le atribuiría toda la cartera a una fecha que ya
 * no describe lo que la pantalla está mostrando.
 *
 * Así que devuelve las dos piezas y la pantalla pinta cuatro estados:
 *
 *   ninguno            → "todavía no se importó"
 *   sólo incompleta    → "carga incompleta: N de M"
 *   sólo completo      → "datos del CSV, importados el <fecha>"
 *   los dos            → la fecha del completo MÁS el aviso de que hay filas
 *                        más nuevas que esa fecha
 *
 * Las corridas `SIMULACION` no se miran nunca: existen como traza de auditoría
 * del dry-run, no como procedencia.
 */
export const estadoCartera = query({
  args: {},
  handler: async (ctx) => {
    await exigirAgente(ctx);

    // `by_modo` con el orden implícito por `_creationTime`: `.order("desc")`
    // da la más reciente primero sin leer la tabla entera.
    const reales = await ctx.db
      .query("carteraImports")
      .withIndex("by_modo", (q) => q.eq("modo", "REAL"))
      .order("desc")
      .collect();

    const ultimoCompleto = reales.find((r) => r.completadoEn !== undefined) ?? null;

    // Incompleta sólo si es POSTERIOR al último completo: una corrida vieja que
    // falló y después fue reemplazada por un import completo ya no describe
    // nada de lo que hay en la tabla.
    const incompleta = reales.find(
      (r) =>
        r.completadoEn === undefined &&
        (!ultimoCompleto || r._creationTime > ultimoCompleto._creationTime),
    ) ?? null;

    const resumen = (r: typeof reales[number]) => ({
      archivo: r.archivo,
      fuente: r.fuente,
      iniciadoEn: r.iniciadoEn,
      completadoEn: r.completadoEn,
      filasEsperadas: r.filasEsperadas,
      procesadas: r.creadas + r.actualizadas,
      creadas: r.creadas,
      actualizadas: r.actualizadas,
      desvioAlCerrar: r.desvioAlCerrar,
      anomalias: r.anomalias,
    });

    return {
      ultimoCompleto: ultimoCompleto ? resumen(ultimoCompleto) : null,
      cargaIncompleta: incompleta ? resumen(incompleta) : null,
    };
  },
});
