"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, Copy, Link2, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, Button } from "@/components/ui";
import { formatFecha } from "@/lib/format";

/**
 * Acceso del damnificado al portal (REC-71).
 *
 * Vive DENTRO de la card "Damnificado" (no en una card propia): la columna izquierda
 * de la ficha ya tiene 6 cards y la derecha 3, y "cómo entra esta persona al sistema"
 * es parte de sus datos, no un tema aparte.
 *
 * Se renderiza SÓLO si la cuenta no está activada. Trae su propia query con su propio
 * guard (`invitaciones.accesoDamnificado`), como el resto de las cards del caso: nada
 * de esto cuelga de `casos.get`, que es dual-rol — y el token NO puede pasar por ahí.
 *
 * El `estado` del último envío lo DERIVA el server (`estadoInvitacion` en lib.ts): la
 * lectura de los tres timestamps es una sola y no se reimplementa acá.
 *
 * ⚠️ El link de activación ES UNA CREDENCIAL (quien lo tenga puede fijar la contraseña
 * del damnificado). Ver el JSDoc de `convex/invitaciones.ts:accesoDamnificado`.
 */
export function AccesoDamnificado({ casoId }: { casoId: Id<"casos"> }) {
  const acceso = useQuery(api.invitaciones.accesoDamnificado, { casoId });
  const enviarAhora = useAction(api.invitaciones.enviarAhora);
  const rotarLink = useMutation(api.invitaciones.rotarLinkActivacion);

  const [enviando, setEnviando] = useState(false);
  const [rotando, setRotando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [resultado, setResultado] = useState<
    { tipo: "ok" | "error"; texto: string } | null
  >(null);

  // `undefined` = cargando; `null` = no aplica (cuenta ya activada, o caso ajeno).
  if (acceso === undefined || acceso === null) return null;

  const { urlActivacion, estado, invitacionEnviadaEn } = acceso;
  const fallo = estado === "FALLIDA";

  const leyenda =
    estado === "FALLIDA"
      ? "El último envío de la invitación falló. Podés reintentarlo ahora."
      : estado === "ENTREGADA" && invitacionEnviadaEn !== null
        ? `Invitación enviada el ${formatFecha(invitacionEnviadaEn)}.`
        : estado === "EN_CURSO"
          ? "Hay un envío en curso…"
          : "Todavía no se le envió la invitación.";

  function mensajeDeError(err: unknown): string {
    return err instanceof ConvexError && typeof err.data === "string"
      ? err.data
      : "No pudimos completar la acción. Probá de nuevo.";
  }

  async function onEnviar() {
    setEnviando(true);
    setResultado(null);
    try {
      const { email } = await enviarAhora({ casoId });
      setResultado({ tipo: "ok", texto: `Invitación enviada a ${email}.` });
    } catch (err) {
      setResultado({ tipo: "error", texto: mensajeDeError(err) });
    } finally {
      setEnviando(false);
    }
  }

  async function onRotar() {
    setRotando(true);
    setResultado(null);
    try {
      await rotarLink({ casoId });
      setResultado({
        tipo: "ok",
        texto: urlActivacion
          ? "Link regenerado. El anterior ya no sirve."
          : "Link de activación generado.",
      });
    } catch (err) {
      setResultado({ tipo: "error", texto: mensajeDeError(err) });
    } finally {
      setRotando(false);
    }
  }

  async function onCopiar() {
    if (!urlActivacion) return;
    try {
      // `writeText` es lo PRIMERO que se espera: si antes hiciéramos `await` de otra
      // cosa, Safari y Firefox revocan la activación de usuario y la copia falla. Por
      // eso la URL viene de la query (ya cargada) y no se pide on-click.
      await navigator.clipboard.writeText(urlActivacion);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Contexto no seguro (http:// en LAN) o permiso denegado. Antes esto decía
      // "¡Copiado!" igual, y el agente pegaba en WhatsApp lo que tuviera antes en el
      // portapapeles.
      setResultado({
        tipo: "error",
        texto: `No pudimos copiar automáticamente. Copiá el link a mano: ${urlActivacion}`,
      });
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span
          style={{
            color: fallo ? "var(--danger-600)" : "var(--warning-600)",
            display: "flex",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <TriangleAlert size={16} />
        </span>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-body-sm-size)",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Todavía no activó su cuenta
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: "var(--text-caption-size)",
              color: fallo ? "var(--danger-600)" : "var(--text-tertiary)",
            }}
          >
            {leyenda}
          </p>
        </div>
      </div>

      {resultado && (
        <Alert variant={resultado.tipo === "ok" ? "success" : "error"}>
          {resultado.texto}
        </Alert>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void onEnviar()}
          loading={enviando}
          iconLeft={enviando ? undefined : <Send size={15} />}
        >
          {enviando ? "Enviando…" : "Enviar invitación por email"}
        </Button>

        {urlActivacion ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onCopiar()}
              iconLeft={copiado ? <Check size={15} /> : <Copy size={15} />}
            >
              {copiado ? "¡Copiado!" : "Copiar link de activación"}
            </Button>
            {/* Revocación: rotar el token mata cualquier link que haya circulado (un
                mail reenviado, un WhatsApp a un número equivocado). Era la única
                garantía que se perdió al dejar de regenerar el token en cada alta. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onRotar()}
              loading={rotando}
              iconLeft={rotando ? undefined : <RotateCcw size={15} />}
            >
              {rotando ? "Regenerando…" : "Regenerar link"}
            </Button>
          </>
        ) : (
          // Damnificados del seed (o previos a REC-71): todavía no tienen token, así
          // que no hay link que copiar hasta materializarlo.
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onRotar()}
            loading={rotando}
            iconLeft={rotando ? undefined : <Link2 size={15} />}
          >
            {rotando ? "Generando…" : "Generar link de activación"}
          </Button>
        )}
      </div>

      {urlActivacion && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-caption-size)",
            color: "var(--text-tertiary)",
            lineHeight: 1.45,
          }}
        >
          El link le permite fijar su contraseña y entrar. Compartilo sólo con{" "}
          {acceso.nombre}; si se filtró, regeneralo.
        </p>
      )}
    </div>
  );
}
