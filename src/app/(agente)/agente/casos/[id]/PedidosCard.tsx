"use client";

import { CSSProperties, useState } from "react";
import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { Download, Eye, FileText, Loader2, Plus, Send } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Badge, Button } from "@/components/ui";
import { RUTAS } from "@/lib/constants";
import { descargarArchivo } from "@/lib/descargas";
import { formatFecha } from "@/lib/format";
import { CenteredEmpty, SectionCard } from "./fichaUi";
import { VisorAdjunto } from "./VisorAdjunto";

/**
 * REC-24 · REC-80 · Card "Pedidos de documentación" de la ficha del agente:
 * cada pedido con su estado y, si fue respondido, los archivos que lo responden.
 *
 * Salió de `FichaCasoView` cuando dejó de ser una lista read-only (REC-80 le
 * suma visor y descarga, o sea estado). Como `PlazosCard`, NO abre query propia:
 * los pedidos ya vienen proyectados por `casos.get` (`caso.pedidos`, live) y se
 * reciben por prop — una segunda suscripción a los mismos datos no compra nada.
 *
 * El estado de preview/descarga es ÚNICO a nivel card (molde `DocumentosCard`):
 * un solo visor abierto y un solo error a la vez, sin duplicar overlays por fila.
 *
 * Ver/descargar son LECTURAS → no se gatean por `cerrado` ("cerrado = congelado"
 * aplica a las escrituras del agente); el guard de dueño ya lo hizo `casos.get`.
 * Lo que sí desaparece con el caso cerrado es "Nuevo pedido".
 */

type Pedido = NonNullable<FunctionReturnType<typeof api.casos.get>>["pedidos"][number];
type Adjunto = Pedido["documentos"][number];

export function PedidosCard({
  casoId,
  pedidos,
  cerrado,
}: {
  casoId: Id<"casos">;
  pedidos: Pedido[];
  cerrado: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Adjunto | null>(null);
  const [descargandoId, setDescargandoId] = useState<Adjunto["_id"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function descargar(doc: Adjunto) {
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
        title="Pedidos de documentación"
        right={
          cerrado ? undefined : (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Plus size={14} />}
              onClick={() => router.push(RUTAS.agente.solicitar(casoId))}
            >
              Nuevo pedido
            </Button>
          )
        }
      >
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        {pedidos.length ? (
          <div>
            {pedidos.map((p) => (
              <PedidoRow
                key={p._id}
                pedido={p}
                descargandoId={descargandoId}
                onVer={setPreview}
                onDescargar={descargar}
              />
            ))}
          </div>
        ) : (
          <CenteredEmpty
            icon={<Send size={22} strokeWidth={1.5} />}
            title="Sin pedidos activos"
            description="Cuando le pidas documentación al damnificado, el estado del pedido va a aparecer acá."
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

function PedidoRow({
  pedido,
  descargandoId,
  onVer,
  onDescargar,
}: {
  pedido: Pedido;
  descargandoId: Adjunto["_id"] | null;
  onVer: (doc: Adjunto) => void;
  onDescargar: (doc: Adjunto) => void;
}) {
  return (
    <div style={filaStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-primary)" }}>
            {pedido.descripcion}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 1 }}>
            Enviado {formatFecha(pedido.creadoEn)}
            {pedido.respondido && pedido.respondidoEn ? ` · Respondido ${formatFecha(pedido.respondidoEn)}` : ""}
          </div>
        </div>
        <Badge variant={pedido.respondido ? "respondido" : "pendiente"}>
          {pedido.respondido ? "Respondido" : "Pendiente"}
        </Badge>
      </div>

      {/* Lo que el damnificado mandó para ESTE pedido (REC-80). Vacío en los
          pendientes y en los respondidos antes de REC-80 (el vínculo no se
          guardaba): ahí no se pinta nada, para no ensuciar el histórico. */}
      {pedido.documentos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, paddingLeft: 4 }}>
          {pedido.documentos.map((doc) => (
            <div key={doc._id} style={docRowStyle}>
              <FileText size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              <span style={docNombreStyle}>{doc.nombreArchivo}</span>
              {doc.url && (
                <>
                  <button
                    type="button"
                    onClick={() => onVer(doc)}
                    title="Ver"
                    aria-label={`Ver ${doc.nombreArchivo}`}
                    style={miniBtnStyle}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDescargar(doc)}
                    disabled={descargandoId === doc._id}
                    title="Descargar"
                    aria-label={`Descargar ${doc.nombreArchivo}`}
                    style={miniBtnStyle}
                  >
                    {descargandoId === doc._id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Download size={15} />
                    )}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const filaStyle: CSSProperties = {
  padding: "11px 0",
  borderBottom: "1px solid var(--divider)",
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
