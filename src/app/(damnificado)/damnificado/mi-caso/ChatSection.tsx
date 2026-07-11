"use client";

import { CSSProperties, useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import {
  Conversacion,
  ConversacionSkeleton,
  badgeNoLeidos,
  useConversacion,
} from "@/components/chat/Conversacion";

/**
 * REC-34 · "Mensajes con tu agente", dentro del hub "Mi caso".
 *
 * Sección inline, no ruta nueva: el issue pide "un acceso visible al chat desde Mi
 * caso", y la conversación es de consultas rápidas. Va ARRIBA de "Mis documentos"
 * porque es lo accionable: si hay mensajes sin leer, el damnificado tiene que verlos
 * sin scrollear hasta el final de la página.
 *
 * `casos.miCaso` ya devuelve `caso._id`, así que no hubo que tocar esa query.
 */
export function ChatSection({
  casoId,
  nombreAgente,
}: {
  casoId: Id<"casos">;
  nombreAgente?: string;
}) {
  const [limite, setLimite] = useState<number | undefined>(undefined);
  const { data, primerNuevoId } = useConversacion(casoId, limite);

  // Fail-closed: si la query dice `null` (no debería, es su propio caso), no
  // renderizamos la sección en vez de mostrar un error que el damnificado no puede
  // accionar.
  if (data === null) return null;

  const noLeidos = data?.noLeidos ?? 0;

  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h2 style={tituloStyle}>Mensajes con tu agente</h2>
        {noLeidos > 0 && (
          <span aria-label={`${noLeidos} mensajes sin leer`} style={badgeStyle}>
            {badgeNoLeidos(noLeidos)}
          </span>
        )}
      </div>

      <div style={cardStyle}>
        {data === undefined ? (
          <ConversacionSkeleton />
        ) : (
          <Conversacion
            casoId={casoId}
            data={data}
            primerNuevoId={primerNuevoId}
            nombreOtro={nombreAgente || "Tu agente"}
            avisoCompositor="Tu agente recibe este mensaje por email."
            alturaLista={300}
            onVerAnteriores={() => setLimite((n) => (n ?? 30) + 50)}
          />
        )}
      </div>
    </section>
  );
}

// Espeja los estilos del hub (`MiCasoView`): mismo padding de sección, mismo tipo de
// título, misma card de superficie.
const sectionStyle: CSSProperties = { padding: "24px 20px 0" };

const tituloStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-h4-size)",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const badgeStyle: CSSProperties = {
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
};

const cardStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-sm)",
  padding: 14,
};
