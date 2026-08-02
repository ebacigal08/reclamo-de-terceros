import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { resolveRole } from "./users";
import { exigirDamnificadoDeAgente, damnificadoDeAgente } from "./autorizacion";
import {
  agruparClientes,
  conflictoDeEmail,
  esEmailValido,
  normalizeEmail,
  resolucionEmail,
} from "./lib";
import { tieneCuentaAuth } from "./invitaciones";

/**
 * Sección Clientes del panel del agente (REC-90).
 *
 * "Cliente" es la mirada de agenda sobre la tabla `damnificados`: quién es, cómo
 * contactarlo y TODOS sus casos —abiertos y cerrados— en un solo lugar. El módulo
 * se llama por el flujo y no por la tabla porque `damnificados` ya tiene dos
 * escritores legítimos (el alta en `casos.ts` y el ciclo de invitación en
 * `invitaciones.ts`); un `damnificados.ts` sugeriría que es el dueño de la tabla.
 * Los args conservan el vocabulario de dominio: `damnificadoId`, nunca
 * `clienteId` — el tipo del id es la verdad y no se disfraza.
 *
 * Regla de seguridad (ver convex/users.ts): la identidad se DERIVA de la sesión.
 * La pertenencia de un cliente se deriva de los casos compartidos, en
 * `autorizacion.damnificadoDeAgente`.
 */

/** Tope del nombre y del teléfono. Los mismos límites que ya usa el resto. */
const MAX_NOMBRE = 120;
const MAX_TELEFONO = 40;

/**
 * Mis clientes: toda persona con al menos un caso mío, con su resumen de casos.
 *
 * ⚠️ EL DETALLE QUE SOSTIENE LA PANTALLA: el índice `by_agente` es
 * `["agenteId","cerrado"]` y acá se consulta SÓLO CON EL PREFIJO, así trae
 * abiertos Y cerrados. Copiar el `.eq("cerrado", false)` de `casos.listMine`
 * haría que un cliente desaparezca de la agenda cuando se le cierra el último
 * caso — sin error, sin síntoma, y justo cuando el histórico es lo que se quiere
 * consultar. Mismo truco (y mismo motivo) que `notificaciones.casosDelAgente`.
 *
 * Costo: una lectura indexada + un point-read por damnificado DISTINTO. Es
 * estrictamente más barata que `casos.listMine`, que además lee todos los plazos
 * de cada caso. Es O(casos del agente): a la escala en que esto haya que paginar,
 * `casos.listMine` ya habrá pedido lo mismo antes.
 *
 * Lanza (no devuelve `null`) sin sesión de agente: es el contrato de las queries
 * de LISTADO solo-agente del repo (`casos.listMine`, `casos.listClosed`), y el
 * front las envuelve en un error boundary.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "agente") {
      throw new Error("No autorizado: se requiere una sesión de agente.");
    }

    const casos = await ctx.db
      .query("casos")
      .withIndex("by_agente", (q) => q.eq("agenteId", resolved.agente._id))
      .collect();

    const resumenes = agruparClientes(casos);

    const filas = await Promise.all(
      [...resumenes.entries()].map(async ([damnificadoId, resumen]) => {
        const dam = await ctx.db.get(damnificadoId as Id<"damnificados">);
        // Una referencia colgada se DESCARTA. `listClosed` puede permitirse un
        // `?? ""` porque ahí el damnificado es una columna accesoria del caso;
        // acá el damnificado ES la fila, y una fila sin nombre no es un cliente.
        if (!dam) return null;
        return {
          _id: dam._id,
          nombre: dam.nombre,
          email: dam.email,
          telefono: dam.telefono,
          cuentaActivada: dam.cuentaActivada,
          casosAbiertos: resumen.abiertos,
          casosCerrados: resumen.cerrados,
          // Explícito para que la UI no tenga que sumar (y no pueda sumar mal).
          casosTotal: resumen.abiertos + resumen.cerrados,
          ultimoCasoEn: resumen.ultimoCasoEn,
        };
      }),
    );

    // Proyección campo por campo, nunca `...dam`: `invitacionToken` es una
    // CREDENCIAL (quien la tiene entra como el damnificado) y los tres
    // `invitacion*En` son ruido interno del cooldown de envíos.
    const clientes = filas.filter((f) => f !== null);

    // Actividad más reciente primero. Desempate por nombre con `<`/`>` y no con
    // `localeCompare`, igual que `casos.listMine`: determinístico en el runtime.
    clientes.sort((a, b) => {
      if (b.ultimoCasoEn !== a.ultimoCasoEn) {
        return b.ultimoCasoEn - a.ultimoCasoEn;
      }
      return a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0;
    });
    return clientes;
  },
});

/**
 * Ficha de un cliente: sus datos de contacto y TODOS los casos que tiene conmigo.
 *
 * Contrato único: `null` tanto si el cliente no existe como si no es mío (no
 * filtra la existencia de clientes ajenos), igual que `casos.get`.
 *
 * Los casos salen del guard YA filtrados por agente — si el mismo damnificado
 * tiene casos con otro agente, acá no aparecen y el conteo tampoco los ve.
 *
 * NO trae actividad (gestiones, etapas, documentos): eso vive en la ficha del
 * caso, que es donde tiene contexto. Mantiene la query en dos lecturas.
 */
export const get = query({
  args: { damnificadoId: v.id("damnificados") },
  handler: async (ctx, { damnificadoId }) => {
    const autorizado = await damnificadoDeAgente(ctx, damnificadoId);
    if (!autorizado) return null;
    const { dam, casos } = autorizado;

    const filas = casos.map((caso) => ({
      _id: caso._id,
      numeroCaso: caso.numeroCaso,
      tipoSiniestro: caso.tipoSiniestro,
      aseguradora: caso.aseguradora,
      etapa: caso.etapa,
      prioridad: caso.prioridad,
      cerrado: caso.cerrado,
      // Opcionales normalizados a `null` (que la UI no mezcle null/undefined).
      resultadoCierre: caso.resultadoCierre ?? null,
      cerradoEn: caso.cerradoEn ?? null,
      creadoEn: caso._creationTime,
    }));

    // Abiertos primero (es lo que el agente está trabajando) y dentro de cada
    // grupo el más nuevo arriba. Un solo `sort`, explícito.
    filas.sort((a, b) => {
      if (a.cerrado !== b.cerrado) return a.cerrado ? 1 : -1;
      return b.creadoEn - a.creadoEn;
    });

    return {
      _id: dam._id,
      nombre: dam.nombre,
      email: dam.email,
      telefono: dam.telefono,
      // El HECHO, no un `emailEditable` derivado: la regla de si se puede cambiar
      // vive en `editar`, que la re-deriva sola. Un tercer nombre para el mismo
      // bit sería una fuente de verdad de mentira (el guard del front es UX).
      cuentaActivada: dam.cuentaActivada,
      creadoEn: dam._creationTime,
      casos: filas,
    };
  },
});

/**
 * Editar los datos de contacto de un cliente.
 *
 * `email` es OPCIONAL a propósito: omitirlo significa "no lo toco", que es lo que
 * manda el front cuando el campo viene deshabilitado. Si en cambio el cliente
 * tuviera que hacer eco de un valor que no puede editar, una pestaña vieja podría
 * revertir en silencio un cambio hecho en otro lado.
 *
 * Orden: guard → validar → idempotencia → escribir. Validar SIEMPRE antes de
 * comparar, como `gestiones.editar`: si el early-return va primero, un guardado
 * "sin cambios" sella datos que nunca se validaron.
 */
export const editar = mutation({
  args: {
    damnificadoId: v.id("damnificados"),
    nombre: v.string(),
    telefono: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1) Pertenencia. `Error` y no `ConvexError`: los guards de sesión/pertenencia
    //    no se le muestran al usuario. Un agente NO puede renombrar a un
    //    damnificado arbitrario por id — necesita un caso en común.
    const { dam } = await exigirDamnificadoDeAgente(ctx, args.damnificadoId);

    // 2) Validación de campos, con los MISMOS mensajes que el alta: corregir un
    //    dato y darlo de alta tienen que decir lo mismo.
    const nombre = args.nombre.trim();
    const telefono = args.telefono.trim();
    if (!nombre) throw new ConvexError("Ingresá el nombre del damnificado.");
    if (!telefono) throw new ConvexError("Ingresá un teléfono de contacto.");
    if (nombre.length > MAX_NOMBRE) {
      throw new ConvexError(`El nombre no puede superar los ${MAX_NOMBRE} caracteres.`);
    }
    if (telefono.length > MAX_TELEFONO) {
      throw new ConvexError(
        `El teléfono no puede superar los ${MAX_TELEFONO} caracteres.`,
      );
    }

    // 3) El email: identidad, no dato de contacto. `cuentaActivada` es la línea.
    const emailNuevo =
      args.email === undefined ? undefined : normalizeEmail(args.email);
    const resolucion = resolucionEmail({
      cuentaActivada: dam.cuentaActivada,
      emailActual: dam.email,
      emailNuevo,
    });
    if (resolucion === "BLOQUEADO_CUENTA_ACTIVADA") {
      throw new ConvexError(
        "Este damnificado ya activó su cuenta: su email es el usuario con el que entra al portal y no se puede cambiar desde acá.",
      );
    }
    const cambiaEmail = resolucion === "CAMBIA";

    if (cambiaEmail) {
      // El `!` es seguro: `CAMBIA` implica que vino un email distinto del actual.
      const email = emailNuevo!;
      if (!esEmailValido(email)) {
        throw new ConvexError(
          "Ingresá un email válido (ej: nombre@dominio.com).",
        );
      }

      // 4) Unicidad GLOBAL entre agentes y damnificados: es el invariante que
      //    sostiene `resolveRole`. Réplica del guard del alta, con el YO excluido
      //    (ver `conflictoDeEmail`).
      const [agentesMatch, damnificadosMatch] = await Promise.all([
        ctx.db
          .query("agentes")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(1),
        ctx.db
          .query("damnificados")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(2), // con el yo excluido, 1 match ajeno ya es conflicto
      ]);
      const conflicto = conflictoDeEmail({
        agentesConEseEmail: agentesMatch.length,
        damnificadosConEseEmail: damnificadosMatch.map((d) => d._id),
        propioId: dam._id,
      });
      if (conflicto === "AGENTE") {
        throw new ConvexError("Ese email ya pertenece a un agente.");
      }
      if (conflicto === "OTRO_DAMNIFICADO") {
        throw new ConvexError("Ese email ya lo tiene otro damnificado.");
      }

      // 5) No dejar cuentas de acceso huérfanas.
      //
      //    `cuentaActivada:false` normalmente significa que no hay fila en
      //    `authAccounts` —la crea `invitaciones.activar` y sólo ahí—, pero existe
      //    un estado de ACTIVACIÓN A MEDIAS: la cuenta se creó y el
      //    `marcarActivado` no llegó a aplicarse (`activar` es idempotente ante
      //    eso justamente porque puede pasar). Sin este chequeo, mover el email
      //    ahí dejaría una cuenta de login apuntando a la dirección vieja.
      //
      //    No es escalación de privilegios —`resolveRole` es fail-closed y esa
      //    dirección no resuelve a ningún rol—, pero es basura que después crea
      //    una SEGUNDA cuenta al activar. Se chequean las dos puntas: el email
      //    actual (¿estoy en activación a medias?) y el destino (¿la dirección a
      //    la que me muevo ya tiene una cuenta?).
      const [cuentaEnOrigen, cuentaEnDestino] = await Promise.all([
        tieneCuentaAuth(ctx, dam.email),
        tieneCuentaAuth(ctx, email),
      ]);
      if (cuentaEnOrigen) {
        throw new ConvexError(
          "Este damnificado ya tiene una cuenta de acceso creada con su email actual, así que no se puede cambiar desde acá.",
        );
      }
      if (cuentaEnDestino) {
        throw new ConvexError(
          "Ya existe una cuenta de acceso con ese email. Usá otra dirección.",
        );
      }
    }

    // 6) Idempotencia: si no cambió nada, no se escribe (y no se toca el OCC).
    const igualNombre = nombre === dam.nombre;
    const igualTelefono = telefono === dam.telefono;
    if (igualNombre && igualTelefono && !cambiaEmail) {
      return { damnificadoId: dam._id };
    }

    // ⚠️ El `invitacionToken` NO se rota y los `invitacion*En` NO se limpian, a
    // propósito. Rotar sería una revocación IMPLÍCITA, que es exactamente la
    // enfermedad que `rotarLinkActivacion` vino a curar: mataría en silencio un
    // link que el agente ya mandó por WhatsApp. "Me equivoqué al tipear" y "se
    // filtró el link" piden respuestas opuestas y sólo el agente sabe cuál pasó;
    // para revocar ya existe el botón explícito en la ficha del caso.
    // Y limpiar los timestamps convertiría "editar el email" en el bypass trivial
    // del rate-limit de invitaciones.
    await ctx.db.patch(dam._id, {
      nombre,
      telefono,
      ...(cambiaEmail ? { email: emailNuevo! } : {}),
    });
    return { damnificadoId: dam._id };
  },
});
