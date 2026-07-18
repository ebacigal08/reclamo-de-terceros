import { CSSProperties } from "react";
import type { FunctionReturnType } from "convex/server";
import { Clock } from "lucide-react";
import { api } from "@convex/_generated/api";
import { RELATO_PREGUNTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";
import { SectionCard } from "./fichaUi";

// Deriva del retorno de `casos.get` → siempre en sync con el backend, sin importar
// el tipo desde `FichaCasoView` (evita el ciclo ficha → card → ficha). Incluye `null`.
// `api` se usa SÓLO en posición de tipo (`typeof`), no en runtime.
type Relato = NonNullable<FunctionReturnType<typeof api.casos.get>>["relato"];

/**
 * Card "Relato del siniestro" de la ficha del agente (REC-76). Muestra las 7
 * preguntas del wizard con las respuestas que escribió el damnificado, **siempre
 * visible** (sin toggle). Es sólo lectura: el guard de dueño ya lo hizo `casos.get`,
 * que sólo expone el relato al agente dueño del caso.
 *
 * Presentacional puro (sin estado ni hooks) → no necesita "use client", igual que
 * `fichaUi.tsx`. `relato` puede ser `null` (sin relato) o `{completo:false}`
 * (borrador) → en ambos casos se muestra el estado "pendiente", como antes.
 */
export function RelatoCard({ relato }: { relato: Relato }) {
  if (!relato || !relato.completo) {
    return (
      <SectionCard title="Relato del siniestro">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={iconTile("var(--warning-50)", "var(--warning-600)")}>
            <Clock size={18} />
          </span>
          <div>
            <div style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)" }}>
              Relato pendiente
            </div>
            <div style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-secondary)" }}>
              El damnificado todavía no completó el relato del siniestro.
            </div>
          </div>
        </div>
      </SectionCard>
    );
  }

  // Relato completo: se pintan las respuestas SIEMPRE (aunque falte `completadoEn`,
  // que sólo alimenta el badge de la derecha).
  const respuestas = relato.respuestas;
  return (
    <SectionCard
      title="Relato del siniestro"
      right={
        relato.completadoEn ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
            Completado {formatFecha(relato.completadoEn)}
          </span>
        ) : undefined
      }
    >
      <div>
        {RELATO_PREGUNTAS.map((q, i) => {
          // Match por título (fuente principal: así se guarda hoy, RelatoView.tsx).
          // Fallback por índice SÓLO si no hubo match por título — defensivo ante
          // títulos históricos que hayan cambiado. Si un título correcto existe pero
          // desordenado, gana igual (el find no depende del orden).
          const found = respuestas.find((r) => r.pregunta === q.titulo) ?? respuestas[i];
          const valor = valorMostrado(q.tipo, found?.respuesta ?? "");
          const ultima = i === RELATO_PREGUNTAS.length - 1;
          return (
            <div
              key={q.id}
              style={{ padding: "11px 0", borderBottom: ultima ? "none" : "1px solid var(--divider)" }}
            >
              <div style={preguntaStyle}>{q.titulo}</div>
              <div style={respuestaStyle}>{valor}</div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/**
 * Texto legible de una respuesta (misma lógica que `displayRespuesta`/`mostrarFecha`
 * del wizard). Vacío/faltante → "—". `fecha` = ISO "YYYY-MM-DD" → DD/MM/AAAA en
 * horario LOCAL (evita el -1 por UTC); si el valor no es una fecha válida,
 * `formatFecha` devuelve "" y se muestra el crudo, sin romper. El resto (`si_no`,
 * `si_no_detalle` = "Sí — detalle"/"No", texto/textarea) se muestra tal cual.
 */
function valorMostrado(tipo: string, respuesta: string): string {
  const val = respuesta.trim();
  if (!val) return "—";
  if (tipo === "fecha") return formatFecha(`${val}T00:00:00`) || val;
  return val;
}

const iconTile = (bg: string, color: string): CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: "var(--radius-full)",
  background: bg,
  color,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

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
