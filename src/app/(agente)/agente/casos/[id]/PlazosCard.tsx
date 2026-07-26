"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { Calendar, Check, Pencil } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { PLAZO_MAX_DESCRIPCION } from "@/lib/constants";
import { estadoPlazo, formatFecha } from "@/lib/format";
import { CenteredEmpty, SectionCard, fechaLocal } from "./fichaUi";

/**
 * REC-81 · Card "Plazos del caso" de la ficha del agente, ahora EDITABLE.
 *
 * A diferencia del resto de las cards de la ficha, esta NO hace query propia:
 * los plazos ya vienen proyectados por `casos.get` (`caso.plazos`, live) y se
 * reciben por prop. Agregar una query nueva sólo para editarlos sería pagar una
 * segunda suscripción por los mismos datos.
 *
 * Edición: un ÚNICO form colapsable arriba de la lista, prefilled con el plazo
 * elegido (`editandoId`) — el molde de `GestionesCard`, que documenta por qué no
 * va un form embebido por fila (lo duplicaría y haría saltar el layout de la
 * lista). Acá pesa todavía más: la card vive en la columna angosta de la ficha.
 */

type Plazo = NonNullable<FunctionReturnType<typeof api.casos.get>>["plazos"][number];

/** Extrae el mensaje legible de un ConvexError (mismo helper que las otras cards). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

export function PlazosCard({
  casoId,
  plazos,
  cerrado,
}: {
  casoId: Id<"casos">;
  plazos: Plazo[];
  cerrado: boolean;
}) {
  const editar = useMutation(api.plazos.editar);

  // null = no estamos editando nada. Con id = ESE plazo, con el form de arriba.
  const [editandoId, setEditandoId] = useState<Id<"plazos"> | null>(null);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cerrarForm = () => {
    setEditandoId(null);
    setFechaVencimiento("");
    setDescripcion("");
    setError(null);
  };

  const abrirEdicion = (p: Plazo) => {
    setEditandoId(p._id);
    setFechaVencimiento(p.fechaVencimiento);
    setDescripcion(p.descripcion);
    setError(null);
  };

  // Si el plazo que estamos editando desaparece de la lista, el form quedaría con
  // un `editandoId` colgado que sólo falla al guardar. Lo cerramos y avisamos
  // (mismo saneamiento que GestionesCard).
  useEffect(() => {
    if (!editandoId) return;
    if (!plazos.some((p) => p._id === editandoId)) {
      cerrarForm();
      setError("El plazo que estabas editando ya no existe.");
    }
  }, [editandoId, plazos]);

  // Con el caso cerrado no se edita nada: si se cierra con el form abierto, lo
  // plegamos (el server lo rechazaría igual; esto es la UI acompañando).
  useEffect(() => {
    if (cerrado && editandoId) cerrarForm();
  }, [cerrado, editandoId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando || !editandoId) return;
    // Guards de cliente (el server valida lo mismo; esto sólo evita el round-trip).
    if (!fechaVencimiento) return setError("Elegí la fecha de vencimiento.");
    if (!descripcion.trim()) return setError("Escribí a qué corresponde el plazo.");

    setGuardando(true);
    setError(null);
    try {
      await editar({ casoId, plazoId: editandoId, fechaVencimiento, descripcion });
      // El acuse es la live query: la fila se actualiza sola.
      cerrarForm();
    } catch (err) {
      setError(mensajeError(err, "No pudimos guardar los cambios. Intentá de nuevo."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SectionCard title="Plazos del caso">
      {editandoId && !cerrado && (
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
          <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 700, color: "var(--text-primary)" }}>
            Editando plazo
          </div>

          {/* Campos APILADOS: la card vive en la columna angosta de la ficha. Y
              sin `max`: un vencimiento es futuro por naturaleza, y corregirlo a
              una fecha ya pasada es un caso válido (el server tampoco lo limita). */}
          <Input
            type="date"
            label="Fecha de vencimiento"
            value={fechaVencimiento}
            onChange={(e) => {
              setFechaVencimiento(e.target.value);
              if (error) setError(null);
            }}
            disabled={guardando}
          />
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: -6 }}>
            Si cambiás la fecha, el aviso por vencimiento se reprograma.
          </div>

          <Textarea
            label="¿A qué corresponde?"
            rows={3}
            maxLength={PLAZO_MAX_DESCRIPCION}
            showCount
            placeholder="Ej: Vencimiento para contestar la mediación."
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
              Guardar cambios
            </Button>
          </div>
        </form>
      )}

      {/* Error suelto (ej. el plazo en edición desapareció), cuando el form ya no
          está en pantalla para mostrarlo. */}
      {error && !editandoId && (
        <div style={{ marginBottom: 12 }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {plazos.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {plazos.map((p) => (
            <PlazoRow
              key={p._id}
              plazo={p}
              cerrado={cerrado}
              enEdicion={editandoId === p._id}
              onEditar={() => abrirEdicion(p)}
            />
          ))}
        </div>
      ) : (
        <CenteredEmpty
          icon={<Calendar size={22} strokeWidth={1.5} />}
          title="Sin plazos cargados"
          description="Los vencimientos críticos del reclamo van a aparecer acá."
        />
      )}
    </SectionCard>
  );
}

function PlazoRow({
  plazo,
  cerrado,
  enEdicion,
  onEditar,
}: {
  plazo: Plazo;
  cerrado: boolean;
  enEdicion: boolean;
  onEditar: () => void;
}) {
  const estado = estadoPlazo(fechaLocal(plazo.fechaVencimiento));
  const border =
    estado === "vencido"
      ? "var(--danger-500)"
      : estado === "proximo"
        ? "var(--warning-500)"
        : "var(--border)";
  const bg =
    estado === "vencido"
      ? "var(--danger-50)"
      : estado === "proximo"
        ? "var(--warning-50)"
        : "var(--bg-inset)";
  const pill =
    estado === "vencido" ? (
      <span style={pillStyle("var(--danger-600)")}>Vencido</span>
    ) : estado === "proximo" ? (
      <span style={pillStyle("var(--warning-700)")}>Próximo</span>
    ) : (
      <span
        style={{
          fontSize: 12,
          color: "var(--success-700)",
          fontWeight: 600,
          display: "inline-flex",
          gap: 4,
          alignItems: "center",
          whiteSpace: "nowrap",
        }}
      >
        <Check size={13} />
        En fecha
      </span>
    );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 12px",
        borderLeft: `3px solid ${enEdicion ? "var(--primary-500)" : border}`,
        background: bg,
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-primary)" }}>
          {plazo.descripcion}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
          Vence {formatFecha(fechaLocal(plazo.fechaVencimiento))}
        </div>
      </div>

      {/* En edición el indicador REEMPLAZA al pill de estado (mismo criterio que
          `GestionRow`): los dos juntos entran, pero dejan la descripción en una
          franja muy angosta. El estado sigue legible en el borde y el fondo de la
          fila. Con el caso cerrado la fila es read-only (el server lo rechaza
          igual). */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {enEdicion && !cerrado ? (
          <span style={pillStyle("var(--primary-600)")}>Editando…</span>
        ) : (
          <>
            {pill}
            {!cerrado && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditar}
                aria-label="Editar plazo"
                title="Editar"
              >
                <Pencil size={14} />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const pillStyle = (color: string): CSSProperties => ({
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color,
  whiteSpace: "nowrap",
});
