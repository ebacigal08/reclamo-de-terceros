import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { resolveRole } from "./users";

/**
 * REC-22 · Relato guiado del siniestro. El damnificado describe qué pasó en un
 * wizard de 7 preguntas; se persiste en `relatosSiniestro` como borrador
 * (`completo=false`) o enviado (`completo=true` + `completadoEn`).
 *
 * Seguridad (regla del módulo, igual que `casos.miCaso`): la identidad y el caso
 * se DERIVAN de la sesión con `resolveRole`; nunca se acepta id del cliente. El
 * caso es el del damnificado (el más reciente).
 *
 * Reglas de negocio:
 *  - Caso cerrado → no admite cambios (ConvexError).
 *  - Relato ya enviado (`completo=true`) → inmutable (ConvexError).
 *  - Al enviar (`completo=true`) se exigen respuestas no vacías en TODAS las
 *    preguntas requeridas, validado en el SERVER contra `PREGUNTAS_REQUERIDAS`
 *    (no se confía en que la UI mandó las 7).
 */

// Mirror canónico de los títulos requeridos para ENVIAR: todos menos "algo_mas"
// (opcional). MANTENER SINCRONIZADO con `RELATO_PREGUNTAS` de
// `src/lib/constants.ts` (no hay import compartido con el bundle de Convex;
// misma convención que `ORDEN_ETAPAS` en `casos.ts`).
const PREGUNTAS_REQUERIDAS = [
  "¿Cuándo ocurrió el siniestro?",
  "¿Dónde ocurrió?",
  "¿Qué pasó? Contalo con tus palabras.",
  "¿Cuál fue el daño o la pérdida?",
  "¿Ya hiciste alguna denuncia o contacto con la aseguradora?",
  "¿Tenés documentos relacionados?",
] as const;

// Pregunta con detalle condicional: si la respuesta es "Sí", el detalle (con
// quién/cuándo) es obligatorio. La UI lo codifica como "Sí — <detalle>"; un "Sí"
// pelado significa que el detalle falta.
const PREGUNTA_DENUNCIA = "¿Ya hiciste alguna denuncia o contacto con la aseguradora?";

/**
 * Relato del damnificado autenticado + estado del caso (para el guard de caso
 * cerrado en la UI). Sin args. `null` si no hay sesión de damnificado;
 * `{ caso: null, relato: null }` si el damnificado no tiene caso.
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
    const normalizadas = respuestas.map((r) => ({
      pregunta: r.pregunta,
      respuesta: r.respuesta.trim(),
    }));

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

    // 6) Validación server de requeridas SÓLO al enviar (no confía en la UI).
    if (completo) {
      const mapa = new Map(normalizadas.map((r) => [r.pregunta, r.respuesta]));
      const faltan = PREGUNTAS_REQUERIDAS.some((req) => !mapa.get(req));
      if (faltan) {
        throw new ConvexError(
          "Faltan respuestas: completá todas las preguntas antes de enviar.",
        );
      }
      // Detalle condicional: si la denuncia/contacto es "Sí", el detalle es
      // obligatorio (un "Sí" pelado = falta el detalle).
      if (mapa.get(PREGUNTA_DENUNCIA) === "Sí") {
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
