"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Clock, Pencil } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Alert,
  Button,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { RELATO_MAX_RESPUESTA, RELATO_PREGUNTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";
import {
  codificarRespuestas,
  decodificarRespuestas,
  faltanRequeridas,
  textoMostrado,
  type PreguntaRelato,
  type RespuestaRelato,
  type ValoresRelato,
} from "@/lib/relato";
import { CenteredEmpty, SectionCard } from "./fichaUi";

/**
 * Card "Relato del siniestro" de la ficha del agente (REC-76 · REC-79). Muestra
 * las 7 preguntas del wizard y —desde REC-79— deja CORREGIRLAS: es la única vía
 * para arreglar un relato ya enviado, que para el damnificado es inmutable.
 *
 * Lee de `relato.paraAgente` y NO de `casos.get` como el resto de la ficha, a
 * propósito: `casos.get` es dual-rol, y el texto corregido por el agente no tiene
 * que poder salir por una función que un damnificado pueda llamar. Misma razón por
 * la que `GestionesCard` tiene query propia.
 *
 * Lo que se pinta es el texto EFECTIVO (la corrección si existe, si no el del
 * damnificado). El original nunca se pierde y se puede desplegar aparte, pero sólo
 * cuando de verdad difiere: `paraAgente` devuelve `original: null` si el agente no
 * tocó nada o si revirtió su corrección.
 */
export function RelatoCard({
  casoId,
  cerrado,
}: {
  casoId: Id<"casos">;
  cerrado: boolean;
}) {
  const data = useQuery(api.relato.paraAgente, { casoId });
  const editarRelato = useMutation(api.relato.editarComoAgente);

  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<ValoresRelato>({});
  const [detalles, setDetalles] = useState<ValoresRelato>({});
  const [verOriginal, setVerOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const relato = data?.relato ?? null;

  const cerrarForm = () => {
    setAbierto(false);
    setValores({});
    setDetalles({});
    setError(null);
  };

  const abrirForm = () => {
    // Prefill con el texto EFECTIVO: se sigue corrigiendo sobre la última versión,
    // no sobre el original. Con fallback por índice, que es lo que esta card ya
    // venía tolerando para filas históricas con títulos que cambiaron.
    const { valores: v, detalles: d } = decodificarRespuestas(
      relato?.respuestas ?? [],
      { fallbackPorIndice: true },
    );
    setValores(v);
    setDetalles(d);
    setError(null);
    setAbierto(true);
  };

  // El caso se cerró con el form abierto: cerrarlo, que si no queda estado sucio
  // fuera de pantalla (el server lo rechaza igual; esto es la UI acompañando).
  useEffect(() => {
    if (cerrado && abierto) cerrarForm();
  }, [cerrado, abierto]);

  if (data === undefined) {
    return (
      <SectionCard title="Relato del siniestro">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={14} width="45%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="70%" />
        </div>
      </SectionCard>
    );
  }
  // No autorizado. No debería pasar (la ficha ya cargó con el mismo guard), y
  // pintar "Relato pendiente" acá sería afirmar algo que no sabemos.
  if (data === null) return null;

  const setVal = (id: string, value: string) => {
    setValores((prev) => ({ ...prev, [id]: value }));
    if (error) setError(null);
  };
  const setDet = (id: string, value: string) => {
    setDetalles((prev) => ({ ...prev, [id]: value }));
    if (error) setError(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    // Guard de cliente: el server valida lo mismo, esto sólo evita el round-trip.
    if (faltanRequeridas(valores, detalles)) {
      setError("Faltan respuestas: completá todas las preguntas antes de guardar.");
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      await editarRelato({
        casoId,
        respuestas: codificarRespuestas(valores, detalles),
      });
      // El acuse es la live query: la card se repinta sola con el texto nuevo.
      cerrarForm();
    } catch (err) {
      setError(
        mensajeError(err, "No pudimos guardar el relato. Intentá de nuevo."),
      );
    } finally {
      setGuardando(false);
    }
  }

  // Un relato que el damnificado no envió (o que todavía no existe) queda ENVIADO
  // al guardar, y ahí él pierde para siempre la posibilidad de completarlo. Es
  // deliberado, pero no puede ser una sorpresa.
  const congelaAlDamnificado = !relato?.completo;
  const puedeEditar = !cerrado && !abierto;

  const sello = relato?.editadoPorAgenteEn
    ? `Editado por vos ${formatFecha(relato.editadoPorAgenteEn)}`
    : relato?.completadoEn
      ? `Completado ${formatFecha(relato.completadoEn)}`
      : null;

  return (
    <SectionCard
      title="Relato del siniestro"
      right={
        sello || puedeEditar ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sello && <span style={selloStyle}>{sello}</span>}
            {puedeEditar && (
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Pencil size={14} />}
                onClick={abrirForm}
              >
                {relato ? "Editar relato" : "Cargar relato"}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {abierto && !cerrado ? (
        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: 14,
            background: "var(--bg-inset)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div
            style={{
              fontSize: "var(--text-body-sm-size)",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {relato ? "Editando el relato" : "Cargando el relato"}
          </div>

          {congelaAlDamnificado && (
            <Alert variant="warning">
              Al guardar, el relato queda como enviado y el damnificado ya no va a
              poder completarlo desde su cuenta.
            </Alert>
          )}

          {RELATO_PREGUNTAS.map((q) => (
            <CampoRelato
              key={q.id}
              q={q}
              valores={valores}
              detalles={detalles}
              setVal={setVal}
              setDet={setDet}
              disabled={guardando}
            />
          ))}

          {error && <Alert variant="error">{error}</Alert>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cerrarForm}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={guardando}
              disabled={faltanRequeridas(valores, detalles)}
            >
              Guardar relato
            </Button>
          </div>
          {faltanRequeridas(valores, detalles) && (
            <div style={{ fontSize: 11, color: "var(--danger-600)", textAlign: "right", marginTop: -8 }}>
              Completá las respuestas que faltan antes de guardar.
            </div>
          )}
        </form>
      ) : (
        <>
          {/* Error suelto: el form ya se cerró y no está para mostrarlo. */}
          {error && !abierto && (
            <div style={{ marginBottom: 12 }}>
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          {!relato ? (
            <CenteredEmpty
              icon={<Clock size={22} strokeWidth={1.5} />}
              title="Relato pendiente"
              description="El damnificado todavía no completó el relato del siniestro."
              action={
                puedeEditar ? (
                  <Button size="sm" iconLeft={<Pencil size={14} />} onClick={abrirForm}>
                    Cargar relato
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {!relato.completo && (
                <div style={{ marginBottom: 12 }}>
                  <Alert variant="info" title="Borrador">
                    El damnificado empezó el relato pero todavía no lo envió.
                  </Alert>
                </div>
              )}

              <Respuestas respuestas={relato.respuestas} />

              {relato.original && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--divider)", paddingTop: 10 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVerOriginal((v) => !v)}
                  >
                    {verOriginal ? "Ocultar el original" : "Ver el original del damnificado"}
                  </Button>
                  {verOriginal && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>
                        Tal como lo escribió el damnificado.
                      </div>
                      <Respuestas respuestas={relato.original} atenuado />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** Extrae el mensaje legible de un ConvexError (mismo helper que las otras cards). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

/**
 * Las 7 preguntas con su respuesta. El orden y los títulos los manda
 * `RELATO_PREGUNTAS`, no el array persistido: match por título con fallback por
 * índice, defensivo ante títulos históricos que hayan cambiado.
 */
function Respuestas({
  respuestas,
  atenuado,
}: {
  respuestas: readonly RespuestaRelato[];
  atenuado?: boolean;
}) {
  return (
    <div>
      {RELATO_PREGUNTAS.map((q, i) => {
        const found =
          respuestas.find((r) => r.pregunta === q.titulo) ?? respuestas[i];
        const valor = textoMostrado(q, found?.respuesta ?? "");
        const ultima = i === RELATO_PREGUNTAS.length - 1;
        return (
          <div
            key={q.id}
            style={{
              padding: "11px 0",
              borderBottom: ultima ? "none" : "1px solid var(--divider)",
            }}
          >
            <div style={preguntaStyle}>{q.titulo}</div>
            <div
              style={
                atenuado
                  ? { ...respuestaStyle, color: "var(--text-secondary)" }
                  : respuestaStyle
              }
            >
              {valor}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Un campo del form según el tipo de la pregunta (espeja el `Campo` del wizard). */
function CampoRelato({
  q,
  valores,
  detalles,
  setVal,
  setDet,
  disabled,
}: {
  q: PreguntaRelato;
  valores: ValoresRelato;
  detalles: ValoresRelato;
  setVal: (id: string, v: string) => void;
  setDet: (id: string, v: string) => void;
  disabled: boolean;
}) {
  const val = valores[q.id] ?? "";
  const comun = { label: q.titulo, helperText: q.ayuda || undefined, disabled };

  switch (q.tipo) {
    case "fecha":
      return (
        <Input
          {...comun}
          type="date"
          value={val}
          onChange={(e) => setVal(q.id, e.target.value)}
        />
      );
    case "texto":
      return (
        <Input
          {...comun}
          value={val}
          placeholder="Escribí acá…"
          onChange={(e) => setVal(q.id, e.target.value)}
        />
      );
    case "textarea":
      return (
        <Textarea
          {...comun}
          rows={q.id === "que_paso" ? 6 : 3}
          maxLength={RELATO_MAX_RESPUESTA}
          showCount
          value={val}
          placeholder="Contá con tus palabras…"
          onChange={(e) => setVal(q.id, e.target.value)}
        />
      );
    case "si_no":
      return (
        <Select
          {...comun}
          options={OPCIONES_SI_NO}
          placeholder="Elegí una opción"
          value={val}
          onChange={(e) => setVal(q.id, e.target.value)}
        />
      );
    case "si_no_detalle":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Select
            {...comun}
            options={OPCIONES_SI_NO}
            placeholder="Elegí una opción"
            value={val}
            onChange={(e) => setVal(q.id, e.target.value)}
          />
          {val === "Sí" && (
            <Textarea
              label="¿Con quién y cuándo?"
              rows={3}
              maxLength={RELATO_MAX_RESPUESTA}
              value={detalles[q.id] ?? ""}
              disabled={disabled}
              placeholder="Ej: Llamé a la aseguradora el 25/06 e hice la denuncia N° 1234."
              onChange={(e) => setDet(q.id, e.target.value)}
            />
          )}
        </div>
      );
    default:
      return null;
  }
}

const OPCIONES_SI_NO = [
  { value: "Sí", label: "Sí" },
  { value: "No", label: "No" },
] as const;

const selloStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
  whiteSpace: "nowrap",
};

const preguntaStyle: CSSProperties = {
  fontSize: "var(--text-body-sm-size)",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const respuestaStyle: CSSProperties = {
  marginTop: 3,
  fontSize: "var(--text-body-size)",
  color: "var(--text-primary)",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
