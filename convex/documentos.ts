import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { resolveRole } from "./users";
import { exigirCasoAutorizadoDual } from "./autorizacion";

/**
 * REC-23 · Carga de documentos y evidencias. Primer uso de Convex File Storage
 * en el proyecto. Flujo canónico: (1) `generarUploadUrl` da una URL de subida;
 * (2) el cliente hace POST del archivo y obtiene un `storageId`; (3) `registrar`
 * valida la metadata REAL del archivo (no confía en el cliente) e inserta el
 * `documentos`. La lista se lee con `misDocumentos`.
 *
 * Seguridad (regla del módulo, igual que `pedidos.ts` / `casos.get`):
 *  - La identidad y la pertenencia se DERIVAN de la sesión con `resolveRole`;
 *    nunca se acepta un rol/id de identidad del cliente. El `casoId` llega del
 *    cliente pero se valida ownership DUAL (agente o damnificado dueño del caso).
 *  - `Error` para guards de sesión/pertenencia/estado; `ConvexError` (mensaje
 *    legible en el cliente) para validación de negocio/archivo.
 *  - Limpieza de huérfanos: como la validación del archivo ocurre DESPUÉS de que
 *    el blob ya se subió, `registrar` borra el blob ante un rechazo del archivo.
 *    PERO nunca borra en fallos de sesión/pertenencia/caso-cerrado: la API no
 *    tiene ownership del blob, así que borrar ahí permitiría que un `storageId`
 *    ajeno reusado borre un archivo legítimo. Sólo se borra TRAS confirmar dueño
 *    + caso abierto, cuando el rechazo es del propio archivo que el usuario sube.
 *
 * Alcance REC-23: la UI es del damnificado (`/damnificado/documentos`). El
 * backend ya soporta al agente (ownership dual) para cuando se agregue su entrada
 * desde la Ficha del caso (otro PR). Sin cambios de schema.
 */

// Mirror canónico de tipos/límites aceptados. MANTENER SINCRONIZADO con
// `src/lib/constants.ts` (el bundle de Convex no comparte imports con `src/`;
// misma convención que `PREGUNTAS_REQUERIDAS` en `relato.ts`).
const ARCHIVOS_ACEPTADOS = ["image/jpeg", "image/png", "image/heic", "application/pdf"];
const EXTENSIONES_ACEPTADAS = [".jpg", ".jpeg", ".png", ".heic", ".pdf"];
const ARCHIVO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const NOMBRE_MAX = 260;

/** Content-type ausente o genérico (típico de HEIC): no alcanza para decidir por MIME. */
function contentTypeIndeterminado(ct: string): boolean {
  return ct === "" || ct === "application/octet-stream";
}

function extensionAceptada(nombre: string): boolean {
  const lower = nombre.toLowerCase();
  return EXTENSIONES_ACEPTADAS.some((ext) => lower.endsWith(ext));
}

/** Tipo aceptado por MIME, con fallback por extensión si el MIME no es confiable. */
function tipoAceptado(contentType: string, nombre: string): boolean {
  if (ARCHIVOS_ACEPTADOS.includes(contentType)) return true;
  if (contentTypeIndeterminado(contentType)) return extensionAceptada(nombre);
  return false;
}

/**
 * Motivo de rechazo del archivo (o `null` si es válido). Se evalúa SÓLO tras
 * confirmar dueño + caso abierto. Un único punto de decisión → un único
 * `delete`+`throw` en `registrar` (así no se olvida limpiar en ninguna rama).
 */
function motivoRechazoArchivo(
  size: number,
  contentType: string,
  nombre: string,
  url: string | null,
): string | null {
  if (size > ARCHIVO_MAX_BYTES) return "El archivo supera el máximo de 10 MB.";
  if (!nombre) return "El archivo no tiene un nombre válido.";
  if (nombre.length > NOMBRE_MAX) return "El nombre del archivo es demasiado largo.";
  if (!tipoAceptado(contentType, nombre)) {
    return "Formato no permitido. Subí una imagen (JPG, PNG o HEIC) o un PDF.";
  }
  if (!url) return "No encontramos el archivo subido. Probá de nuevo.";
  return null;
}

/**
 * Sesión + pertenencia dual del caso. El helper se mudó a `convex/autorizacion.ts`
 * (REC-34): el chat necesita el MISMO guard desde una query, y dos copias de una
 * frontera de autorización es exactamente lo que no queremos que exista.
 *
 * NO valida "cerrado": cada mutation decide su política, y en `registrar` la
 * limpieza del blob depende de haber pasado ESTOS guards primero.
 */
const getCasoAutorizado = exigirCasoAutorizadoDual;

/**
 * URL pública del archivo, RESUELTA EN LECTURA (REC-72). Única fuente de verdad
 * para los dos lectores: `misDocumentos` (acá) y `casos.get` (la ficha del agente).
 *
 * Por qué no se persiste, aunque persistirla sería más barato: una URL de storage
 * incluye el HOST DEL DEPLOYMENT. Guardarla convierte un dato derivado en un dato
 * que miente apenas el caso cambia de deployment: al migrar (export/import), los
 * blobs viajan y los `storageId` se preservan, pero un string guardado NO se
 * reescribe → las filas seguirían apuntando al deployment viejo. Y el fallo es
 * SILENCIOSO: los links siguen funcionando mientras el deployment viejo esté vivo,
 * y se rompen recién cuando se apaga. Resolviéndola acá, la URL siempre pertenece
 * al deployment que la sirve, y el problema no puede volver en la próxima migración.
 *
 * El fallback a `doc.url` cubre las filas viejas (pre-REC-72), que la traen
 * persistida; por eso el campo sigue en el schema.
 */
export async function urlDeDocumento(
  ctx: QueryCtx,
  doc: Doc<"documentos">,
): Promise<string | null> {
  if (doc.storageId) return await ctx.storage.getUrl(doc.storageId);
  return doc.url ?? null;
}

/**
 * Documentos del caso del damnificado autenticado + estado del caso. Sin args:
 * el caso se DERIVA de la sesión (el más reciente, igual que `casos.miCaso`).
 * `null` si no hay sesión de damnificado; `{ caso: null, documentos: [] }` si el
 * damnificado no tiene caso. La proyección NO expone `storageId` (interno de File
 * Storage), igual que `casos.get`. La UI usa `caso._id` para las mutations y
 * `caso.cerrado` para deshabilitar la carga.
 */
export const misDocumentos = query({
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
    if (!caso) return { caso: null, documentos: [] };

    const documentos = await ctx.db
      .query("documentos")
      .withIndex("by_caso", (q) => q.eq("casoId", caso._id))
      .collect();

    return {
      caso: { _id: caso._id, cerrado: caso.cerrado },
      documentos: await Promise.all(
        documentos.map(async (d) => ({
          _id: d._id,
          nombreArchivo: d.nombreArchivo,
          subidoPor: d.subidoPor,
          tipoMime: d.tipoMime ?? null,
          tamanoBytes: d.tamanoBytes ?? null,
          url: await urlDeDocumento(ctx, d),
          creadoEn: d._creationTime,
        })),
      ),
    };
  },
});

/**
 * Paso 1 del flujo de subida: URL de subida de corta vida. Guards: sesión +
 * pertenencia dual + caso abierto. No hay `storageId` en juego todavía, así que
 * no hay nada que limpiar si algo falla acá.
 */
export const generarUploadUrl = mutation({
  args: { casoId: v.id("casos") },
  handler: async (ctx, { casoId }) => {
    const { caso } = await getCasoAutorizado(ctx, casoId);
    if (caso.cerrado) {
      throw new ConvexError("Este caso está cerrado; no se pueden subir documentos.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Paso 3 del flujo: registra el archivo ya subido en `documentos`. Ver la
 * política de limpieza de huérfanos en el encabezado del módulo. `subidoEn` del
 * issue = `_creationTime` (convención del módulo, no hay campo manual).
 */
export const registrar = mutation({
  args: {
    casoId: v.id("casos"),
    storageId: v.id("_storage"),
    nombreArchivo: v.string(),
    // Vínculo opcional a un ítem del checklist (REC-77). Ausente ⇒ subida general.
    itemId: v.optional(v.id("itemsDocumentacion")),
  },
  handler: async (ctx, { casoId, storageId, nombreArchivo, itemId }) => {
    // 1) Sesión + pertenencia. Si falla → Error, SIN tocar storage (ver encabezado).
    const { resolved, caso } = await getCasoAutorizado(ctx, casoId);

    // 2) Caso cerrado → rechazo SIN borrar (mismo motivo de seguridad).
    if (caso.cerrado) {
      throw new ConvexError("Este caso está cerrado; no se pueden subir documentos.");
    }

    // 2b) Vínculo a un ítem del checklist (REC-77): validar ANTES de leer metadata
    //     e insertar. Ya está confirmado que el usuario está autorizado al `casoId`
    //     (getCasoAutorizado, dual); exigir además `item.casoId === casoId` → ningún
    //     rol puede vincular a ítems de otro caso. NO cambia la validación de archivo
    //     de abajo (no abre bypass). No borra blob: mismo motivo que los guards de
    //     arriba (la API no tiene ownership del blob).
    if (itemId) {
      const item = await ctx.db.get(itemId);
      if (!item || item.casoId !== casoId) {
        throw new Error("Documento de checklist inválido: no pertenece a este caso.");
      }
    }

    // 3) Dueño confirmado + caso abierto: recién ahora validamos el archivo que
    //    ESTE usuario subió a SU propio caso, contra la metadata REAL del server.
    const metadata = await ctx.db.system.get("_storage", storageId);
    if (!metadata) {
      // Sin metadata no hay blob válido que borrar.
      throw new ConvexError("No encontramos el archivo subido. Probá de nuevo.");
    }

    const nombre = nombreArchivo.trim();
    const contentType = metadata.contentType ?? "";
    // Se calcula para VALIDAR (una URL nula delata un blob que no existe), pero
    // NO se persiste: ver `urlDeDocumento`. Guardarla ataría la fila al host de
    // ESTE deployment y mentiría después de una migración.
    const url = await ctx.storage.getUrl(storageId);

    // Un único punto de decisión → un único delete+throw (no se olvida limpiar).
    const motivo = motivoRechazoArchivo(metadata.size, contentType, nombre, url);
    if (motivo) {
      await ctx.storage.delete(storageId);
      throw new ConvexError(motivo);
    }

    const documentoId = await ctx.db.insert("documentos", {
      casoId,
      nombreArchivo: nombre,
      storageId,
      tipoMime: metadata.contentType ?? undefined,
      tamanoBytes: metadata.size,
      subidoPor: resolved.rol === "agente" ? "AGENTE" : "DAMNIFICADO",
      ...(itemId ? { itemId } : {}),
    });
    return { documentoId };
  },
});
