"use client";

import { CSSProperties, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { Check, CheckCheck, Send } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Button, Skeleton, Textarea } from "@/components/ui";
import { MENSAJE_MAX_TEXTO, TOPE_BADGE_MENSAJES } from "@/lib/constants";
import { formatFecha, formatHora, mismoDia } from "@/lib/format";

/**
 * REC-34 · El núcleo del chat, COMPARTIDO por los dos roles.
 *
 * Vive en `src/components/` y no en una de las dos carpetas de rutas porque lo usan
 * las dos: la ficha del agente (`ChatCard`) y "Mi caso" del damnificado
 * (`ChatSection`). Duplicarlo sería duplicar el auto-marcado de leídos y el
 * compositor — o sea, dos lugares donde el estado de lectura se puede desincronizar.
 *
 * Los envoltorios ponen el marco (card de escritorio vs. sección mobile); esto pone
 * la conversación. `yo` NO se asume acá: lo dice el server (`data.yo`), derivado de
 * la sesión — alinear las burbujas del lado equivocado sería un bug de identidad.
 */

type Datos = NonNullable<FunctionReturnType<typeof api.mensajes.listPorCaso>>;
type Mensaje = Datos["mensajes"][number];

/** Extrae el mensaje legible de un ConvexError (convención del repo). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

export function badgeNoLeidos(n: number): string {
  return n > TOPE_BADGE_MENSAJES ? `${TOPE_BADGE_MENSAJES}+` : String(n);
}

/** Hook del chat: query + auto-marcado de leídos + separador de "nuevos" estable. */
export function useConversacion(casoId: Id<"casos">, limite?: number) {
  const data = useQuery(api.mensajes.listPorCaso, { casoId, limite });
  const marcarLeidos = useMutation(api.mensajes.marcarLeidos);

  const enVueloRef = useRef(false);
  const ultimoIntentoRef = useRef(-1);
  const noLeidos = data?.noLeidos ?? 0;

  // Auto-marcado AL RENDERIZAR, igual que el feed de novedades de "Mi caso": la
  // conversación está siempre visible (no hay tabs ni acordeón), así que "renderizó"
  // equivale a "lo tenés en pantalla". Un observer de scroll agregaría complejidad
  // para una diferencia que en este layout no existe.
  useEffect(() => {
    if (noLeidos === 0 || enVueloRef.current) return;
    // Anti-loop: no reintentar la MISMA cantidad si ya falló; sólo se reintenta si el
    // contador cambió (o sea, si llegó algo nuevo). El loop se corta solo porque tras
    // el patch la live query re-emite con noLeidos = 0.
    if (ultimoIntentoRef.current === noLeidos) return;
    ultimoIntentoRef.current = noLeidos;
    enVueloRef.current = true;
    void marcarLeidos({ casoId })
      .catch(() => {
        ultimoIntentoRef.current = -1; // liberar para reintentar
      })
      .finally(() => {
        enVueloRef.current = false;
      });
  }, [noLeidos, casoId, marcarLeidos]);

  // El separador "Nuevos mensajes" se CONGELA con el primer snapshot: el auto-marcado
  // apaga `noLeidos` en ~200ms, así que si lo derivásemos del estado actual el
  // separador se evaporaría antes de que el usuario alcance a verlo — vería parpadear
  // el badge sin enterarse nunca de cuáles eran los mensajes nuevos.
  const primerNuevoRef = useRef<string | null | undefined>(undefined);
  if (primerNuevoRef.current === undefined && data) {
    const primero = data.mensajes.find(
      (m) => m.autorTipo !== data.yo && m.leidoAt === null,
    );
    primerNuevoRef.current = primero?._id ?? null;
  }

  return { data, primerNuevoId: primerNuevoRef.current ?? null };
}

export function Conversacion({
  casoId,
  data,
  primerNuevoId,
  nombreOtro,
  avisoCompositor,
  alturaLista = 260,
  onVerAnteriores,
}: {
  casoId: Id<"casos">;
  data: Datos;
  primerNuevoId: string | null;
  /** Cómo se llama la contraparte en las burbujas ("Tu agente", el nombre, …). */
  nombreOtro: string;
  /** Recordatorio bajo el compositor (quién va a leer esto). */
  avisoCompositor: string;
  alturaLista?: number;
  onVerAnteriores?: () => void;
}) {
  const enviar = useMutation(api.mensajes.enviar);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const finRef = useRef<HTMLDivElement>(null);
  const cantidad = data.mensajes.length;

  // Scroll al último mensaje cuando llega uno nuevo (o al montar).
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [cantidad]);

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (enviando) return;
    if (!texto.trim()) return setError("Escribí el mensaje antes de enviarlo.");

    setEnviando(true);
    setError(null);
    try {
      await enviar({ casoId, texto });
      // Sin update optimista: el acuse es la live query, como en todo el repo.
      setTexto("");
    } catch (err) {
      setError(mensajeError(err, "No pudimos enviar el mensaje. Intentá de nuevo."));
    } finally {
      setEnviando(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía, Shift+Enter salta línea (convención de cualquier chat).
    // `isComposing` es obligatorio: sin él, Enter corta la composición de acentos
    // y diéresis (teclado español) y manda el mensaje a medio escribir.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void onSubmit();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          maxHeight: alturaLista,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingRight: 4,
        }}
      >
        {data.hayMas && onVerAnteriores && (
          <button type="button" onClick={onVerAnteriores} style={verAnterioresStyle}>
            Ver mensajes anteriores
          </button>
        )}

        {data.mensajes.map((m, i) => {
          const previo = data.mensajes[i - 1];
          const cambioDeDia = !previo || !mismoDia(previo.enviadoEn, m.enviadoEn);
          return (
            <div key={m._id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cambioDeDia && <Separador texto={formatFecha(m.enviadoEn)} />}
              {m._id === primerNuevoId && <Separador texto="Nuevos mensajes" destacado />}
              <Burbuja mensaje={m} mio={m.autorTipo === data.yo} nombreOtro={nombreOtro} />
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {data.cerrado ? (
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-inset)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-body-sm-size)",
            color: "var(--text-secondary)",
          }}
        >
          Este caso está cerrado. Podés leer la conversación, pero no enviar mensajes nuevos.
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Textarea
            rows={2}
            maxLength={MENSAJE_MAX_TEXTO}
            showCount
            helperText={avisoCompositor}
            placeholder="Escribí tu mensaje… (Enter envía, Shift+Enter salta línea)"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            disabled={enviando}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" size="sm" iconRight={<Send size={14} />} loading={enviando}>
              Enviar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Separador({ texto, destacado }: { texto: string; destacado?: boolean }) {
  const color = destacado ? "var(--primary-600)" : "var(--text-tertiary)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0" }}>
      <span style={{ flex: 1, height: 1, background: destacado ? "var(--primary-200)" : "var(--divider)" }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color,
          whiteSpace: "nowrap",
        }}
      >
        {texto}
      </span>
      <span style={{ flex: 1, height: 1, background: destacado ? "var(--primary-200)" : "var(--divider)" }} />
    </div>
  );
}

function Burbuja({
  mensaje,
  mio,
  nombreOtro,
}: {
  mensaje: Mensaje;
  mio: boolean;
  nombreOtro: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: mio ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "8px 11px",
          borderRadius: "var(--radius-md)",
          background: mio ? "var(--primary-50)" : "var(--bg-inset)",
          border: `1px solid ${mio ? "var(--primary-200)" : "var(--border)"}`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 2 }}>
          {mio ? "Vos" : nombreOtro}
        </div>
        <div
          style={{
            fontSize: "var(--text-body-sm-size)",
            color: "var(--text-primary)",
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {mensaje.texto}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 3,
            marginTop: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-tertiary)",
          }}
        >
          {formatHora(mensaje.enviadoEn)}
          {/* El acuse sólo tiene sentido en los mensajes propios: en los ajenos,
              `leidoAt` es cuándo los leí yo, que no es información para mí. */}
          {mio &&
            (mensaje.leidoAt ? (
              <CheckCheck size={12} aria-label="Leído" />
            ) : (
              <Check size={12} aria-label="Enviado" />
            ))}
        </div>
      </div>
    </div>
  );
}

const verAnterioresStyle: CSSProperties = {
  alignSelf: "center",
  background: "none",
  border: "none",
  padding: "4px 8px",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-link)",
};

/** Skeleton mientras la query resuelve. */
export function ConversacionSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Skeleton width="60%" height={30} radius="var(--radius-md)" />
      <Skeleton width="70%" height={30} radius="var(--radius-md)" style={{ alignSelf: "flex-end" }} />
      <Skeleton width="50%" height={30} radius="var(--radius-md)" />
    </div>
  );
}
