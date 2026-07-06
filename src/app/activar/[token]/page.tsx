import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { Alert, Button } from "@/components/ui";
import { RUTAS } from "@/lib/constants";
import { ActivarForm } from "./ActivarForm";

/**
 * Activación de cuenta del damnificado (REC-17). Ruta pública: el damnificado
 * llega acá desde el link de invitación (ver convex/invitaciones.ts), sin sesión.
 * El estado del token se resuelve en el server; el formulario (client) fija la
 * contraseña e inicia sesión.
 */
export default async function ActivarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const estado = await fetchQuery(api.invitaciones.porToken, { token }).catch(
    () => ({ estado: "invalido" as const }),
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 22px",
        background: "var(--bg-page)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          Amparo
        </div>

        {estado.estado === "valido" ? (
          <ActivarForm token={token} nombre={estado.nombre} email={estado.email} />
        ) : estado.estado === "usado" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Alert variant="info" title="Esta invitación ya fue usada">
              Tu cuenta ya está activada. Iniciá sesión con tu email y tu contraseña.
            </Alert>
            <Link href={RUTAS.login} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="lg" fullWidth>
                Ir a iniciar sesión
              </Button>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Alert variant="error" title="Invitación inválida o vencida">
              Este link no es válido o ya expiró. Pedile a tu agente que te reenvíe la invitación.
            </Alert>
            <Link href={RUTAS.login} style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="lg" fullWidth>
                Volver al inicio
              </Button>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
