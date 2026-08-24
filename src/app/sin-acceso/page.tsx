"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui";
import { RUTAS } from "@/lib/constants";

/**
 * REC-91 · Pantalla del agente desactivado.
 *
 * ⚠️ NO consulta nada y NO redirige a ningún lado, y ésa es la razón de que
 * exista: es un callejón sin salida deliberado.
 *
 * Sin ella hay un bucle real. Un agente al que le desactivaron la cuenta
 * conserva su cookie de sesión (la baja no toca las credenciales, para poder
 * reactivarlo sin re-invitarlo), así que sigue estando AUTENTICADO: el
 * middleware lo saca de `/login` y lo manda al resolver de rol (`/inicio`
 * desde REC-153), y el resolver —donde `me` ya no resuelve— lo mandaría de
 * vuelta a `/login`. Para siempre.
 *
 * Una página que consulta `me` y decide podría loopear igual; una que nunca
 * redirige, no puede. Por eso el mensaje es fijo y el único camino de salida es
 * el botón, que es una acción del usuario y no una redirección automática.
 *
 * Va fuera de `esRutaProtegida` (middleware.ts): meterla adentro sería poner el
 * rebote entre el middleware y ella misma.
 */
export default function SinAccesoPage() {
  const { signOut } = useAuthActions();
  const [saliendo, setSaliendo] = useState(false);

  async function cerrarSesion() {
    // Mismo patrón que la Sidebar del agente: cerrar sesión no puede "fallar"
    // hacia el usuario. Navegación DURA (window.location, NO router.replace) para
    // que un document load re-evalúe el middleware con la cookie ya borrada; el
    // redirect va en `finally`, así que si signOut rechaza salimos igual.
    setSaliendo(true);
    try {
      await signOut();
    } catch {
      // best-effort: se traga el fallo; el redirect del finally corre igual.
    } finally {
      window.location.replace(RUTAS.login);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 26px",
        background: "var(--bg-page)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          textAlign: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            color: "var(--text-tertiary)",
          }}
        >
          <ShieldOff size={26} strokeWidth={1.5} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--text-h2-size)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            Tu acceso está desactivado
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-body-size)",
              lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}
          >
            Tu cuenta sigue existiendo y tu trabajo está intacto, pero por ahora no
            podés entrar al panel. Si creés que es un error, escribile a quien
            administra los usuarios del estudio para que te reactive.
          </p>
        </div>

        <Button
          variant="secondary"
          size="lg"
          fullWidth
          onClick={cerrarSesion}
          loading={saliendo}
        >
          {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
        </Button>
      </div>
    </div>
  );
}
