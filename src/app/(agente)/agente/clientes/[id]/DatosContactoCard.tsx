"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { Mail, Pencil, Phone, Users } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Alert, Button, DataRow, Input, SectionCard } from "@/components/ui";
import { CLIENTE_MAX_NOMBRE, CLIENTE_MAX_TELEFONO } from "@/lib/constants";

/**
 * REC-90 · Card "Datos de contacto" de la ficha de cliente, con edición inline.
 *
 * ⚠️ El email es IDENTIDAD, no un dato de contacto más: con la cuenta activada es
 * el usuario con el que el damnificado entra al portal, y moverlo exigiría migrar
 * tres tablas en sincronía con `resolveRole` haciendo fail-closed en el medio. Por
 * eso, con `cuentaActivada`, el campo va deshabilitado y **ni siquiera se manda**
 * en la mutation (`email: undefined` = "no lo toco"), así el camino feliz no roza
 * el guard del server. El guard igual existe allá: esto es sólo UX.
 */

type Cliente = NonNullable<FunctionReturnType<typeof api.clientes.get>>;

/** Extrae el mensaje legible de un ConvexError (mismo helper que la ficha). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

export function DatosContactoCard({ cliente }: { cliente: Cliente }) {
  const editarCliente = useMutation(api.clientes.editar);

  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(cliente.nombre);
  const [telefono, setTelefono] = useState(cliente.telefono);
  const [email, setEmail] = useState(cliente.email);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Se prende sólo cuando el email REALMENTE cambió: el link de activación que ya
  // circuló sigue vivo y apunta a esta misma persona.
  const [avisoLink, setAvisoLink] = useState(false);

  const abrirEdicion = () => {
    setNombre(cliente.nombre);
    setTelefono(cliente.telefono);
    setEmail(cliente.email);
    setError(null);
    setAvisoLink(false);
    setEditando(true);
  };

  const cerrarEdicion = () => {
    setEditando(false);
    setError(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    // Guards de cliente, con los MISMOS mensajes que el server: esto sólo evita
    // el round-trip, no es la frontera.
    if (!nombre.trim()) return setError("Ingresá el nombre del damnificado.");
    if (!telefono.trim()) return setError("Ingresá un teléfono de contacto.");

    const emailNormalizado = email.trim().toLowerCase();
    const cambiaEmail =
      !cliente.cuentaActivada && emailNormalizado !== cliente.email;

    setGuardando(true);
    setError(null);
    try {
      await editarCliente({
        damnificadoId: cliente._id,
        nombre,
        telefono,
        // Con la cuenta activada no se manda el campo en absoluto.
        ...(cliente.cuentaActivada ? {} : { email: emailNormalizado }),
      });
      // El acuse es la live query: los datos de la ficha se actualizan solos.
      setAvisoLink(cambiaEmail);
      setEditando(false);
    } catch (err) {
      setError(mensajeError(err, "No pudimos guardar los cambios. Intentá de nuevo."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SectionCard
      title="Datos de contacto"
      right={
        editando ? undefined : (
          <Button variant="ghost" size="sm" iconLeft={<Pencil size={14} />} onClick={abrirEdicion}>
            Editar
          </Button>
        )
      }
      pad={editando ? "16px 18px" : "6px 18px 10px"}
    >
      {editando ? (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            label="Nombre completo"
            value={nombre}
            maxLength={CLIENTE_MAX_NOMBRE}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            disabled={cliente.cuentaActivada}
            onChange={(e) => setEmail(e.target.value)}
            helperText={
              cliente.cuentaActivada
                ? "Es el usuario con el que entra al portal."
                : undefined
            }
          />
          {cliente.cuentaActivada && (
            <Alert variant="info">
              El email no se puede cambiar porque {cliente.nombre.split(" ")[0]} ya
              activó su cuenta y es el usuario con el que entra al portal.
            </Alert>
          )}
          <Input
            label="Teléfono"
            value={telefono}
            maxLength={CLIENTE_MAX_TELEFONO}
            onChange={(e) => setTelefono(e.target.value)}
          />

          {error && <Alert variant="error">{error}</Alert>}

          <div style={{ display: "flex", gap: 8 }}>
            <Button type="submit" variant="primary" size="sm" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cerrarEdicion} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <DataRow icon={<Users size={17} />} label="Nombre completo" value={cliente.nombre} />
          <DataRow icon={<Mail size={17} />} label="Email" value={cliente.email} />
          <DataRow icon={<Phone size={17} />} label="Teléfono" value={cliente.telefono} mono last />

          {/* Corregir un email NO revoca el link de activación anterior, a
              propósito: revocar de oficio mataría en silencio un link que el
              agente ya mandó por WhatsApp. Se lo decimos y le señalamos dónde
              está la revocación explícita. */}
          {avisoLink && (
            <div style={{ marginTop: 12 }}>
              <Alert variant="info">
                Cambiaste el email. El link de activación anterior sigue siendo
                válido para quien lo haya recibido: si querés anularlo, generá uno
                nuevo desde &quot;Acceso del damnificado&quot;, en la ficha del caso.
              </Alert>
            </div>
          )}
          {/* El error no se pinta acá a propósito: un submit fallido deja el form
              ABIERTO, así que se ve junto a los campos que hay que corregir. */}
        </>
      )}
    </SectionCard>
  );
}
