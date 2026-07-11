"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { Lock, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Button, Skeleton, Textarea } from "@/components/ui";
import { NOTA_MAX_TEXTO } from "@/lib/constants";
import { formatFecha } from "@/lib/format";
import { CenteredEmpty, SectionCard } from "./fichaUi";

/**
 * REC-33 · Card "Notas internas" dentro de la ficha del caso.
 *
 * Es el espacio PRIVADO del agente: sospechas sobre el reclamo, estrategia legal,
 * datos sensibles de la negociación. Autocontenida y con query propia, igual que
 * las cards de REC-31 y REC-32 (no cuelga de `casos.get`, que es dual-rol).
 *
 * El MARCADOR DE PRIVACIDAD es un requisito funcional del issue, no decoración:
 * si el agente duda de dónde está escribiendo, termina anotando una sospecha sobre
 * el reclamo en un campo que el damnificado sí ve. Por eso el chip "Privada" está
 * siempre presente en el header —también con el caso cerrado— y el form lo repite
 * abajo del textarea.
 */

type Nota = NonNullable<FunctionReturnType<typeof api.notasInternas.listPorCaso>>[number];

/** Extrae el mensaje legible de un ConvexError (mismo helper que la ficha). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

/** Chip de privacidad. Se muestra SIEMPRE, incluso en un caso cerrado. */
function ChipPrivada() {
  return (
    <span
      title="Sólo el agente ve estas notas. El damnificado nunca."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-inset)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
        fontSize: "var(--text-label-size)",
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <Lock size={11} />
      Privada
    </span>
  );
}

export function NotasInternasCard({
  casoId,
  cerrado,
}: {
  casoId: Id<"casos">;
  cerrado: boolean;
}) {
  const notas = useQuery(api.notasInternas.listPorCaso, { casoId });
  const crear = useMutation(api.notasInternas.crear);
  const editar = useMutation(api.notasInternas.editar);

  const [abierto, setAbierto] = useState(false);
  // null = nota nueva. Con id = estamos corrigiendo ESA nota, con el mismo form.
  const [editandoId, setEditandoId] = useState<Id<"notasInternas"> | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cerrarForm = () => {
    setAbierto(false);
    setEditandoId(null);
    setTexto("");
    setError(null);
  };

  const abrirEdicion = (n: Nota) => {
    setEditandoId(n._id);
    setTexto(n.texto);
    setError(null);
    setAbierto(true);
  };

  // Si la nota que estamos editando desaparece (otra pestaña la borró), el form
  // quedaría con un `editandoId` colgado que sólo falla al guardar.
  useEffect(() => {
    if (!editandoId || !notas) return;
    if (!notas.some((n) => n._id === editandoId)) {
      cerrarForm();
      setError("La nota que estabas editando ya no existe.");
    }
  }, [editandoId, notas]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    if (!texto.trim()) return setError("Escribí la nota antes de guardarla.");

    setGuardando(true);
    setError(null);
    try {
      if (editandoId) {
        await editar({ notaId: editandoId, texto });
      } else {
        await crear({ casoId, texto });
      }
      // El acuse es la live query: la nota aparece o se actualiza sola.
      cerrarForm();
    } catch (err) {
      setError(
        mensajeError(
          err,
          editandoId
            ? "No pudimos guardar los cambios. Intentá de nuevo."
            : "No pudimos guardar la nota. Intentá de nuevo.",
        ),
      );
    } finally {
      setGuardando(false);
    }
  }

  // La query devuelve en orden de creación ascendente; mostramos la más reciente
  // arriba, sobre una COPIA (no mutar el array de la query). Editar una nota NO la
  // reordena: una nota es de cuando la escribiste.
  const historial = notas ? [...notas].reverse() : [];

  return (
    <SectionCard
      title="Notas internas"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ChipPrivada />
          {!cerrado && !abierto && (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Plus size={14} />}
              onClick={() => setAbierto(true)}
            >
              Nueva nota
            </Button>
          )}
        </div>
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
          <Textarea
            label={editandoId ? "Editando nota" : "Nueva nota"}
            rows={4}
            maxLength={NOTA_MAX_TEXTO}
            showCount
            helperText="El damnificado nunca ve estas notas."
            placeholder="Ej: La aseguradora viene dilatando. Si no responden antes del 20, conviene intimar por carta documento."
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
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
              {editandoId ? "Guardar cambios" : "Guardar nota"}
            </Button>
          </div>
        </form>
      )}

      {/* Error suelto (ej. la nota en edición se borró desde otra pestaña) cuando
          el form ya no está en pantalla para mostrarlo. */}
      {error && !abierto && (
        <div style={{ marginBottom: 12 }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {notas === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton width="35%" height={12} />
          <Skeleton width="85%" height={12} />
        </div>
      ) : notas === null ? (
        // Fail-closed. En la práctica sólo una race: si la ficha renderizó, el
        // agente ya es dueño del caso.
        <div style={{ padding: "10px 0", fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>
          No pudimos cargar las notas.
        </div>
      ) : historial.length ? (
        <div>
          {historial.map((n) => (
            <NotaRow
              key={n._id}
              nota={n}
              cerrado={cerrado}
              enEdicion={editandoId === n._id}
              onEditar={() => abrirEdicion(n)}
            />
          ))}
        </div>
      ) : (
        <CenteredEmpty
          icon={<NotebookPen size={22} strokeWidth={1.5} />}
          title="Sin notas internas"
          description="Anotá acá lo que no va para el damnificado: estrategia, sospechas, recordatorios."
        />
      )}
    </SectionCard>
  );
}

/**
 * Una nota. Se encarga ELLA de su propio borrado (mutation + confirmación inline +
 * estado de carga), así el contenedor no necesita un `Map<id, loading>`.
 */
function NotaRow({
  nota,
  cerrado,
  enEdicion,
  onEditar,
}: {
  nota: Nota;
  cerrado: boolean;
  enEdicion: boolean;
  onEditar: () => void;
}) {
  const eliminar = useMutation(api.notasInternas.eliminar);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onEliminar() {
    if (borrando) return;
    setBorrando(true);
    setError(null);
    try {
      await eliminar({ notaId: nota._id });
      // Sin resetear estado: la live query desmonta esta fila.
    } catch (err) {
      setError(mensajeError(err, "No pudimos eliminar la nota. Intentá de nuevo."));
      setBorrando(false);
      setConfirmando(false);
    }
  }

  return (
    <div
      style={{
        padding: "11px 0 11px 10px",
        borderBottom: "1px solid var(--divider)",
        borderLeft: enEdicion ? "3px solid var(--primary-500)" : "3px solid transparent",
        background: enEdicion ? "var(--bg-inset)" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: "var(--text-body-sm-size)",
            color: "var(--text-primary)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {nota.texto}
        </div>

        {!cerrado && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {enEdicion ? (
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--primary-600)" }}>
                Editando…
              </span>
            ) : confirmando ? (
              // Confirmación inline: no hay Modal en el design system.
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
                <Button variant="ghost" size="sm" onClick={onEditar} aria-label="Editar nota" title="Editar">
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmando(true)}
                  aria-label="Eliminar nota"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
        Creada {formatFecha(nota.creadaEn)}
        {/* `actualizadaEn` sólo existe si hubo una edición REAL (el server no lo
            toca cuando el texto no cambió) → el "editada" nunca miente. */}
        {nota.actualizadaEn ? ` · editada ${formatFecha(nota.actualizadaEn)}` : ""}
      </div>

      {error && (
        <div style={{ marginTop: 8 }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
