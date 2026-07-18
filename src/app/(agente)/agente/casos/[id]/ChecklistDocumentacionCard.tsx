"use client";

import { CSSProperties, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  Download,
  Eye,
  FileText,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  DOC_ETIQUETA_MAX,
  GRUPOS_DOCUMENTO,
  TIPOS_DOCUMENTO,
  TIPO_DOCUMENTO_LABEL,
  type TipoDocumento,
} from "@convex/tiposDocumento";
import { Alert, Badge, Button, Checkbox, Input } from "@/components/ui";
import { descargarArchivo } from "@/lib/descargas";
import { ACCEPT_ARCHIVOS, subirArchivo, validarLocal } from "@/lib/subirArchivo";
import { CenteredEmpty, SectionCard } from "./fichaUi";
import { VisorAdjunto } from "./VisorAdjunto";

// Deriva del retorno de `casos.get` → siempre en sync con el backend.
type Item = NonNullable<FunctionReturnType<typeof api.casos.get>>["itemsDocumentacion"][number];
type DocItem = Item["documentos"][number];

/** Estado transitorio de una subida por ítem (el éxito lo refleja la live query). */
type SubidaEstado = { progreso: number; estado: "subiendo" | "error"; error?: string };

function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

function etiquetaDe(item: Item): string {
  return item.tipoDocumento === "OTROS"
    ? item.etiqueta || "Otro documento"
    : TIPO_DOCUMENTO_LABEL[item.tipoDocumento];
}

/**
 * Card "Checklist de documentación" de la ficha del agente (REC-77). El agente
 * arma la lista de documentos tipados (`agregar`), ve el estado pendiente/recibido
 * (derivado de si hay archivos vinculados) y puede subir un archivo contra un ítem
 * (o quitar un ítem pendiente). El damnificado sube desde "Mi caso".
 *
 * Ver/descargar son LECTURAS → no se gatean por `cerrado`; agregar/subir/quitar sí.
 */
export function ChecklistDocumentacionCard({
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
  const agregar = useMutation(api.itemsDocumentacion.agregar);
  const quitar = useMutation(api.itemsDocumentacion.quitar);

  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<TipoDocumento>>(new Set());
  const [otros, setOtros] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorAgregar, setErrorAgregar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [preview, setPreview] = useState<{ url: string; nombreArchivo: string; tipoMime: string | null } | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [subidas, setSubidas] = useState<Record<string, SubidaEstado>>({});
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
  const [errorItem, setErrorItem] = useState<{ id: string; msg: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemObjetivoRef = useRef<Id<"itemsDocumentacion"> | null>(null);

  const tiposPresentes = new Set(
    items.filter((i) => i.tipoDocumento !== "OTROS").map((i) => i.tipoDocumento),
  );
  const recibidos = items.filter((i) => i.recibido).length;

  function toggle(value: TipoDocumento, checked: boolean) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  async function onAgregar() {
    const base = [...seleccion].map((t) => ({ tipoDocumento: t }));
    const otrosTrim = otros.trim();
    const payload = otrosTrim
      ? [...base, { tipoDocumento: "OTROS" as const, etiqueta: otrosTrim }]
      : base;
    if (payload.length === 0) return;
    setGuardando(true);
    setErrorAgregar(null);
    setAviso(null);
    try {
      const r = await agregar({ casoId, items: payload });
      if (r.insertados === 0) {
        setAviso("Esos documentos ya estaban en la checklist.");
      } else {
        setSeleccion(new Set());
        setOtros("");
        setAbierto(false);
      }
    } catch (err) {
      setErrorAgregar(mensajeError(err, "No se pudieron agregar. Probá de nuevo."));
    } finally {
      setGuardando(false);
    }
  }

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
      // Éxito: la live query marca el ítem como recibido y lista el archivo.
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

  async function onQuitar(itemId: Id<"itemsDocumentacion">) {
    setQuitandoId(itemId);
    setErrorItem(null);
    try {
      await quitar({ itemId });
    } catch (err) {
      setErrorItem({ id: itemId, msg: mensajeError(err, "No se pudo quitar.") });
    } finally {
      setQuitandoId(null);
    }
  }

  async function descargar(doc: DocItem, itemId: Id<"itemsDocumentacion">) {
    if (!doc.url) return;
    setDescargandoId(doc._id);
    setErrorItem(null);
    try {
      await descargarArchivo(doc.url, doc.nombreArchivo);
    } catch {
      // El error se asocia al ÍTEM (no a doc._id): así se muestra en la fila, que
      // se pinta por `errorItem?.id === item._id`.
      setErrorItem({ id: itemId, msg: "No se pudo descargar. Probá de nuevo o abrilo en una pestaña." });
    } finally {
      setDescargandoId(null);
    }
  }

  return (
    <>
      <SectionCard
        title="Checklist de documentación"
        right={
          items.length > 0 ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
              {recibidos}/{items.length} recibidos
            </span>
          ) : undefined
        }
      >
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

        {items.length === 0 && !abierto ? (
          <CenteredEmpty
            icon={<ListChecks size={24} strokeWidth={1.5} />}
            title="Sin documentos pedidos"
            description="Agregá los documentos que necesitás del damnificado; cada uno queda pendiente hasta que se suba el archivo."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((item, i) => {
              const sub = subidas[item._id];
              const err = errorItem?.id === item._id ? errorItem.msg : null;
              return (
                <div
                  key={item._id}
                  style={{ padding: "11px 0", borderBottom: i === items.length - 1 ? "none" : "1px solid var(--divider)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-word" }}>
                        {etiquetaDe(item)}
                      </div>
                    </div>
                    <Badge variant={item.recibido ? "respondido" : "pendiente"}>
                      {item.recibido ? "Recibido" : "Pendiente"}
                    </Badge>
                    {!cerrado && (
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => pedirArchivo(item._id)}
                          disabled={sub?.estado === "subiendo"}
                          title="Subir un archivo para este documento"
                          aria-label={`Subir archivo para ${etiquetaDe(item)}`}
                          style={accionBtnStyle}
                        >
                          {sub?.estado === "subiendo" ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                        </button>
                        {!item.recibido && (
                          <button
                            type="button"
                            onClick={() => void onQuitar(item._id)}
                            disabled={quitandoId === item._id}
                            title="Quitar de la checklist"
                            aria-label={`Quitar ${etiquetaDe(item)}`}
                            style={accionBtnStyle}
                          >
                            {quitandoId === item._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Archivos vinculados */}
                  {item.documentos.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, paddingLeft: 4 }}>
                      {item.documentos.map((doc) => (
                        <div key={doc._id} style={docRowStyle}>
                          <FileText size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                          <span style={docNombreStyle}>{doc.nombreArchivo}</span>
                          {doc.url && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPreview({ url: doc.url!, nombreArchivo: doc.nombreArchivo, tipoMime: doc.tipoMime })}
                                title="Ver"
                                aria-label={`Ver ${doc.nombreArchivo}`}
                                style={miniBtnStyle}
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void descargar(doc, item._id)}
                                disabled={descargandoId === doc._id}
                                title="Descargar"
                                aria-label={`Descargar ${doc.nombreArchivo}`}
                                style={miniBtnStyle}
                              >
                                {descargandoId === doc._id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {sub?.estado === "subiendo" && (
                    <div style={{ marginTop: 8 }}>
                      <div style={barTrackStyle}>
                        <div style={{ ...barFillStyle, width: `${sub.progreso}%` }} />
                      </div>
                    </div>
                  )}
                  {sub?.estado === "error" && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--danger-600)" }}>{sub.error}</div>
                  )}
                  {err && <div style={{ marginTop: 6, fontSize: 12, color: "var(--danger-600)" }}>{err}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Selector para agregar documentos (inline; no hay Modal en el DS) */}
        {!cerrado && abierto && (
          <div style={pickerStyle}>
            {GRUPOS_DOCUMENTO.map((g) => (
              <div key={g.value} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={grupoLabelStyle}>{g.label}</div>
                {TIPOS_DOCUMENTO.filter((t) => t.grupo === g.value && t.value !== "OTROS").map((t) => {
                  const yaEsta = tiposPresentes.has(t.value);
                  return (
                    <Checkbox
                      key={t.value}
                      label={yaEsta ? `${t.label} — ya agregado` : t.label}
                      checked={yaEsta || seleccion.has(t.value)}
                      disabled={yaEsta || guardando}
                      onChange={(e) => toggle(t.value, e.target.checked)}
                    />
                  );
                })}
                {g.value === "adicional" && (
                  <Input
                    label="Otro documento (especificá)"
                    value={otros}
                    maxLength={DOC_ETIQUETA_MAX}
                    placeholder="Ej: Acta de constatación"
                    disabled={guardando}
                    onChange={(e) => setOtros(e.target.value)}
                  />
                )}
              </div>
            ))}
            {errorAgregar && <Alert variant="error">{errorAgregar}</Alert>}
            {aviso && <Alert variant="info">{aviso}</Alert>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button
                variant="ghost"
                disabled={guardando}
                onClick={() => {
                  setAbierto(false);
                  setSeleccion(new Set());
                  setOtros("");
                  setErrorAgregar(null);
                  setAviso(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={guardando}
                disabled={seleccion.size === 0 && otros.trim().length === 0}
                onClick={() => void onAgregar()}
                iconLeft={<Plus size={16} />}
              >
                Agregar
              </Button>
            </div>
          </div>
        )}

        {!cerrado && !abierto && (
          <div style={{ marginTop: items.length > 0 ? 12 : 8 }}>
            <Button variant="secondary" size="sm" iconLeft={<Plus size={14} />} onClick={() => setAbierto(true)}>
              Agregar documentos
            </Button>
          </div>
        )}
      </SectionCard>

      {preview && <VisorAdjunto doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

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

const miniBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 26,
  height: 26,
  border: "none",
  background: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  borderRadius: "var(--radius-sm)",
};

const docRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const docNombreStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 12,
  color: "var(--text-secondary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pickerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  marginTop: 14,
  padding: "14px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
};

const grupoLabelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-tertiary)",
  fontWeight: 600,
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
