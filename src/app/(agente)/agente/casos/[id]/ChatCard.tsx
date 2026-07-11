"use client";

import { useState } from "react";
import { Eye, MessageCircle } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { Alert } from "@/components/ui";
import {
  Conversacion,
  ConversacionSkeleton,
  badgeNoLeidos,
  useConversacion,
} from "@/components/chat/Conversacion";
import { CenteredEmpty, SectionCard } from "./fichaUi";

/**
 * REC-34 · Chat con el damnificado, en la ficha del agente.
 *
 * Va en la columna DERECHA de la ficha, y es deliberado: la izquierda ya tiene seis
 * cards (relato, documentos, pedidos, respuestas, gestiones, notas) y un chat en la
 * séptima posición quedaría a cuatro scrolls del encabezado. Un chat que el agente no
 * ve es un chat muerto.
 *
 * DISTINCIÓN CON "NOTAS INTERNAS" — es seguridad, no estética. Las dos cards conviven
 * en la misma ficha y son exactamente opuestas: la nota es privada, esto lo lee el
 * damnificado. Notas lleva el chip "🔒 Privada"; esta card lleva el chip espejo
 * "👁 Lo ve el damnificado", en el header y repetido bajo el compositor. Si el agente
 * se confunde de card, escribe una sospecha sobre el reclamo en un canal que el
 * damnificado abre.
 */

export function ChatCard({
  casoId,
  damnificadoNombre,
  damnificadoActivado,
}: {
  casoId: Id<"casos">;
  damnificadoNombre: string;
  damnificadoActivado: boolean;
}) {
  const [limite, setLimite] = useState<number | undefined>(undefined);
  const { data, primerNuevoId } = useConversacion(casoId, limite);

  const noLeidos = data?.noLeidos ?? 0;

  return (
    <SectionCard
      // Título corto a propósito: la columna derecha es angosta (~370px) y con el chip
      // al lado, "Mensajes con el damnificado" se parte en tres líneas. El chip ya dice
      // quién lo lee, que es la información que importa.
      title="Mensajes"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {noLeidos > 0 && (
            <span
              aria-label={`${noLeidos} mensajes sin leer`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 20,
                height: 20,
                padding: "0 6px",
                borderRadius: "var(--radius-full)",
                background: "var(--primary-600)",
                color: "var(--text-on-primary)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {badgeNoLeidos(noLeidos)}
            </span>
          )}
          <ChipVisible />
        </div>
      }
    >
      {!damnificadoActivado && (
        <div style={{ marginBottom: 12 }}>
          <Alert variant="warning">
            {damnificadoNombre || "El damnificado"} todavía no activó su cuenta. Podés
            escribirle —va a leer los mensajes cuando entre por primera vez—, pero por
            ahora no le llega el aviso por email.
          </Alert>
        </div>
      )}

      {data === undefined ? (
        <ConversacionSkeleton />
      ) : data === null ? (
        // Fail-closed. En la práctica sólo una race: si la ficha renderizó, el agente
        // ya es dueño del caso.
        <div style={{ padding: "10px 0", fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>
          No pudimos cargar la conversación.
        </div>
      ) : data.mensajes.length === 0 && data.cerrado ? (
        <CenteredEmpty
          icon={<MessageCircle size={22} strokeWidth={1.5} />}
          title="Sin mensajes"
          description="No hubo conversación en este caso."
        />
      ) : (
        <Conversacion
          casoId={casoId}
          data={data}
          primerNuevoId={primerNuevoId}
          nombreOtro={damnificadoNombre || "El damnificado"}
          avisoCompositor="El damnificado lee este mensaje."
          onVerAnteriores={() => setLimite((n) => (n ?? 30) + 50)}
        />
      )}
    </SectionCard>
  );
}

/** Chip espejo del "🔒 Privada" de Notas internas. Se ve SIEMPRE, también cerrado. */
function ChipVisible() {
  return (
    <span
      title="A diferencia de las notas internas, el damnificado lee esta conversación."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        background: "var(--primary-50)",
        border: "1px solid var(--primary-200)",
        color: "var(--primary-700)",
        fontSize: "var(--text-label-size)",
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <Eye size={11} />
      Lo ve el damnificado
    </span>
  );
}
