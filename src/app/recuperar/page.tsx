"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Eye, EyeOff } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { RUTAS } from "@/lib/constants";

/**
 * Recuperación de contraseña (REC-17). Flujo nativo del provider Password:
 *  - paso "email": pide el código de reset (signIn flow "reset").
 *  - paso "codigo": verifica el código y fija la nueva contraseña
 *    (signIn flow "reset-verification"), que además deja la sesión iniciada.
 *
 * En dev, el código se loguea en el servidor Convex (ver passwordReset.ts);
 * no se envía email. Funciona para ambos roles (agente y damnificado activado).
 */
export default function RecuperarPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [paso, setPaso] = useState<"email" | "codigo">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("password", { email: email.trim().toLowerCase(), flow: "reset" });
      setPaso("codigo");
    } catch {
      setError("No pudimos iniciar la recuperación. Revisá el email e intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function fijarPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword,
        flow: "reset-verification",
      });
      // reset-verification deja la sesión iniciada: "/" enruta según rol.
      router.replace("/");
    } catch {
      setError("El código es incorrecto o venció. Pedí uno nuevo.");
      setLoading(false);
    }
  }

  // El reset DEV no se ofrece en producción (la barrera real es el gate del
  // backend en convex/auth.ts). Aquí sólo evitamos exponer la pantalla.
  if (process.env.NODE_ENV === "production") {
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
        <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Amparo
          </div>
          <Alert variant="info" title="No disponible">
            La recuperación de contraseña todavía no está habilitada. Escribile a tu
            agente para que te ayude a recuperar el acceso.
          </Alert>
          <p style={{ textAlign: "center", margin: 0 }}>
            <Link href={RUTAS.login} style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--primary-600)", textDecoration: "none" }}>
              Volver a iniciar sesión
            </Link>
          </p>
        </div>
      </main>
    );
  }

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
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          Amparo
        </div>

        <div>
          <h1 style={{ margin: 0, fontSize: "var(--text-h2-size)", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Recuperar contraseña
          </h1>
          <p style={{ margin: "7px 0 0", fontSize: "var(--text-body-size)", color: "var(--text-secondary)" }}>
            {paso === "email"
              ? "Ingresá tu email y te enviamos un código para crear una nueva contraseña."
              : `Ingresá el código que enviamos a ${email} y elegí una nueva contraseña.`}
          </p>
        </div>

        {error && (
          <Alert variant="error" title="No pudimos continuar">
            {error}
          </Alert>
        )}

        {paso === "email" ? (
          <form onSubmit={pedirCodigo} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              size="lg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error ? " " : undefined}
              required
            />
            <Button variant="primary" size="lg" fullWidth type="submit" loading={loading}>
              {loading ? "Enviando…" : "Enviar código"}
            </Button>
          </form>
        ) : (
          <form onSubmit={fijarPassword} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Input
              label="Código de verificación"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Código de 8 dígitos"
              size="lg"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={error ? " " : undefined}
              helperText="Modo dev: el código aparece en la consola del servidor (todavía no se envía por email)."
              required
            />
            <Input
              label="Nueva contraseña"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              size="lg"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={error ? " " : undefined}
              required
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                  style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 0 }}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />
            <Button variant="primary" size="lg" fullWidth type="submit" loading={loading}>
              {loading ? "Guardando…" : "Cambiar contraseña"}
            </Button>
            <button
              type="button"
              onClick={() => { setPaso("email"); setError(null); setCode(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--text-secondary)" }}
            >
              Usar otro email
            </button>
          </form>
        )}

        <p style={{ textAlign: "center", margin: 0 }}>
          <Link href={RUTAS.login} style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--primary-600)", textDecoration: "none" }}>
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
