import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { resolveRole } from "./users";
import { casoDeAgente, exigirCasoDeAgente } from "./autorizacion";

/**
 * REC-22 · Relato guiado del siniestro. El damnificado describe qué pasó en un
 * wizard de 7 preguntas; se persiste en `relatosSiniestro` como borrador
 * (`completo=false`) o enviado (`completo=true` + `completadoEn`).
 *
 * REC-79 · El agente puede CORREGIRLO desde la ficha. Dos textos, un relato:
 *  - `respuestas` = lo que escribió el damnificado. Lo escribe SÓLO `guardar`; el
 *    agente no lo toca nunca, así el testimonio original no se pierde jamás.
 *  - `respuestasAgente` = la corrección del agente. La lee SÓLO `paraAgente`
 *    (guard rol=agente); el damnificado NO la ve por ninguna vía — ni por
 *    `miRelato`, ni por `casos.get`, que dejó de transportar el texto del relato.
 * La frontera es la FUNCIÓN ENTERA, no un `if` interno (igual que
 * `historialEtapas`): por eso la vista del agente es una query aparte y no una
 * rama dentro de la query dual-rol.
 *
 * Seguridad (regla del módulo, igual que `casos.miCaso`): en el lado damnificado
 * la identidad y el caso se DERIVAN de la sesión con `resolveRole`; nunca se
 * acepta id del cliente. El caso es el del damnificado (el más reciente). El lado
 * agente sí recibe `casoId` y lo autoriza con `casoDeAgente`/`exigirCasoDeAgente`.
 *
 * Reglas de negocio:
 *  - Caso cerrado → no admite cambios (ConvexError), de los dos lados.
 *  - Relato ya enviado (`completo=true`) → inmutable PARA EL DAMNIFICADO
 *    (ConvexError). El agente sí puede corregirlo: es el único que puede.
 *  - Al enviar (`completo=true`) se exigen respuestas no vacías en TODAS las
 *    preguntas requeridas, validado en el SERVER contra `PREGUNTAS_REQUERIDAS`
 *    (no se confía en que la UI mandó las 7).
 *  - Sin notificaciones ni emails: la corrección del agente no le avisa a nadie
 *    (decisión de producto — la ve sólo él). Este módulo no importa
 *    `notificaciones` ni `email`, y conviene que siga así.
 */

// Mirror canónico de los 7 títulos, EN ORDEN. MANTENER SINCRONIZADO con
// `RELATO_PREGUNTAS` de `src/lib/constants.ts` (no hay import compartido con el
// bundle de Convex; misma convención que `ORDEN_ETAPAS` en `casos.ts`).
const PREGUNTAS_TODAS = [
  "¿Cuándo ocurrió el siniestro?",
  "¿Dónde ocurrió?",
  "¿Qué pasó? Contalo con tus palabras.",
  "¿Cuál fue el daño o la pérdida?",
  "¿Ya hiciste alguna denuncia o contacto con la aseguradora?",
  "¿Tenés documentos relacionados?",
  "¿Algo más que el agente debería saber?",
] as const;

// Pregunta con detalle condicional: si la respuesta es "Sí", el detalle (con
// quién/cuándo) es obligatorio. La UI lo codifica como "Sí — <detalle>"; un "Sí"
// pelado significa que el detalle falta.
const PREGUNTA_DENUNCIA = "¿Ya hiciste alguna denuncia o contacto con la aseguradora?";

// La única opcional. Se descuenta por identidad y no por posición: si algún día se
// reordena `PREGUNTAS_TODAS`, esto sigue siendo correcto solo.
const PREGUNTA_OPCIONAL = "¿Algo más que el agente debería saber?";

// Requeridas para ENVIAR: todas menos la opcional.
const PREGUNTAS_REQUERIDAS = PREGUNTAS_TODAS.filter(
  (p) => p !== PREGUNTA_OPCIONAL,
);

// Tope por respuesta. Espejo de RELATO_MAX_RESPUESTA en src/lib/constants.ts (el
// server valida igual). Hasta REC-79 este módulo era el ÚNICO de escritura del
// repo sin ningún cap: el 1200 del wizard es un `maxLength` de UI sobre una sola
// pregunta y se saltea llamando la mutation directo.
const MAX_RESPUESTA = 1200;

type Respuesta = { pregunta: string; respuesta: string };

// ── Validadores compartidos por las dos mutations ────────────────────────────
// Una sola copia del criterio: dos se separan solas la primera vez que una se
// corrige (la lección de `gestiones.ts` y `plazos.ts`).

/** Trimea cada respuesta antes de persistir (también en borrador), sin ruido. */
function normalizar(respuestas: Respuesta[]): Respuesta[] {
  return respuestas.map((r) => ({
    pregunta: r.pregunta,
    respuesta: r.respuesta.trim(),
  }));
}

/** Tope por respuesta. Vale para borrador y para envío. */
function validarLargos(respuestas: Respuesta[]): void {
  for (const r of respuestas) {
    if (r.respuesta.length > MAX_RESPUESTA) {
      throw new ConvexError(
        `La respuesta a "${r.pregunta}" es demasiado larga (máx. ${MAX_RESPUESTA} caracteres).`,
      );
    }
  }
}

/**
 * Sólo títulos canónicos y sin repetir. Se aplica ÚNICAMENTE a la edición del
 * agente: `guardar` queda exento a propósito, para no romper borradores viejos
 * persistidos con títulos que desde entonces cambiaron.
 *
 * El mensaje no habla de la pregunta puntual porque esto no es un error del
 * formulario sino de un cliente desincronizado: al agente le sirve más "recargá".
 */
function validarPreguntasConocidas(respuestas: Respuesta[]): void {
  const vistas = new Set<string>();
  for (const r of respuestas) {
    if (
      !(PREGUNTAS_TODAS as readonly string[]).includes(r.pregunta) ||
      vistas.has(r.pregunta)
    ) {
      throw new ConvexError(
        "El relato no tiene el formato esperado. Recargá la página.",
      );
    }
    vistas.add(r.pregunta);
  }
}

/**
 * CRITERIO de "está listo para quedar enviado". Devuelve un discriminante y NO
 * lanza: el criterio es lo que no debe divergir entre los dos callers, pero los
 * mensajes sí, porque están escritos para audiencias distintas (el damnificado
 * lee "Contanos…", el agente no).
 *
 * Orden: primero las faltantes, después el detalle de la denuncia — es parte del
 * contrato observable de `guardar` (con las dos mal, se ve el de faltantes).
 */
function faltaParaEnviar(
  respuestas: Respuesta[],
): "FALTAN" | "DENUNCIA_SIN_DETALLE" | null {
  const mapa = new Map(respuestas.map((r) => [r.pregunta, r.respuesta]));
  if (PREGUNTAS_REQUERIDAS.some((req) => !mapa.get(req))) return "FALTAN";
  // Un "Sí" pelado = falta el detalle (la UI codifica "Sí — <detalle>").
  if (mapa.get(PREGUNTA_DENUNCIA) === "Sí") return "DENUNCIA_SIN_DETALLE";
  return null;
}

/**
 * Igualdad campo a campo y SENSIBLE AL ORDEN. Alcanza porque todo lo que se
 * compara sale del mismo `RELATO_PREGUNTAS.map(...)`, siempre en orden canónico.
 * Ante una fila histórica con otro orden devuelve `false` → se escribe, que es la
 * dirección segura (a lo sumo un write de más; nunca un cambio que se pierde).
 */
function igualesRespuestas(
  a: Respuesta[] | undefined,
  b: Respuesta[],
): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (r, i) => r.pregunta === b[i].pregunta && r.respuesta === b[i].respuesta,
  );
}

/**
 * Relato del damnificado autenticado + estado del caso (para el guard de caso
 * cerrado en la UI). Sin args. `null` si no hay sesión de damnificado;
 * `{ caso: null, relato: null }` si el damnificado no tiene caso.
 *
 * REC-79 · Devuelve SIEMPRE `respuestas` —lo que él escribió—, nunca
 * `respuestasAgente`. El damnificado no ve la corrección del agente.
 */
export const miRelato = query({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") return null;

    const caso = await ctx.db
      .query("casos")
      .withIndex("by_damnificado", (q) =>
        q.eq("damnificadoId", resolved.damnificado._id),
      )
      .order("desc")
      .first();
    if (!caso) return { caso: null, relato: null };

    const relato = await ctx.db
      .query("relatosSiniestro")
      .withIndex("by_caso", (q) => q.eq("casoId", caso._id))
      .first();

    return {
      caso: { cerrado: caso.cerrado },
      relato: relato
        ? {
            respuestas: relato.respuestas,
            completo: relato.completo,
            completadoEn: relato.completadoEn ?? null,
          }
        : null,
    };
  },
});

/**
 * Guarda el relato: borrador (`completo=false`) o envío (`completo=true`).
 * Upsert por caso. Ver reglas de negocio en el encabezado del módulo.
 */
export const guardar = mutation({
  args: {
    respuestas: v.array(
      v.object({ pregunta: v.string(), respuesta: v.string() }),
    ),
    completo: v.boolean(),
  },
  handler: async (ctx, { respuestas, completo }) => {
    // 1) Auth: sólo damnificado autenticado (guard de sesión → Error).
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") {
      throw new Error("No autorizado: se requiere una sesión de damnificado.");
    }

    // 2) Caso del damnificado (mismo criterio que `casos.miCaso`).
    const caso = await ctx.db
      .query("casos")
      .withIndex("by_damnificado", (q) =>
        q.eq("damnificadoId", resolved.damnificado._id),
      )
      .order("desc")
      .first();
    if (!caso) {
      throw new Error("Estado inconsistente: el damnificado no tiene caso.");
    }

    // 3) Guard de caso cerrado (BLOQUEANTE, server): no admite cambios.
    if (caso.cerrado) {
      throw new ConvexError("Este caso ya fue cerrado y no admite cambios.");
    }

    // 4) Normalización: trimear cada respuesta antes de persistir (también en
    //    borrador), para no guardar ruido de espacios.
    const normalizadas = normalizar(respuestas);

    // 5) Relato existente + inmutabilidad (enviado no se re-edita).
    const existente = await ctx.db
      .query("relatosSiniestro")
      .withIndex("by_caso", (q) => q.eq("casoId", caso._id))
      .first();
    if (existente?.completo) {
      throw new ConvexError(
        "Tu relato ya fue enviado y no se puede modificar.",
      );
    }

    // 6) Validación server. El largo se valida siempre (también en borrador); las
    //    requeridas, SÓLO al enviar (no confía en la UI). Va después del guard de
    //    inmutabilidad para que "ya fue enviado" siga ganando, como hasta ahora.
    validarLargos(normalizadas);
    if (completo) {
      const falta = faltaParaEnviar(normalizadas);
      if (falta === "FALTAN") {
        throw new ConvexError(
          "Faltan respuestas: completá todas las preguntas antes de enviar.",
        );
      }
      if (falta === "DENUNCIA_SIN_DETALLE") {
        throw new ConvexError(
          "Contanos con quién y cuándo hiciste la denuncia o el contacto.",
        );
      }
    }

    // 7) Upsert por caso. `completadoEn` sólo cuando se envía.
    const patch = {
      respuestas: normalizadas,
      completo,
      ...(completo ? { completadoEn: Date.now() } : {}),
    };
    if (existente) {
      await ctx.db.patch(existente._id, patch);
      return { relatoId: existente._id };
    }
    const relatoId = await ctx.db.insert("relatosSiniestro", {
      casoId: caso._id,
      ...patch,
    });
    return { relatoId };
  },
});

// ── Lado AGENTE (REC-79) ─────────────────────────────────────────────────────

/**
 * El relato como lo ve el AGENTE dueño del caso: el texto EFECTIVO (su corrección
 * si la hay, si no el del damnificado) más el original, para poder compararlos.
 *
 * Query propia y no una rama dentro de `casos.get` porque `casos.get` es
 * DUAL-ROL: `respuestasAgente` no tiene que poder salir por ninguna función que un
 * damnificado pueda llamar. Acá la frontera es la función entera, no un `if`
 * interno (molde `historialEtapas.listPorCaso`).
 *
 * Fail-closed: sin sesión de agente, o caso inexistente/ajeno → `null`, mismo
 * trato para los tres (no filtra existencia). `{ relato: null }` = autorizado y el
 * caso todavía no tiene relato.
 */
export const paraAgente = query({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const autorizado = await casoDeAgente(ctx, casoId);
    if (!autorizado) return null;

    const relato = await ctx.db
      .query("relatosSiniestro")
      .withIndex("by_caso", (q) => q.eq("casoId", casoId))
      .first();
    if (!relato) return { relato: null };

    // Por la invariante del schema, `respuestasAgente` existe ⇔ el efectivo DIFIERE
    // del texto del damnificado ⇒ `original` no nulo significa "hay realmente algo
    // distinto que mirar". El guard de `length` cubre el relato que nació del propio
    // agente: ahí el damnificado nunca escribió nada y no hay original que mostrar.
    const corregido = relato.respuestasAgente !== undefined;
    return {
      relato: {
        respuestas: relato.respuestasAgente ?? relato.respuestas,
        original:
          corregido && relato.respuestas.length > 0 ? relato.respuestas : null,
        completo: relato.completo,
        completadoEn: relato.completadoEn ?? null,
        editadoPorAgenteEn: relato.editadoPorAgenteEn ?? null,
      },
    };
  },
});

/**
 * Corrige el relato del caso. Es la ÚNICA vía para arreglar un relato ya enviado:
 * el damnificado no puede (write-once) y hasta REC-79 no podía nadie.
 *
 * Escribe SÓLO `respuestasAgente`. `respuestas` —el testimonio del damnificado— no
 * se toca nunca, y por eso el original queda conservado sin copiarlo a ningún lado.
 *
 * ⚠️ DEJA EL RELATO COMO ENVIADO (`completo: true`). Si estaba en borrador, el
 * damnificado PIERDE la posibilidad de enviarlo desde su cuenta (lo corta el guard
 * de inmutabilidad de `guardar`), y no hay forma de volver atrás por ninguna API.
 * Es deliberado: así el texto tiene un solo dueño a la vez y no hay carrera entre
 * los dos roles. La UI lo avisa antes de guardar.
 *
 * No notifica ni manda emails: la corrección la ve sólo el agente.
 */
export const editarComoAgente = mutation({
  args: {
    casoId: v.id("casos"),
    respuestas: v.array(
      v.object({ pregunta: v.string(), respuesta: v.string() }),
    ),
  },
  handler: async (ctx, { casoId, respuestas }) => {
    // 1-2) Auth + pertenencia (Error: no se le muestra al usuario).
    const { agente, caso } = await exigirCasoDeAgente(ctx, casoId);

    // 3) Cerrado = congelado.
    if (caso.cerrado) {
      throw new ConvexError("El caso está cerrado; no podés editar el relato.");
    }

    // 4) Validación. Las requeridas se exigen SIEMPRE —a diferencia de `guardar`,
    //    que sólo al enviar—: esto deja el relato enviado, y `completo=true` tiene
    //    que seguir significando "todas las requeridas respondidas".
    const normalizadas = normalizar(respuestas);
    validarPreguntasConocidas(normalizadas);
    validarLargos(normalizadas);
    const falta = faltaParaEnviar(normalizadas);
    if (falta === "FALTAN") {
      throw new ConvexError(
        "Faltan respuestas: completá todas las preguntas antes de guardar.",
      );
    }
    if (falta === "DENUNCIA_SIN_DETALLE") {
      throw new ConvexError(
        "Falta el detalle de la denuncia: con quién y cuándo.",
      );
    }

    const existente = await ctx.db
      .query("relatosSiniestro")
      .withIndex("by_caso", (q) => q.eq("casoId", casoId))
      .first();

    // 5) Sin fila todavía: la crea el agente. `respuestas: []` porque el damnificado
    //    no escribió nada, y `completadoEn` queda AUSENTE porque nadie completó nada
    //    (la ficha condiciona ese badge a que exista).
    if (!existente) {
      const relatoId = await ctx.db.insert("relatosSiniestro", {
        casoId,
        respuestas: [],
        completo: true,
        respuestasAgente: normalizadas,
        editadoPorAgenteEn: Date.now(),
        editadoPorAgenteId: agente._id,
      });
      return { relatoId };
    }

    // 6) Idempotencia — se compara contra las EFECTIVAS, no contra
    //    `respuestasAgente`. Comparar contra `respuestasAgente` a secas dejaría
    //    afuera el caso más común: relato completo NUNCA editado, el agente abre el
    //    form y guarda sin cambiar nada → escribiría una copia idéntica y sellaría
    //    una edición que no ocurrió. El sello no debe mentir (molde
    //    `notasInternas.editar`). Validar SIEMPRE antes de comparar, nunca al revés.
    //    Con `completo=false` no corta aunque el texto coincida: ahí el write sí
    //    cambia estado (lo deja enviado y congela el wizard).
    const efectivas = existente.respuestasAgente ?? existente.respuestas;
    if (existente.completo && igualesRespuestas(efectivas, normalizadas)) {
      return { relatoId: existente._id };
    }

    // 7) `respuestas` y `completadoEn` NO se tocan. `respuestasAgente` sólo existe
    //    si DIFIERE del texto del damnificado: si el agente revierte a lo original
    //    —o congela un borrador sin corregirle nada— se BORRA (`undefined` en un
    //    patch elimina el campo) en vez de dejar un "original" clon del efectivo.
    //    El sello, en cambio, sobrevive a la reversión a propósito: que el agente
    //    haya intervenido es información, aunque el texto haya vuelto al original.
    const igualAlDamnificado = igualesRespuestas(
      existente.respuestas,
      normalizadas,
    );
    await ctx.db.patch(existente._id, {
      respuestasAgente: igualAlDamnificado ? undefined : normalizadas,
      completo: true,
      editadoPorAgenteEn: Date.now(),
      editadoPorAgenteId: agente._id,
    });
    return { relatoId: existente._id };
  },
});
