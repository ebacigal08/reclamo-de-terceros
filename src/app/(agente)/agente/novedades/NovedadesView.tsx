"use client";

import { CSSProperties, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Bell, ChevronRight, Clock, Inbox, MailWarning, Send } from "lucide-react";
import { api } from "@convex/_generated/api";
import { EmptyState, Skeleton } from "@/components/ui";
import { MOTIVO_NOTIFICACION_AGENTE, RUTAS } from "@/lib/constants";
import { formatFecha } from "@/lib/format";

/**
 * REC-68 · Novedades del agente.
 *
 * Hasta acá, las notificaciones con `destinatario: "AGENTE"` se insertaban en la base
 * y NADIE LAS LEÍA: no había query que las trajera y la campana del header estaba
 * deshabilitada ("Disponible pronto"). El agente sólo se enteraba por email.
 *
 * Por qué una PANTALLA y no un dropdown en la campana: (a) el shell del agente no
 * tiene header global —la campana vivía sólo en la lista de casos, así que desde una
 * ficha el agente no se enteraba de nada—, y el sidebar sí es global; (b) el design
 * system no tiene NI UN componente de overlay (no hay Modal, Toast ni Dropdown: todo
 * lo tipo-modal se resolvió inline o con pantalla aparte), así que un popover sería el
 * primer portal del proyecto, con su deuda de foco y accesibilidad, sólo para mostrar
 * una lista.
 *
 * Los mensajes del chat (REC-34) NO aparecen acá: no se persisten como notificación,
 * ya tienen su propio indicador, y meterlos sería mantener dos estados de lectura
 * sobre el mismo hecho.
 */

type Novedad = NonNullable<
  FunctionReturnType<typeof api.notificaciones.listAgente>
>["novedades"][number];

const ICONO_MOTIVO: Record<string, typeof Send> = {
  PEDIDO_RESPONDIDO: Send,
  PLAZO_PROXIMO: Clock,
  AVISO_NO_ENTREGADO: MailWarning,
};

export function NovedadesView() {
  const data = useQuery(api.notificaciones.listAgente, {});
  const marcarVistas = useMutation(api.notificaciones.marcarVistasAgente);

  const enVueloRef = useRef(false);
  const ultimoIntentoRef = useRef(-1);
  const noVistas = data?.noVistas ?? 0;

  // Auto-marcado al renderizar la pantalla, mismo criterio que el feed de "Mi caso":
  // entrar a "Novedades" ES haberlas visto. El loop se corta solo porque tras el patch
  // la live query re-emite con `noVistas = 0`; el ref evita reintentar la misma
  // cantidad si la mutation falló.
  useEffect(() => {
    if (noVistas === 0 || enVueloRef.current) return;
    if (ultimoIntentoRef.current === noVistas) return;
    ultimoIntentoRef.current = noVistas;
    enVueloRef.current = true;
    void marcarVistas({})
      .catch(() => {
        ultimoIntentoRef.current = -1;
      })
      .finally(() => {
        enVueloRef.current = false;
      });
  }, [noVistas, marcarVistas]);

  // El estado "sin ver" se CONGELA con el primer snapshot: el auto-marcado lo apaga en
  // ~200ms, así que si lo leyéramos del estado actual, el agente entraría y vería todo
  // como ya visto, sin poder distinguir qué era nuevo.
  const sinVerRef = useRef<Set<string> | null>(null);
  if (sinVerRef.current === null && data) {
    sinVerRef.current = new Set(data.novedades.filter((n) => !n.visto).map((n) => n._id));
  }
  const eraNueva = (id: string) => sinVerRef.current?.has(id) ?? false;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 className="text-h2" style={{ margin: 0 }}>
          Novedades
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "var(--text-body-size)" }}>
          Lo que pasó en tus casos sin que estuvieras mirando
        </p>
      </div>

      {data === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={68} radius="var(--radius-lg)" />
          ))}
        </div>
      ) : data === null || data.novedades.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "56px 0" }}>
          <EmptyState
            icon={<Inbox size={26} strokeWidth={1.5} />}
            title="Sin novedades"
            description="Cuando un damnificado responda un pedido o se acerque el vencimiento de un plazo, lo vas a ver acá."
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.novedades.map((n) => (
            <NovedadRow key={n._id} novedad={n} nueva={eraNueva(n._id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NovedadRow({ novedad, nueva }: { novedad: Novedad; nueva: boolean }) {
  const router = useRouter();
  const Icono = ICONO_MOTIVO[novedad.motivo] ?? Bell;
  const texto = MOTIVO_NOTIFICACION_AGENTE[novedad.motivo] ?? "Novedad en un caso";

  return (
    <button
      type="button"
      onClick={() => router.push(RUTAS.agente.caso(novedad.casoId))}
      style={{
        ...filaStyle,
        borderLeft: `3px solid ${nueva ? "var(--primary-500)" : "transparent"}`,
        background: nueva ? "var(--primary-50)" : "var(--bg-surface)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={iconoStyle}>
          <Icono size={17} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
          <span style={{ fontSize: "var(--text-body-size)", fontWeight: 600, color: "var(--text-primary)" }}>
            {texto}
          </span>
          <span style={{ fontSize: "var(--text-body-sm-size)", color: "var(--text-tertiary)" }}>
            {novedad.damnificadoNombre}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {" · "}
              {novedad.numeroCaso}
              {" · "}
              {formatFecha(novedad.creadoEn)}
            </span>
          </span>
        </span>
      </span>
      <ChevronRight size={18} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
    </button>
  );
}

const filaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  width: "100%",
  padding: "14px 16px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-sm)",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "var(--font-sans)",
};

const iconoStyle: CSSProperties = {
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
