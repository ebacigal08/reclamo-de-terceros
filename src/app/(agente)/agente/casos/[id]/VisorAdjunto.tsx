"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { esImagen, esPreviewableEnNavegador } from "@/lib/format";
import { descargarArchivo } from "@/lib/descargas";

/**
 * Visor overlay (lightbox) de un adjunto, local a la ficha del caso (REC-75). No
 * usa un Modal del design system porque no existe: es un overlay propio y
 * acotado. Muestra imágenes (`<img>`) y PDF (`<iframe>`) inline; los formatos no
 * previsualizables (HEIC, otros) caen a un mensaje + las acciones del footer, que
 * están SIEMPRE presentes (así un `<iframe>` de PDF que no embeba igual deja
 * salida por "Descargar"/"Abrir en pestaña").
 *
 * `doc.url` es sensible: nunca se loguea ni se muestra en mensajes de error.
 */
export function VisorAdjunto({
  doc,
  onClose,
}: {
  doc: { url: string; nombreArchivo: string; tipoMime: string | null };
  onClose: () => void;
}) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const nombre = doc.nombreArchivo.trim() || "documento";

  // Un único efecto: foco inicial en cerrar, bloqueo de scroll del fondo y cierre
  // con Escape. El cleanup quita el listener y restaura el scroll (sin dejar
  // handlers colgados al abrir/cerrar varias veces).
  useEffect(() => {
    cerrarRef.current?.focus();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onClose]);

  async function handleDescargar() {
    setDescargando(true);
    setError(null);
    try {
      await descargarArchivo(doc.url, nombre);
    } catch {
      // Nunca exponer doc.url. Fallback sugerido: abrir en pestaña.
      setError("No se pudo descargar. Probá de nuevo o abrilo en una pestaña.");
    } finally {
      setDescargando(false);
    }
  }

  const imagen = esImagen(doc.tipoMime, doc.nombreArchivo);
  const previewable = esPreviewableEnNavegador(doc.tipoMime, doc.nombreArchivo);
  const mostrarImagen = previewable && imagen;
  const mostrarPdf = previewable && !imagen;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa de ${nombre}`}
      style={backdropStyle}
      onClick={onClose}
    >
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={tituloStyle} title={nombre}>
            {nombre}
          </span>
          <button
            ref={cerrarRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            style={cerrarBtnStyle}
          >
            <X size={18} />
          </button>
        </div>

        <div style={cuerpoStyle}>
          {mostrarImagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.url} alt={nombre} style={imgStyle} />
          ) : mostrarPdf ? (
            <iframe src={doc.url} title={nombre} style={iframeStyle} />
          ) : (
            <div style={noPreviewStyle}>
              Este formato no se puede previsualizar acá. Descargalo o abrilo en una pestaña.
            </div>
          )}
        </div>

        <div style={footerStyle}>
          {error && <Alert variant="error">{error}</Alert>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {/* `<a>` estilado como botón secundario: un `<button>` dentro de un
                `<a>` sería HTML inválido (interactivo anidado). */}
            <a href={doc.url} target="_blank" rel="noopener noreferrer" style={abrirLinkStyle}>
              <ExternalLink size={16} />
              Abrir en pestaña
            </a>
            <Button
              variant="primary"
              size="sm"
              loading={descargando}
              iconLeft={<Download size={16} />}
              onClick={handleDescargar}
            >
              Descargar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const panelStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg)",
  width: "100%",
  maxWidth: 680,
  maxHeight: "88vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 16px",
  borderBottom: "1px solid var(--divider)",
};

const tituloStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 700,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cerrarBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 32,
  height: 32,
  border: "none",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
  borderRadius: "var(--radius-sm)",
};

const cuerpoStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "var(--bg-inset)",
};

const imgStyle: CSSProperties = {
  maxWidth: "100%",
  maxHeight: "68vh",
  objectFit: "contain",
  display: "block",
  borderRadius: "var(--radius-sm)",
};

const iframeStyle: CSSProperties = {
  width: "100%",
  height: "70vh",
  border: "none",
  background: "#fff",
};

const noPreviewStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  color: "var(--text-secondary)",
  textAlign: "center",
  padding: "32px 16px",
  maxWidth: 360,
};

const footerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 16px",
  borderTop: "1px solid var(--divider)",
};

// Espeja el look del Button secundario (sm), porque `Button` no es polimórfico
// (siempre renderiza `<button>`) y "Abrir en pestaña" tiene que ser un `<a>`.
const abrirLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  textDecoration: "none",
  whiteSpace: "nowrap",
};
