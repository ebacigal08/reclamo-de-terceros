"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { Calendar, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { PLAZO_MAX_DESCRIPCION, PLAZO_MAX_POR_CASO } from "@/lib/constants";
import { estadoPlazo, formatFecha } from "@/lib/format";
import { CenteredEmpty, SectionCard, fechaLocal } from "./fichaUi";

/**
 * REC-81 · REC-87 · Card "Plazos del caso" de la ficha del agente: alta,
 * edición y borrado.
 *
 * A diferencia del resto de las cards de la ficha, esta NO hace query propia:
 * los plazos ya vienen proyectados por `casos.get` (`caso.plazos`, live) y se
 * reciben por prop. Agregar una query nueva sólo para editarlos sería pagar una
 * segunda suscripción por los mismos datos.
 *
 * Un ÚNICO form colapsable arriba de la lista sirve para las dos cosas:
 * `abierto` dice si se está mostrando y `editandoId` distingue el modo (null =
 * alta). El molde es `GestionesCard`, que documenta por qué no va un form
 * embebido por fila (lo duplicaría y haría saltar el layout de la lista). Acá
 * pesa todavía más: la card vive en la columna angosta de la ficha.
 *
 * Los plazos llegan ordenados por vencimiento (índice `by_caso_fecha`), así que
 * uno nuevo aparece en su lugar cronológico y no al final de la lista.
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
  const crear = useMutation(api.plazos.crear);
  const editar = useMutation(api.plazos.editar);

  // `abierto` es el superconjunto: `editandoId !== null` implica `abierto`.
  // null = alta. Con id = estamos corrigiendo ESE plazo, con el mismo form.
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<Id<"plazos"> | null>(null);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const lleno = plazos.length >= PLAZO_MAX_POR_CASO;

  const cerrarForm = () => {
    setAbierto(false);
    setEditandoId(null);
    setFechaVencimiento("");
    setDescripcion("");
    setError(null);
  };

  // La fecha arranca VACÍA, no en hoy (a diferencia de `GestionesCard`): una
  // gestión es pasada y "hoy" acierta casi siempre, pero un plazo es futuro. Un
  // alta sin tocar el campo crearía un plazo que vence hoy → alerta en la ficha,
  // caso "inminente" en la lista y email real en la próxima corrida del cron.
  const abrirAlta = () => {
    setAbierto(true);
    setEditandoId(null);
    setFechaVencimiento("");
    setDescripcion("");
    setError(null);
  };

  const abrirEdicion = (p: Plazo) => {
    setAbierto(true);
    setEditandoId(p._id);
    setFechaVencimiento(p.fechaVencimiento);
    setDescripcion(p.descripcion);
    setError(null);
  };

  // Si el plazo que estamos editando desaparece de la lista, el form quedaría con
  // un `editandoId` colgado que sólo falla al guardar. Lo cerramos y avisamos
  // (mismo saneamiento que GestionesCard). En alta es no-op por el early return,
  // que es lo correcto. Desde REC-87 el escenario es alcanzable en dos clicks:
  // basta con borrar desde otra pestaña el plazo que se está editando acá.
  useEffect(() => {
    if (!editandoId) return;
    if (!plazos.some((p) => p._id === editandoId)) {
      cerrarForm();
      setError("El plazo que estabas editando ya no existe.");
    }
  }, [editandoId, plazos]);

  // Con el caso cerrado no se escribe nada: si se cierra con el form abierto, lo
  // plegamos (el server lo rechazaría igual; esto es la UI acompañando). Va por
  // `abierto` y no por `editandoId`: si no, un alta a medias quedaría fuera de
  // pantalla pero con el estado sucio.
  useEffect(() => {
    if (cerrado && abierto) cerrarForm();
  }, [cerrado, abierto]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    // Guards de cliente (el server valida lo mismo; esto sólo evita el round-trip).
    if (!fechaVencimiento) return setError("Elegí la fecha de vencimiento.");
    if (!descripcion.trim()) return setError("Escribí a qué corresponde el plazo.");

    setGuardando(true);
    setError(null);
    try {
      if (editandoId) {
        await editar({ casoId, plazoId: editandoId, fechaVencimiento, descripcion });
      } else {
        await crear({ casoId, fechaVencimiento, descripcion });
      }
      // El acuse es la live query: la fila aparece o se actualiza sola.
      cerrarForm();
    } catch (err) {
      setError(
        mensajeError(
          err,
          editandoId
            ? "No pudimos guardar los cambios. Intentá de nuevo."
            : "No pudimos agregar el plazo. Intentá de nuevo.",
        ),
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SectionCard
      title="Plazos del caso"
      right={
        cerrado || abierto ? undefined : (
          // El `title` va en un <span> y no en el <Button>: los navegadores no
          // muestran tooltip sobre un control `disabled`. Deshabilitado y no
          // escondido — un botón que desaparece sin explicación es peor.
          <span title={lleno ? `Llegaste al máximo de ${PLAZO_MAX_POR_CASO} plazos en este caso.` : undefined}>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Plus size={14} />}
              onClick={abrirAlta}
              disabled={lleno}
            >
              Agregar plazo
            </Button>
          </span>
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
          {/* A diferencia de `GestionesCard` (que sólo titula la edición), acá el
              encabezado está en los dos modos: el disparador desaparece al abrirse
              el form y la card vive en la columna angosta. */}
          <div style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 700, color: "var(--text-primary)" }}>
            {editandoId ? "Editando plazo" : "Nuevo plazo"}
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
            {editandoId
              ? "Si cambiás la fecha, el aviso por vencimiento se reprograma."
              : "Te avisamos por email desde 3 días antes del vencimiento."}
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
              {editandoId ? "Guardar cambios" : "Guardar plazo"}
            </Button>
          </div>
        </form>
      )}

      {/* Error suelto (ej. el plazo en edición desapareció), cuando el form ya no
          está en pantalla para mostrarlo. */}
      {error && !abierto && (
        <div style={{ marginBottom: 12 }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {plazos.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {plazos.map((p) => (
            <PlazoRow
              key={p._id}
              casoId={casoId}
              plazo={p}
              cerrado={cerrado}
              enEdicion={editandoId === p._id}
              onEditar={() => abrirEdicion(p)}
            />
          ))}
        </div>
      ) : (
        // El vacío es JUSTO donde el agente se topa con que no hay plazos: ahí va
        // la acción. Con la lista vacía `lleno` es imposible, no hace falta el guard.
        <CenteredEmpty
          icon={<Calendar size={22} strokeWidth={1.5} />}
          title="Sin plazos cargados"
          description="Los vencimientos críticos del reclamo van a aparecer acá."
          action={
            cerrado || abierto ? undefined : (
              <Button size="sm" iconLeft={<Plus size={14} />} onClick={abrirAlta}>
                Agregar plazo
              </Button>
            )
          }
        />
      )}
    </SectionCard>
  );
}

function PlazoRow({
  casoId,
  plazo,
  cerrado,
  enEdicion,
  onEditar,
}: {
  casoId: Id<"casos">;
  plazo: Plazo;
  cerrado: boolean;
  enEdicion: boolean;
  onEditar: () => void;
}) {
  const eliminar = useMutation(api.plazos.eliminar);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onEliminar() {
    if (borrando) return;
    setBorrando(true);
    setError(null);
    try {
      await eliminar({ casoId, plazoId: plazo._id });
      // Sin resetear estado: la live query desmonta esta fila.
    } catch (err) {
      setError(mensajeError(err, "No pudimos eliminar el plazo. Intentá de nuevo."));
      setBorrando(false);
      setConfirmando(false);
    }
  }

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
        flexDirection: "column",
        gap: 8,
        padding: "11px 12px",
        borderLeft: `3px solid ${enEdicion ? "var(--primary-500)" : border}`,
        background: bg,
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--text-body-sm-size)",
              fontWeight: 600,
              color: "var(--text-primary)",
              wordBreak: "break-word",
            }}
          >
            {plazo.descripcion}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
            Vence {formatFecha(fechaLocal(plazo.fechaVencimiento))}
          </div>
        </div>

        {/* Tres estados excluyentes. En edición y al confirmar, el indicador
            REEMPLAZA al pill de estado (mismo criterio que `GestionRow`): los dos
            juntos entran, pero dejan la descripción en una franja muy angosta. El
            estado sigue legible en el borde y el fondo de la fila. Con el caso
            cerrado la fila es read-only (el server lo rechaza igual). */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {enEdicion && !cerrado ? (
            <span style={pillStyle("var(--primary-600)")}>Editando…</span>
          ) : confirmando && !cerrado ? (
            // Confirmación INLINE: no hay Modal en el design system (mismo patrón
            // que `GestionRow` y que la confirmación de avanzar etapa en la ficha).
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
              {pill}
              {!cerrado && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onEditar}
                    aria-label="Editar plazo"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </Button>
                  {/* No se ofrece borrar la fila que se está editando arriba: evita
                      el estado raro "borré lo que tengo abierto". Si pasa desde otra
                      pestaña, lo cubre el efecto de saneamiento de la card. */}
                  {!enEdicion && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmando(true)}
                      aria-label="Eliminar plazo"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
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
