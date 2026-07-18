"use client";

import { CSSProperties, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { Download, Eye, FileText, FolderOpen, Image as ImageIcon, Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Alert } from "@/components/ui";
import { esImagen, esPreviewableEnNavegador, formatFecha, formatTamano } from "@/lib/format";
import { descargarArchivo } from "@/lib/descargas";
import { CenteredEmpty, SectionCard } from "./fichaUi";
import { VisorAdjunto } from "./VisorAdjunto";

// Deriva del retorno de `casos.get` → siempre en sync con el backend, sin importar
// el tipo desde `FichaCasoView` (evita el ciclo ficha → card → ficha).
type Doc = NonNullable<FunctionReturnType<typeof api.casos.get>>["documentos"][number];

/**
 * Card "Documentos y evidencias" de la ficha del agente (REC-75). Deja
 * previsualizar (imágenes/PDF en un visor overlay) y descargar cada adjunto con
 * su nombre original. El estado de preview/descarga es **único a nivel card**
 * (`preview`, `descargandoId`): un solo visor a la vez y un solo error, sin
 * duplicar overlays por fila.
 *
 * Ver/descargar son LECTURAS → no se gatean por `caso.cerrado` ("cerrado =
 * congelado" aplica sólo a las escrituras del agente). El guard de dueño ya lo
 * hizo `casos.get`, que sólo expone estos documentos al agente dueño.
 */
export function DocumentosCard({
  documentos,
  damnificadoNombre,
}: {
  documentos: Doc[];
  damnificadoNombre: string;
}) {
  const [preview, setPreview] = useState<Doc | null>(null);
  const [descargandoId, setDescargandoId] = useState<Doc["_id"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function descargar(doc: Doc) {
    if (!doc.url) return;
    setDescargandoId(doc._id);
    setError(null);
    try {
      await descargarArchivo(doc.url, doc.nombreArchivo);
    } catch {
      // Nunca exponer doc.url. Error acotado a la card, sin tumbar la ficha.
      setError("No se pudo descargar el archivo. Probá de nuevo o abrilo en una pestaña.");
    } finally {
      setDescargandoId(null);
    }
  }

  return (
    <>
      <SectionCard
        title="Documentos y evidencias"
        right={
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
            {documentos.length} archivo{documentos.length === 1 ? "" : "s"}
          </span>
        }
      >
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        {documentos.length ? (
          <div>
            {documentos.map((doc) => (
              <DocRow
                key={doc._id}
                doc={doc}
                damnificadoNombre={damnificadoNombre}
                descargando={descargandoId === doc._id}
                onVer={() => setPreview(doc)}
                onDescargar={() => descargar(doc)}
              />
            ))}
          </div>
        ) : (
          <CenteredEmpty
            icon={<FolderOpen size={24} strokeWidth={1.5} />}
            title="Sin documentos todavía"
            description="Cuando el damnificado suba archivos o vos los cargues, van a aparecer acá."
          />
        )}
      </SectionCard>

      {preview?.url && (
        <VisorAdjunto
          doc={{ url: preview.url, nombreArchivo: preview.nombreArchivo, tipoMime: preview.tipoMime }}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

function DocRow({
  doc,
  damnificadoNombre,
  descargando,
  onVer,
  onDescargar,
}: {
  doc: Doc;
  damnificadoNombre: string;
  descargando: boolean;
  onVer: () => void;
  onDescargar: () => void;
}) {
  const por = doc.subidoPor === "AGENTE" ? "vos" : damnificadoNombre || "el damnificado";
  const tamano = formatTamano(doc.tamanoBytes);
  const meta = `${formatFecha(doc.creadoEn)} · Subido por ${por}${tamano ? ` · ${tamano}` : ""}`;
  const nombre = doc.nombreArchivo.trim() || "documento";
  const imagen = esImagen(doc.tipoMime, doc.nombreArchivo);
  const previewable = !!doc.url && esPreviewableEnNavegador(doc.tipoMime, doc.nombreArchivo);
  const miniatura = previewable && imagen; // JPG/PNG con url → thumbnail real

  return (
    <div style={filaStyle}>
      {miniatura ? (
        <button type="button" onClick={onVer} aria-label={`Ver ${nombre}`} style={miniBtnStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={doc.url!} alt="" loading="lazy" style={miniImgStyle} />
        </button>
      ) : (
        <span style={iconTileStyle}>{imagen ? <ImageIcon size={17} /> : <FileText size={17} />}</span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--text-body-sm-size)",
            fontWeight: 600,
            color: "var(--text-primary)",
            wordBreak: "break-word",
          }}
        >
          {nombre}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{meta}</div>
      </div>

      {doc.url && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {/* "Ver" para TODO doc.url: el visor decide si pinta imagen/PDF o cae al
              mensaje "no se puede previsualizar" + salida (Descargar / Abrir en
              pestaña). Así ningún adjunto queda sin fallback si la descarga falla. */}
          <button type="button" onClick={onVer} aria-label={`Ver ${nombre}`} title="Ver" style={accionBtnStyle}>
            <Eye size={17} />
          </button>
          <button
            type="button"
            onClick={onDescargar}
            disabled={descargando}
            aria-label={`Descargar ${nombre}`}
            title="Descargar"
            style={{
              ...accionBtnStyle,
              cursor: descargando ? "default" : "pointer",
              opacity: descargando ? 0.6 : 1,
            }}
          >
            {descargando ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
          </button>
        </div>
      )}
    </div>
  );
}

const filaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid var(--divider)",
};

const iconTileStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "var(--radius-md)",
  background: "var(--primary-50)",
  color: "var(--primary-600)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const miniBtnStyle: CSSProperties = {
  width: 34,
  height: 34,
  padding: 0,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  cursor: "pointer",
  flexShrink: 0,
  background: "var(--bg-surface)",
  display: "block",
};

const miniImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const accionBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 32,
  height: 32,
  border: "none",
  background: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  borderRadius: "var(--radius-sm)",
};
