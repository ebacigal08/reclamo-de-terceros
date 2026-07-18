/**
 * Subida de un archivo a un caso — helper compartido (REC-77). Encapsula el flujo
 * canónico de 3 pasos (`generarUploadUrl` → POST XHR con progreso → `registrar`),
 * con `itemId` opcional para vincularlo a un ítem del checklist.
 *
 * Es transporte puro: **no evade ningún guard**. Recibe las mutations ya bindeadas
 * (los hooks los llama el componente) y toda la autorización + la validación de
 * archivo (MIME/tamaño) siguen server-side en `documentos.registrar`. El pre-check
 * `validarLocal` es sólo UX (cortar antes de subir); el server revalida.
 *
 * Los dos uploaders viejos (`ResponderPedidoView`, `DocumentosView`) mantienen su
 * copia inline; converger sobre este helper es el follow-up REC-23.
 */
import type { Id } from "@convex/_generated/dataModel";
import { ARCHIVOS_ACEPTADOS, ARCHIVO_MAX_BYTES, EXTENSIONES_ACEPTADAS } from "@/lib/constants";

/** Valor de `accept` para el input de archivos (MIME + extensiones aceptadas). */
export const ACCEPT_ARCHIVOS = [...ARCHIVOS_ACEPTADOS, ...EXTENSIONES_ACEPTADAS].join(",");

/** Pre-validación en el cliente (UX: cortar antes de subir). El server revalida. */
export function validarLocal(file: File): string | null {
  if (file.size > ARCHIVO_MAX_BYTES) return "Este archivo supera los 10 MB.";
  const lower = file.name.toLowerCase();
  const tipoOk =
    ARCHIVOS_ACEPTADOS.includes(file.type) ||
    EXTENSIONES_ACEPTADAS.some((ext) => lower.endsWith(ext));
  if (!tipoOk) return "Formato no permitido. Subí una imagen (JPG, PNG o HEIC) o un PDF.";
  return null;
}

/**
 * POST del archivo a la upload URL de Convex con barra de progreso real
 * (`XMLHttpRequest.upload.onprogress`; `fetch` no expone progreso de subida).
 * Resuelve con el `storageId` que devuelve Convex.
 */
export function subirConProgreso(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  registrarXhr: (xhr: XMLHttpRequest) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registrarXhr(xhr);
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { storageId } = JSON.parse(xhr.responseText);
          if (typeof storageId === "string") resolve(storageId);
          else reject(new Error("La respuesta de la subida no fue válida."));
        } catch {
          reject(new Error("La respuesta de la subida no fue válida."));
        }
      } else {
        reject(new Error(`La subida falló (HTTP ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Hubo un problema de red durante la subida."));
    xhr.onabort = () => reject(new DOMException("Subida cancelada", "AbortError"));
    xhr.send(file);
  });
}

type GenerarUploadUrl = (args: { casoId: Id<"casos"> }) => Promise<string>;
type Registrar = (args: {
  casoId: Id<"casos">;
  storageId: Id<"_storage">;
  nombreArchivo: string;
  itemId?: Id<"itemsDocumentacion">;
}) => Promise<{ documentoId: Id<"documentos"> }>;

/**
 * Orquesta la subida completa de un archivo (los 3 pasos). Devuelve el
 * `documentoId` registrado. `itemId` vincula el archivo a un ítem del checklist.
 */
export async function subirArchivo(
  deps: { generarUploadUrl: GenerarUploadUrl; registrar: Registrar },
  params: {
    casoId: Id<"casos">;
    file: File;
    itemId?: Id<"itemsDocumentacion">;
    onProgress?: (pct: number) => void;
    onXhr?: (xhr: XMLHttpRequest) => void;
  },
): Promise<{ documentoId: Id<"documentos"> }> {
  const url = await deps.generarUploadUrl({ casoId: params.casoId });
  const storageId = await subirConProgreso(
    url,
    params.file,
    params.onProgress ?? (() => {}),
    params.onXhr ?? (() => {}),
  );
  return await deps.registrar({
    casoId: params.casoId,
    storageId: storageId as Id<"_storage">,
    nombreArchivo: params.file.name,
    ...(params.itemId ? { itemId: params.itemId } : {}),
  });
}
