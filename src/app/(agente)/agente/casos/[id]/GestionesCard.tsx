"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  ClipboardList,
  type LucideIcon,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Button, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { GESTION_MAX_DESCRIPCION, TIPOS_GESTION, type TipoGestion } from "@/lib/constants";
import { formatFecha, hoyLocalISO } from "@/lib/format";
import { CenteredEmpty, SectionCard, fechaLocal } from "./fichaUi";

/**
 * REC-32 · Card "Historial de gestiones" dentro de la ficha del caso.
 *
 * Autocontenida, igual que RespuestasAseguradoraCard (REC-31): hace su PROPIA
 * query —no cuelga de `casos.get`, que es dual-rol y no debe ver esta tabla— y
 * maneja su estado, su carga y sus errores. La ficha sólo la compone.
 *
 * Lo que esta card agrega respecto de REC-31 es EDITAR y ELIMINAR:
 * - Editar reusa el MISMO form colapsable, en modo "Editando gestión" prefilled
 *   (`editandoId`). La alternativa —un form embebido en cada fila— duplicaría el
 *   formulario entero y haría saltar el layout de la lista.
 * - Eliminar confirma INLINE en la fila (no hay Modal en el design system).
 */

type Gestion = NonNullable<FunctionReturnType<typeof api.gestiones.listPorCaso>>[number];

// Ícono por tipo. Vive acá y no en constants.ts, que es data de dominio y no
// importa React. Los 5 tipos son categorías de canal → se distinguen por forma,
// no por color (ver el comentario de TIPOS_GESTION).
const ICONO_GESTION: Record<string, LucideIcon> = {
  LLAMADA: Phone,
  CORREO: Mail,
  PRESENTACION: Send,
  REUNION: Users,
  OTRO: MoreHorizontal,
};

const tipoLabel = (v: string) => TIPOS_GESTION.find((t) => t.value === v)?.label ?? v;

/** Extrae el mensaje legible de un ConvexError (mismo helper que la ficha). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

export function GestionesCard({
  casoId,
  cerrado,
}: {
  casoId: Id<"casos">;
  cerrado: boolean;
}) {
  const gestiones = useQuery(api.gestiones.listPorCaso, { casoId });
  const registrar = useMutation(api.gestiones.registrar);
  const editar = useMutation(api.gestiones.editar);

  const [abierto, setAbierto] = useState(false);
  // null = alta. Con id = estamos corrigiendo ESA gestión, con el mismo form.
  const [editandoId, setEditandoId] = useState<Id<"gestiones"> | null>(null);
  const [tipo, setTipo] = useState<TipoGestion | "">("");
  const [fechaGestion, setFechaGestion] = useState(hoyLocalISO());
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cerrarForm = () => {
    setAbierto(false);
    setEditandoId(null);
    setTipo("");
    setFechaGestion(hoyLocalISO());
    setDescripcion("");
    setError(null);
  };

  const abrirEdicion = (g: Gestion) => {
    setEditandoId(g._id);
    setTipo(g.tipo as TipoGestion);
    setFechaGestion(g.fechaGestion);
    setDescripcion(g.descripcion);
    setError(null);
    setAbierto(true);
  };

  // Si la gestión que estamos editando desaparece (otra pestaña la borró), el
  // form quedaría con un `editandoId` colgado que sólo falla al guardar. La
  // cerramos y avisamos.
  useEffect(() => {
    if (!editandoId || !gestiones) return;
    if (!gestiones.some((g) => g._id === editandoId)) {
      cerrarForm();
      setError("La gestión que estabas editando ya no existe.");
    }
  }, [editandoId, gestiones]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    // Guards de cliente (el server valida lo mismo; esto sólo evita el round-trip).
    if (!tipo) return setError("Elegí el tipo de gestión.");
    if (!descripcion.trim()) return setError("Escribí qué gestión hiciste.");

    setGuardando(true);
    setError(null);
    try {
      if (editandoId) {
        await editar({ gestionId: editandoId, tipo, descripcion, fechaGestion });
      } else {
        await registrar({ casoId, tipo, descripcion, fechaGestion });
      }
      // El acuse es la live query: la fila aparece o se actualiza sola.
      cerrarForm();
    } catch (err) {
      setError(
        mensajeError(
          err,
          editandoId
            ? "No pudimos guardar los cambios. Intentá de nuevo."
            : "No pudimos registrar la gestión. Intentá de nuevo.",
        ),
      );
    } finally {
      setGuardando(false);
    }
  }

  // El índice devuelve ASC; mostramos la más reciente arriba (lo pide el issue)
  // sobre una COPIA, sin mutar el array de la query. En el empate de misma fecha
  // esto deja arriba la última que cargó el agente: deliberado (ver el comentario
  // del índice `by_caso_fecha` en convex/schema.ts).
  const historial = gestiones ? [...gestiones].reverse() : [];

  return (
    <SectionCard
      title="Historial de gestiones"
      right={
        cerrado ? (
          gestiones?.length ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
              {gestiones.length} gestión{gestiones.length === 1 ? "" : "es"}
            </span>
          ) : undefined
        ) : abierto ? undefined : (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Plus size={14} />}
            onClick={() => setAbierto(true)}
          >
            Registrar gestión
          </Button>
        )
      }
    >
      {abierto && !cerrado && (
        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 14,
            marginBottom: 16,
            background: "var(--bg-inset)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {editandoId && (
            <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 700, color: "var(--text-primary)" }}>
              Editando gestión
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <Select
              label="Tipo de gestión"
              placeholder="Elegí una opción…"
              options={TIPOS_GESTION}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoGestion);
                if (error) setError(null);
              }}
              disabled={guardando}
            />
            <Input
              type="date"
              label="Fecha en que ocurrió"
              value={fechaGestion}
              // Defensa en profundidad, no frontera: el guard real de "no futura"
              // está en el server, contra el hoy argentino.
              max={hoyLocalISO()}
              onChange={(e) => {
                setFechaGestion(e.target.value);
                if (error) setError(null);
              }}
              disabled={guardando}
            />
          </div>

          <Textarea
            label="¿Qué hiciste?"
            rows={4}
            maxLength={GESTION_MAX_DESCRIPCION}
            showCount
            placeholder="Ej: Llamé al perito de la aseguradora. Confirma la inspección para el jueves 17 a las 10."
            value={descripcion}
            onChange={(e) => {
              setDescripcion(e.target.value);
              if (error) setError(null);
            }}
            disabled={guardando}
          />

          {error && <Alert variant="error">{error}</Alert>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="ghost" size="sm" onClick={cerrarForm} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={guardando}>
              {editandoId ? "Guardar cambios" : "Guardar gestión"}
            </Button>
          </div>
        </form>
      )}

      {/* Error suelto (ej. la gestión en edición se borró desde otra pestaña),
          cuando el form ya no está en pantalla para mostrarlo. */}
      {error && !abierto && (
        <div style={{ marginBottom: 12 }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {gestiones === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton width="35%" height={12} />
          <Skeleton width="85%" height={12} />
        </div>
      ) : gestiones === null ? (
        // Fail-closed. En la práctica sólo una race: si la ficha renderizó, el
        // agente ya es dueño del caso.
        <div style={{ padding: "10px 0", fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>
          No pudimos cargar las gestiones.
        </div>
      ) : historial.length ? (
        <div>
          {historial.map((g) => (
            <GestionRow
              key={g._id}
              gestion={g}
              cerrado={cerrado}
              enEdicion={editandoId === g._id}
              onEditar={() => abrirEdicion(g)}
            />
          ))}
        </div>
      ) : (
        <CenteredEmpty
          icon={<ClipboardList size={22} strokeWidth={1.5} />}
          title="Sin gestiones registradas"
          description="Anotá acá cada llamada, correo, presentación o reunión que hagas por este caso."
        />
      )}
    </SectionCard>
  );
}

/**
 * Una fila del log. Se encarga ELLA de su propio borrado (mutation + confirmación
 * + estado de carga): así el contenedor no necesita un `Map<id, loading>` ni un
 * `Map<id, error>` — cada fila es autónoma. `useMutation` no abre suscripción, así
 * que tenerlo por fila es gratis.
 */
function GestionRow({
  gestion,
  cerrado,
  enEdicion,
  onEditar,
}: {
  gestion: Gestion;
  cerrado: boolean;
  enEdicion: boolean;
  onEditar: () => void;
}) {
  const eliminar = useMutation(api.gestiones.eliminar);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Icono = ICONO_GESTION[gestion.tipo] ?? MoreHorizontal;

  async function onEliminar() {
    if (borrando) return;
    setBorrando(true);
    setError(null);
    try {
      await eliminar({ gestionId: gestion._id });
      // Sin resetear estado: la live query desmonta esta fila.
    } catch (err) {
      setError(mensajeError(err, "No pudimos eliminar la gestión. Intentá de nuevo."));
      setBorrando(false);
      setConfirmando(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "11px 0 11px 10px",
        borderBottom: "1px solid var(--divider)",
        // La fila que se está editando arriba, marcada para no perderla de vista.
        borderLeft: enEdicion ? "3px solid var(--primary-500)" : "3px solid transparent",
        background: enEdicion ? "var(--bg-inset)" : undefined,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-inset)",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icono size={16} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 0 }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{tipoLabel(gestion.tipo)}</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {" · "}
              {formatFecha(fechaLocal(gestion.fechaGestion))}
              {" · Registrada "}
              {formatFecha(gestion.registradoEn)}
            </span>
          </div>

          {/* Acciones. Con el caso cerrado la fila es read-only (el server lo
              rechaza igual; esto es la UI acompañando). */}
          {!cerrado && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {enEdicion ? (
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--primary-600)" }}>
                  Editando…
                </span>
              ) : confirmando ? (
                // Confirmación INLINE: no hay Modal en el design system (mismo
                // patrón que la confirmación de avanzar etapa en la ficha).
                <>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    ¿Eliminar?
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)} disabled={borrando}>
                    Cancelar
                  </Button>
                  <Button variant="danger" size="sm" onClick={onEliminar} loading={borrando}>
                    Eliminar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onEditar}
                    aria-label="Editar gestión"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmando(true)}
                    aria-label="Eliminar gestión"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 2,
            fontSize: "var(--text-body-sm-size)",
            color: "var(--text-primary)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {gestion.descripcion}
        </div>

        {error && (
          <div style={{ marginTop: 8 }}>
            <Alert variant="error">{error}</Alert>
          </div>
        )}
      </div>
    </div>
  );
}
