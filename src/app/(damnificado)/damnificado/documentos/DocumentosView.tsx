"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  RotateCw,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ARCHIVOS_ACEPTADOS,
  ARCHIVO_MAX_BYTES,
  EXTENSIONES_ACEPTADAS,
  RUTAS,
} from "@/lib/constants";
import { formatFecha, formatTamano } from "@/lib/format";
import { Alert, Button, EmptyState, Skeleton } from "@/components/ui";

// Espejo de la proyección de `documentos.misDocumentos` (SIN `storageId`).
type DocItem = {
  _id: Id<"documentos">;
  nombreArchivo: string;
  subidoPor: "AGENTE" | "DAMNIFICADO";
  tipoMime: string | null;
  tamanoBytes: number | null;
  url: string | null;
  creadoEn: number;
};

// Ítem de subida en curso (estado LOCAL, separado de la lista del server). El
// acuse (`ok`) es persistente: no se autodescarta, sólo lo cierra el usuario.
type UploadItem = {
  id: string;
  file: File;
  nombre: string;
  tamano: number;
  progreso: number; // 0..100
  estado: "subiendo" | "ok" | "error";
  error?: string;
  reintentable: boolean; // false si el rechazo fue pre-subida (tamaño/tipo local)
};

const ACCEPT = [...ARCHIVOS_ACEPTADOS, ...EXTENSIONES_ACEPTADAS].join(",");

/** Extrae el mensaje legible de un ConvexError (mismo helper que RelatoView). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

/** Pre-validación en el cliente (UX: cortar antes de subir). El server revalida. */
function validarLocal(file: File): string | null {
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
 * Resuelve con el `storageId` que devuelve Convex. Setea el `Content-Type` con
 * `file.type` para que el server reciba un content-type correcto.
 */
function subirConProgreso(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  registrarXhr: (xhr: XMLHttpRequest) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // Se registra ANTES de arrancar para que "descartar" pueda abortarlo en curso.
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

function esImagen(tipoMime: string | null, nombre: string): boolean {
  if (tipoMime && tipoMime.startsWith("image/")) return true;
  return /\.(jpe?g|png|heic)$/i.test(nombre);
}

export function DocumentosView() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const data = useQuery(api.documentos.misDocumentos);
  const generarUploadUrl = useMutation(api.documentos.generarUploadUrl);
  const registrar = useMutation(api.documentos.registrar);

  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idSeq = useRef(0);
  // XHR en vuelo por ítem (para abortar al descartar) + ids descartados (para
  // cortar la subida aunque el descarte ocurra entre los `await`, antes/después
  // de crear el XHR).
  const xhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const canceladosRef = useRef<Set<string>>(new Set());

  // Guard de acceso: los redirects van SÓLO acá (nunca durante el render).
  useEffect(() => {
    if (me === undefined || data === undefined) return;
    if (me === null || data === null) {
      router.replace(RUTAS.login);
      return;
    }
    if (me.rol !== "damnificado") {
      router.replace("/");
      return;
    }
    if (data.caso === null) {
      router.replace(RUTAS.damnificado.miCaso);
    }
  }, [me, data, router]);

  // Gating de render (tras los hooks). Mientras carga o hay redirect pendiente,
  // no se muestra la pantalla. Con caso (aunque esté cerrado) sí se renderiza.
  if (me === undefined || data === undefined) return <DocumentosSkeleton />;
  if (me === null || data === null || me.rol !== "damnificado" || data.caso === null) {
    return <DocumentosSkeleton />;
  }

  const caso = data.caso;
  const documentos = data.documentos;
  const cerrado = caso.cerrado;

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  // Descartar. Si estaba subiendo, cancela DE VERDAD: aborta el POST y marca el id
  // como cancelado, para que el archivo NO quede subido/registrado (no un falso
  // descarte). Si ya terminó (acuse/error), sólo quita el aviso.
  const descartar = (id: string) => {
    canceladosRef.current.add(id);
    const xhr = xhrsRef.current.get(id);
    if (xhr) {
      xhr.abort();
      xhrsRef.current.delete(id);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  async function subir(item: UploadItem) {
    canceladosRef.current.delete(item.id); // limpiar intento previo (reintento)
    updateItem(item.id, { estado: "subiendo", progreso: 0, error: undefined });
    try {
      const uploadUrl = await generarUploadUrl({ casoId: caso._id });
      // Pudo descartarse durante el round-trip, antes de que exista el XHR.
      if (canceladosRef.current.has(item.id)) return;
      const storageId = await subirConProgreso(
        uploadUrl,
        item.file,
        (p) => updateItem(item.id, { progreso: p }),
        (xhr) => xhrsRef.current.set(item.id, xhr),
      );
      xhrsRef.current.delete(item.id);
      // Descartado justo al terminar de subir: no registrar.
      if (canceladosRef.current.has(item.id)) return;
      await registrar({
        casoId: caso._id,
        storageId: storageId as Id<"_storage">,
        nombreArchivo: item.file.name,
      });
      updateItem(item.id, { estado: "ok", progreso: 100 });
    } catch (err) {
      xhrsRef.current.delete(item.id);
      // Cancelado por el usuario (abort): no es un error a mostrar.
      if (canceladosRef.current.has(item.id)) return;
      updateItem(item.id, {
        estado: "error",
        error: mensajeError(
          err,
          "Este archivo no pudo subirse. Intentá de nuevo o avisá a tu agente.",
        ),
      });
    }
  }

  function agregar(files: FileList | File[]) {
    if (cerrado) return;
    const nuevos: UploadItem[] = Array.from(files).map((file): UploadItem => {
      const id = `u${idSeq.current++}`;
      const problema = validarLocal(file);
      return problema
        ? { id, file, nombre: file.name, tamano: file.size, progreso: 0, estado: "error", error: problema, reintentable: false }
        : { id, file, nombre: file.name, tamano: file.size, progreso: 0, estado: "subiendo", reintentable: true };
    });
    setItems((prev) => [...nuevos, ...prev]);
    nuevos.forEach((it) => {
      if (it.reintentable) void subir(it);
    });
  }

  const abrirPicker = () => inputRef.current?.click();

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button
          type="button"
          onClick={() => router.push(RUTAS.damnificado.miCaso)}
          style={backBtnStyle}
          aria-label="Volver a Mi caso"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 style={tituloStyle}>Mis documentos</h1>
      </div>

      {/* Área de carga (o aviso si el caso está cerrado) */}
      {cerrado ? (
        <Alert variant="info" title="Este caso está cerrado">
          Ya no se pueden subir documentos, pero podés seguir viendo los que cargaste.
        </Alert>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) agregar(e.dataTransfer.files);
          }}
          style={{
            ...dropzoneStyle,
            borderColor: dragging ? "var(--primary-600)" : "var(--border-strong)",
            background: dragging ? "var(--primary-50)" : "var(--bg-surface)",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) agregar(e.target.files);
              e.target.value = "";
            }}
          />
          <span style={dropIconStyle}>
            <UploadCloud size={26} />
          </span>
          <p style={dropTextStyle}>Arrastrá tus archivos acá o</p>
          <Button onClick={abrirPicker} iconLeft={<UploadCloud size={16} />}>
            Subir archivo
          </Button>
          <p style={hintStyle}>
            Podés subir fotos, PDFs o documentos. Máximo 10 MB por archivo.
          </p>
        </div>
      )}

      {/* Estados de subida: en curso, acuse (verde) y error (rojo) */}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => (
            <ItemCarga
              key={it.id}
              item={it}
              onReintentar={() => void subir(it)}
              onDescartar={() => descartar(it.id)}
            />
          ))}
        </div>
      )}

      {/* Lista de documentos cargados */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>Documentos cargados</h2>
          {documentos.length > 0 && (
            <span style={contadorStyle}>
              {documentos.length} archivo{documentos.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {documentos.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <EmptyState
              icon={<FolderOpen size={24} strokeWidth={1.5} />}
              title="Todavía no subiste documentos"
              description="Podés empezar por las fotos del daño o cualquier papel relacionado."
            />
          </div>
        ) : (
          documentos.map((doc) => <DocFila key={doc._id} doc={doc} />)
        )}
      </div>
    </div>
  );
}

// ── Ítem de subida (en curso / acuse / error) ────────────────────
function ItemCarga({
  item,
  onReintentar,
  onDescartar,
}: {
  item: UploadItem;
  onReintentar: () => void;
  onDescartar: () => void;
}) {
  const ok = item.estado === "ok";
  const error = item.estado === "error";
  const borde = ok
    ? "var(--success-200)"
    : error
      ? "var(--danger-200)"
      : "var(--border)";
  const fondo = ok
    ? "var(--success-50)"
    : error
      ? "var(--danger-50)"
      : "var(--bg-surface)";

  return (
    <div style={{ ...itemCardStyle, borderColor: borde, background: fondo }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flexShrink: 0, color: ok ? "var(--success-600)" : error ? "var(--danger-600)" : "var(--text-tertiary)" }}>
          {ok ? <CheckCircle2 size={20} /> : error ? <AlertCircle size={20} /> : <UploadCloud size={20} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={itemNombreStyle}>{item.nombre}</div>
          <div style={itemMetaStyle}>
            {ok
              ? `✓ ${item.nombre} fue recibido correctamente`
              : error
                ? item.error
                : `Subiendo… ${item.progreso}%`}
          </div>
        </div>
        <button
          type="button"
          onClick={onDescartar}
          style={iconBtnStyle}
          aria-label={item.estado === "subiendo" ? "Cancelar subida" : "Descartar"}
        >
          <X size={16} />
        </button>
      </div>

      {item.estado === "subiendo" && (
        <div style={barTrackStyle}>
          <div style={{ ...barFillStyle, width: `${item.progreso}%` }} />
        </div>
      )}

      {error && item.reintentable && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" onClick={onReintentar} iconLeft={<RotateCw size={14} />}>
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Fila de documento ya cargado ─────────────────────────────────
function DocFila({ doc }: { doc: DocItem }) {
  const imagen = esImagen(doc.tipoMime, doc.nombreArchivo);
  const autor = doc.subidoPor === "DAMNIFICADO" ? "Yo" : "El agente";
  const tamano = formatTamano(doc.tamanoBytes);
  const meta = `${formatFecha(doc.creadoEn)} · ${autor}${tamano ? ` · ${tamano}` : ""}`;

  const contenido = (
    <div style={docRowStyle}>
      <span style={iconTileStyle}>
        {imagen ? <ImageIcon size={18} /> : <FileText size={18} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={itemNombreStyle}>{doc.nombreArchivo}</div>
        <div style={itemMetaStyle}>{meta}</div>
      </div>
    </div>
  );

  // Si el documento tiene URL, la fila abre el archivo; si no (legacy), sin link.
  if (doc.url) {
    return (
      <a href={doc.url} target="_blank" rel="noopener noreferrer" style={docLinkStyle}>
        {contenido}
      </a>
    );
  }
  return contenido;
}

// ── Skeleton (carga / redirect pendiente) ────────────────────────
function DocumentosSkeleton() {
  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <Skeleton width={28} height={28} radius="var(--radius-md)" />
        <Skeleton width={160} height={24} />
      </div>
      <Skeleton height={150} radius="var(--radius-lg)" />
      <Skeleton width={180} height={16} />
      <Skeleton height={64} radius="var(--radius-lg)" />
      <Skeleton height={64} radius="var(--radius-lg)" />
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────
const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  padding: "12px 20px 32px",
  background: "var(--bg-page)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  paddingTop: 4,
};

const backBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const tituloStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h2-size)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
};

const dropzoneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  textAlign: "center",
  padding: "28px 20px",
  border: "1.5px dashed var(--border-strong)",
  borderRadius: "var(--radius-lg)",
  transition: "background 120ms, border-color 120ms",
};

const dropIconStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 52,
  height: 52,
  borderRadius: "var(--radius-full)",
  background: "var(--primary-50)",
  color: "var(--primary-600)",
};

const dropTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-body-size)",
  color: "var(--text-secondary)",
};

const hintStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: "var(--text-body-sm-size)",
  color: "var(--text-tertiary)",
  lineHeight: 1.45,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h4-size)",
  fontWeight: 600,
  color: "var(--text-primary)",
};

const contadorStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
};

const itemCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 14px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
};

const itemNombreStyle: CSSProperties = {
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const itemMetaStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: "var(--text-tertiary)",
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const barTrackStyle: CSSProperties = {
  height: 6,
  borderRadius: "var(--radius-full)",
  background: "var(--border)",
  overflow: "hidden",
};

const barFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: "var(--radius-full)",
  background: "var(--primary-600)",
  transition: "width 120ms linear",
};

const iconBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 28,
  height: 28,
  border: "none",
  background: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  borderRadius: "var(--radius-sm)",
};

const docLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
};

const docRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
};

const iconTileStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 40,
  height: 40,
  borderRadius: "var(--radius-md)",
  background: "var(--primary-50)",
  color: "var(--primary-600)",
};
