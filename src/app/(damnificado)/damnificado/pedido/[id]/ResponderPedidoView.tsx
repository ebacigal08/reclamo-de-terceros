"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Loader2,
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
import { Alert, Button, Skeleton } from "@/components/ui";

// Ítem de subida en curso (estado LOCAL). Al completar guarda el `documentoId`
// que devuelve `documentos.registrar`, para enviarlos al confirmar la respuesta.
// (Misma lógica de subida que `DocumentosView` — REC-23; ver follow-up de extraer
// un `CargaArchivos` compartido.)
type UploadItem = {
  id: string;
  file: File;
  nombre: string;
  tamano: number;
  progreso: number; // 0..100
  estado: "subiendo" | "ok" | "error";
  error?: string;
  reintentable: boolean; // false si el rechazo fue pre-subida (tamaño/tipo local)
  documentoId?: Id<"documentos">;
};

const ACCEPT = [...ARCHIVOS_ACEPTADOS, ...EXTENSIONES_ACEPTADAS].join(",");

/** Extrae el mensaje legible de un ConvexError (mismo helper que las otras vistas). */
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
 * Resuelve con el `storageId` que devuelve Convex.
 */
function subirConProgreso(
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

export function ResponderPedidoView({ pedidoId }: { pedidoId: string }) {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const data = useQuery(api.pedidos.get, { pedidoId });
  const generarUploadUrl = useMutation(api.documentos.generarUploadUrl);
  const registrar = useMutation(api.documentos.registrar);
  const responder = useMutation(api.pedidos.responder);

  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirm, setErrorConfirm] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idSeq = useRef(0);
  const xhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const canceladosRef = useRef<Set<string>>(new Set());

  // Guard de acceso: los redirects van SÓLO acá (nunca durante el render).
  // `data === null` cubre "no existe / no es tuyo" → vuelve a Mi caso.
  useEffect(() => {
    if (me === undefined || data === undefined) return;
    if (me === null) {
      router.replace(RUTAS.login);
      return;
    }
    if (me.rol !== "damnificado") {
      router.replace("/");
      return;
    }
    if (data === null) {
      router.replace(RUTAS.damnificado.miCaso);
    }
  }, [me, data, router]);

  // Gating de render (tras los hooks). Mientras carga o hay redirect pendiente,
  // no se muestra la pantalla.
  if (me === undefined || data === undefined) return <PedidoSkeleton />;
  if (me === null || me.rol !== "damnificado" || data === null) return <PedidoSkeleton />;

  const { pedido, caso } = data;
  const cerrado = caso.cerrado;
  const yaRespondido = pedido.respondido;

  // Acuse de recibo (tras responder con éxito). Vuelve solo a Mi caso.
  if (enviado) {
    return (
      <div style={{ ...pageStyle, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <span style={confirmIconStyle}>
          <CheckCircle2 size={34} />
        </span>
        <h1 style={{ ...tituloStyle, marginTop: 16 }}>Tu respuesta fue enviada</h1>
        <p style={textoStyle}>Tu agente ya recibió lo que subiste y va a seguir con tu reclamo.</p>
        <div style={volviendoStyle}>
          <Loader2 size={15} className="animate-spin" /> Volviendo a Mi caso…
        </div>
      </div>
    );
  }

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  // Descartar. Si estaba subiendo, cancela DE VERDAD (aborta el POST). Si ya
  // terminó (acuse/error), sólo quita el aviso. Un documento ya registrado en el
  // caso queda cargado; simplemente no se incluye al confirmar.
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
      if (canceladosRef.current.has(item.id)) return;
      const storageId = await subirConProgreso(
        uploadUrl,
        item.file,
        (p) => updateItem(item.id, { progreso: p }),
        (xhr) => xhrsRef.current.set(item.id, xhr),
      );
      xhrsRef.current.delete(item.id);
      if (canceladosRef.current.has(item.id)) return;
      const { documentoId } = await registrar({
        casoId: caso._id,
        storageId: storageId as Id<"_storage">,
        nombreArchivo: item.file.name,
      });
      updateItem(item.id, { estado: "ok", progreso: 100, documentoId });
    } catch (err) {
      xhrsRef.current.delete(item.id);
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
    if (cerrado || yaRespondido) return;
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

  const hayOk = items.some((it) => it.estado === "ok" && it.documentoId);
  const subiendoAlguno = items.some((it) => it.estado === "subiendo");

  async function confirmar() {
    const documentoIds = items
      .filter((it) => it.estado === "ok" && it.documentoId)
      .map((it) => it.documentoId!);
    if (documentoIds.length === 0) return;
    setConfirmando(true);
    setErrorConfirm(null);
    try {
      await responder({ pedidoId: pedido._id, documentoIds });
      setEnviado(true);
      setTimeout(() => router.replace(RUTAS.damnificado.miCaso), 1800);
    } catch (err) {
      setErrorConfirm(mensajeError(err, "No pudimos enviar tu respuesta. Intentá de nuevo."));
      setConfirmando(false);
    }
  }

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
        <h1 style={tituloStyle}>Responder a tu agente</h1>
      </div>

      {/* El pedido del agente, con su texto exacto */}
      <div style={pedidoCardStyle}>
        <div style={pedidoHeaderStyle}>
          <span style={pedidoIconStyle}>
            <Bell size={16} />
          </span>
          <span style={pedidoLabelStyle}>Tu agente te pidió</span>
        </div>
        <p style={pedidoTextoStyle}>{pedido.descripcion}</p>
      </div>

      {yaRespondido ? (
        <>
          <Alert variant="success" title="Ya respondiste este pedido">
            Tu agente ya recibió lo que enviaste. No necesitás hacer nada más.
          </Alert>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push(RUTAS.damnificado.miCaso)}
          >
            Volver a Mi caso
          </Button>
        </>
      ) : cerrado ? (
        <>
          <Alert variant="info" title="Este caso está cerrado">
            Ya no podés responder pedidos, pero tu agente sigue viendo tu expediente.
          </Alert>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push(RUTAS.damnificado.miCaso)}
          >
            Volver a Mi caso
          </Button>
        </>
      ) : (
        <>
          {/* Área de carga de lo solicitado */}
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
            <p style={dropTextStyle}>Arrastrá lo que te pidieron acá o</p>
            <Button onClick={abrirPicker} iconLeft={<UploadCloud size={16} />}>
              Subir archivo
            </Button>
            <p style={hintStyle}>
              Podés subir fotos, PDFs o documentos. Máximo 10 MB por archivo.
            </p>
          </div>

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

          {errorConfirm && <Alert variant="error">{errorConfirm}</Alert>}

          {/* Confirmar respuesta: habilitado sólo con ≥1 archivo subido */}
          <Button
            fullWidth
            size="lg"
            onClick={() => void confirmar()}
            loading={confirmando}
            disabled={!hayOk || subiendoAlguno}
            iconLeft={<CheckCircle2 size={18} />}
          >
            Confirmar respuesta
          </Button>
          {!hayOk && (
            <p style={hintCenterStyle}>Subí al menos un archivo para poder confirmar.</p>
          )}
        </>
      )}
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
  const borde = ok ? "var(--success-200)" : error ? "var(--danger-200)" : "var(--border)";
  const fondo = ok ? "var(--success-50)" : error ? "var(--danger-50)" : "var(--bg-surface)";

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

// ── Skeleton (carga / redirect pendiente) ────────────────────────
function PedidoSkeleton() {
  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <Skeleton width={36} height={36} radius="var(--radius-md)" />
        <Skeleton width={200} height={24} />
      </div>
      <Skeleton height={96} radius="var(--radius-lg)" />
      <Skeleton height={150} radius="var(--radius-lg)" />
      <Skeleton height={48} radius="var(--radius-md)" />
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

const textoStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-body-size)",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
  maxWidth: 320,
};

const volviendoStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "var(--text-tertiary)",
  marginTop: 14,
  fontSize: "var(--text-body-sm-size)",
};

const confirmIconStyle: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: "var(--radius-full)",
  background: "var(--success-50)",
  color: "var(--success-600)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const pedidoCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "16px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
};

const pedidoHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const pedidoIconStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: "var(--radius-full)",
  background: "var(--primary-50)",
  color: "var(--primary-600)",
};

const pedidoLabelStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const pedidoTextoStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-size)",
  fontWeight: 500,
  color: "var(--text-primary)",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
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

const hintCenterStyle: CSSProperties = {
  margin: "-6px 0 0",
  textAlign: "center",
  fontSize: "var(--text-body-sm-size)",
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
