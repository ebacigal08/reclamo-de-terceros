"use client";

import { CSSProperties, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Badge } from "@/components/ui";
import { TIPO_DOCUMENTO_LABEL } from "@convex/tiposDocumento";
import { ACCEPT_ARCHIVOS, subirArchivo, validarLocal } from "@/lib/subirArchivo";

type Hub = NonNullable<FunctionReturnType<typeof api.casos.miCaso>>;
type Item = Hub["itemsDocumentacion"][number];

type SubidaEstado = { progreso: number; estado: "subiendo" | "error"; error?: string };

function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

/** Label del ítem: tipos estándar usan su nombre; OTROS usa la etiqueta del agente. */
function etiquetaDe(item: Item): string {
  return item.tipoDocumento === "OTROS"
    ? item.etiqueta || "Otro documento"
    : TIPO_DOCUMENTO_LABEL[item.tipoDocumento];
}

/**
 * Sección "Documentación que te pidieron" del hub del damnificado (REC-77). Es el
 * checklist tipado que armó el agente: cada ítem se cumple subiendo un archivo
 * contra él (pasa a "recibido"). Se DIFERENCIA de "Mis documentos" (subida
 * general, libre): acá subís exactamente lo que te pidieron, por ítem.
 *
 * Sólo se muestra si hay ítems. Read-only si el caso está cerrado.
 */
export function ChecklistSection({
  casoId,
  items,
  cerrado,
}: {
  casoId: Id<"casos">;
  items: Item[];
  cerrado: boolean;
}) {
  const generarUploadUrl = useMutation(api.documentos.generarUploadUrl);
  const registrar = useMutation(api.documentos.registrar);

  const [subidas, setSubidas] = useState<Record<string, SubidaEstado>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const itemObjetivoRef = useRef<Id<"itemsDocumentacion"> | null>(null);

  if (items.length === 0) return null;

  const recibidos = items.filter((i) => i.recibido).length;

  function pedirArchivo(itemId: Id<"itemsDocumentacion">) {
    itemObjetivoRef.current = itemId;
    inputRef.current?.click();
  }

  async function subir(file: File, itemId: Id<"itemsDocumentacion">) {
    const problema = validarLocal(file);
    if (problema) {
      setSubidas((s) => ({ ...s, [itemId]: { progreso: 0, estado: "error", error: problema } }));
      return;
    }
    setSubidas((s) => ({ ...s, [itemId]: { progreso: 0, estado: "subiendo" } }));
    try {
      await subirArchivo(
        { generarUploadUrl, registrar },
        {
          casoId,
          file,
          itemId,
          onProgress: (p) =>
            setSubidas((s) => ({ ...s, [itemId]: { progreso: p, estado: "subiendo" } })),
        },
      );
      setSubidas((s) => {
        const n = { ...s };
        delete n[itemId];
        return n;
      });
    } catch (err) {
      setSubidas((s) => ({
        ...s,
        [itemId]: { progreso: 0, estado: "error", error: mensajeError(err, "No se pudo subir. Probá de nuevo.") },
      }));
    }
  }

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Documentación que te pidieron</h2>
      <p style={subtituloStyle}>
        Subí acá exactamente lo que te pidió tu agente. Ya llevás {recibidos} de {items.length}.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ARCHIVOS}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          const target = itemObjetivoRef.current;
          if (f && target) void subir(f, target);
          e.target.value = "";
          itemObjetivoRef.current = null;
        }}
      />

      {cerrado && (
        <div style={{ marginBottom: 12 }}>
          <Alert variant="info">Tu caso está cerrado; ya no podés subir documentación.</Alert>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item) => {
          const sub = subidas[item._id];
          return (
            <div key={item._id} style={itemCardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-word" }}>
                    {etiquetaDe(item)}
                  </div>
                </div>
                <Badge variant={item.recibido ? "respondido" : "pendiente"}>
                  {item.recibido ? "Recibido" : "Pendiente"}
                </Badge>
              </div>

              {item.documentos.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {item.documentos.map((doc) =>
                    doc.url ? (
                      <a key={doc._id} href={doc.url} target="_blank" rel="noopener noreferrer" style={docLinkStyle}>
                        <FileText size={14} style={{ flexShrink: 0 }} />
                        <span style={docNombreStyle}>{doc.nombreArchivo}</span>
                      </a>
                    ) : (
                      <span key={doc._id} style={docLinkStyle}>
                        <FileText size={14} style={{ flexShrink: 0 }} />
                        <span style={docNombreStyle}>{doc.nombreArchivo}</span>
                      </span>
                    ),
                  )}
                </div>
              )}

              {sub?.estado === "subiendo" && (
                <div style={barTrackStyle}>
                  <div style={{ ...barFillStyle, width: `${sub.progreso}%` }} />
                </div>
              )}
              {sub?.estado === "error" && (
                <div style={{ fontSize: 12, color: "var(--danger-600)" }}>{sub.error}</div>
              )}

              {!cerrado && (
                <button
                  type="button"
                  onClick={() => pedirArchivo(item._id)}
                  disabled={sub?.estado === "subiendo"}
                  style={subirBtnStyle}
                >
                  {sub?.estado === "subiendo" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Subiendo…
                    </>
                  ) : item.recibido ? (
                    <>
                      <UploadCloud size={16} /> Subir otro archivo
                    </>
                  ) : (
                    <>
                      <UploadCloud size={16} /> Subir archivo
                    </>
                  )}
                </button>
              )}
              {cerrado && item.recibido && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--success-700)" }}>
                  <CheckCircle2 size={14} /> Recibido
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = { padding: "24px 20px 0" };

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h4-size)",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const subtituloStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "var(--text-body-sm-size)",
  color: "var(--text-tertiary)",
  lineHeight: 1.45,
};

const itemCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 16,
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-sm)",
};

const docLinkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "var(--text-link)",
  fontSize: "var(--text-body-sm-size)",
  textDecoration: "none",
};

const docNombreStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const subirBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  alignSelf: "flex-start",
  padding: "9px 14px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  cursor: "pointer",
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
