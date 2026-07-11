"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { MessageSquare, Plus } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Badge, Button, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { RESPUESTA_MAX_TEXTO, TIPOS_RESPUESTA, type TipoRespuesta } from "@/lib/constants";
import { formatFecha, hoyLocalISO } from "@/lib/format";
import { CenteredEmpty, SectionCard, fechaLocal } from "./fichaUi";

/**
 * REC-31 · Card "Respuestas de la aseguradora" dentro de la ficha del caso.
 *
 * Autocontenida a propósito: hace su PROPIA query (no cuelga de `casos.get`, que
 * es dual-rol y no debe ver esta tabla — ver convex/respuestasAseguradora.ts) y
 * maneja su propio estado, carga y errores. La ficha sólo la compone. REC-32 (log
 * de gestiones) y REC-33 (notas internas) clonan este patrón sin tocar la ficha.
 *
 * El alta es un form colapsable acá adentro, no una pantalla aparte como
 * "Solicitar documentación" o "Cerrar caso": esas acciones tienen efecto EXTERNO
 * e irreversible (notifican, mandan email, cierran el caso) y merecen una
 * pantalla dedicada; ésta es una anotación interna sin efectos secundarios, y
 * sacar al agente de la ficha para anotar sería fricción pura.
 */

type Respuesta = NonNullable<
  FunctionReturnType<typeof api.respuestasAseguradora.listPorCaso>
>[number];

const tipoInfo = (v: string) => TIPOS_RESPUESTA.find((t) => t.value === v);

/** Extrae el mensaje legible de un ConvexError (mismo helper que la ficha). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

export function RespuestasAseguradoraCard({
  casoId,
  cerrado,
}: {
  casoId: Id<"casos">;
  cerrado: boolean;
}) {
  const respuestas = useQuery(api.respuestasAseguradora.listPorCaso, { casoId });
  const registrar = useMutation(api.respuestasAseguradora.registrar);

  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoRespuesta | "">("");
  const [fecha, setFecha] = useState(hoyLocalISO());
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cerrarForm = () => {
    setAbierto(false);
    setTipo("");
    setFecha(hoyLocalISO());
    setTexto("");
    setError(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    // Guards de cliente (el server valida lo mismo; esto sólo evita el round-trip).
    if (!tipo) return setError("Elegí el tipo de respuesta.");
    if (!texto.trim()) return setError("Escribí qué respondió la aseguradora.");

    setGuardando(true);
    setError(null);
    try {
      await registrar({ casoId, tipo, fecha, texto });
      // El acuse es la fila nueva apareciendo por live query: no hay toast en el
      // design system, y navegar sería peor que quedarse donde el agente está.
      cerrarForm();
    } catch (err) {
      setError(mensajeError(err, "No pudimos registrar la respuesta. Intentá de nuevo."));
    } finally {
      setGuardando(false);
    }
  }

  // El historial viene ASC del índice; lo mostramos al revés (lo más reciente
  // arriba) sobre una COPIA, sin mutar el array de la query. En el empate de
  // misma fecha esto deja arriba la última que cargó el agente: es deliberado
  // (ver el comentario del índice `by_caso_fecha` en convex/schema.ts).
  const historial = respuestas ? [...respuestas].reverse() : [];

  return (
    <SectionCard
      title="Respuestas de la aseguradora"
      right={
        cerrado ? (
          respuestas?.length ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
              {respuestas.length} respuesta{respuestas.length === 1 ? "" : "s"}
            </span>
          ) : undefined
        ) : abierto ? undefined : (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Plus size={14} />}
            onClick={() => setAbierto(true)}
          >
            Registrar respuesta
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
          <div style={{ display: "flex", gap: 12 }}>
            <Select
              label="Tipo de respuesta"
              placeholder="Elegí una opción…"
              options={TIPOS_RESPUESTA}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoRespuesta);
                if (error) setError(null);
              }}
              disabled={guardando}
            />
            <Input
              type="date"
              label="Fecha en que se recibió"
              value={fecha}
              // Defensa en profundidad, no frontera: el guard real de "no futura"
              // está en el server, contra el hoy argentino.
              max={hoyLocalISO()}
              onChange={(e) => {
                setFecha(e.target.value);
                if (error) setError(null);
              }}
              disabled={guardando}
            />
          </div>

          <Textarea
            label="¿Qué respondió la aseguradora?"
            rows={4}
            maxLength={RESPUESTA_MAX_TEXTO}
            showCount
            placeholder="Ej: Ofrecen $1.800.000 por daños materiales, sin cubrir gastos de traslado. Piden factura del taller."
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
              Guardar respuesta
            </Button>
          </div>
        </form>
      )}

      {respuestas === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton width="35%" height={12} />
          <Skeleton width="85%" height={12} />
        </div>
      ) : respuestas === null ? (
        // Fail-closed. En la práctica sólo una race: si la ficha renderizó, el
        // agente ya es dueño del caso.
        <div style={{ padding: "10px 0", fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>
          No pudimos cargar las respuestas.
        </div>
      ) : historial.length ? (
        <div>
          {historial.map((r) => (
            <RespuestaRow key={r._id} respuesta={r} />
          ))}
        </div>
      ) : (
        <CenteredEmpty
          icon={<MessageSquare size={22} strokeWidth={1.5} />}
          title="Sin respuestas registradas"
          description="Cuando la aseguradora conteste, registrá acá lo que ofreció o resolvió."
        />
      )}
    </SectionCard>
  );
}

function RespuestaRow({ respuesta }: { respuesta: Respuesta }) {
  const info = tipoInfo(respuesta.tipo);
  return (
    <div style={{ padding: "11px 0", borderBottom: "1px solid var(--divider)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Badge variant={info?.badge ?? "pendiente"}>{info?.label ?? respuesta.tipo}</Badge>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
          Recibida {formatFecha(fechaLocal(respuesta.fecha))} · Registrada{" "}
          {formatFecha(respuesta.registradoEn)}
        </span>
      </div>
      <div
        style={{
          fontSize: "var(--text-body-sm-size)",
          color: "var(--text-primary)",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {respuesta.texto}
      </div>
    </div>
  );
}
