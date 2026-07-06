"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Eye, EyeOff } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { RUTAS } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: "signIn",
      });
      // Redirección por rol: el resolver "/" (server) lee la sesión y manda
      // a la pantalla correcta. Evita la carrera de leer `me` en cliente.
      router.replace("/");
    } catch {
      setError("Email o contraseña incorrectos");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Panel hero navy (sólo desktop) */}
      <aside
        className="login-hero"
        style={{
          flex: "0 0 45%",
          background: "var(--primary-900)",
          color: "#FFFFFF",
          padding: "52px 46px",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Amparo</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em" }}>
            Estás acompañado en cada paso de tu reclamo.
          </h2>
          <p style={{ margin: 0, fontSize: "var(--text-body-lg-size)", lineHeight: 1.6, color: "rgba(255,255,255,0.72)" }}>
            Amparo centraliza tu caso, te dice qué falta y te avisa cuando hay novedades. Del lado
            del agente, todo el portafolio bajo control.
          </p>
        </div>
        <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          © 2026 Amparo · Siniestros AR
        </p>
      </aside>

      {/* Formulario */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 26px",
          background: "var(--bg-page)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 26 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "var(--text-h2-size)", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              Ingresar
            </h1>
            <p style={{ margin: "7px 0 0", fontSize: "var(--text-body-size)", color: "var(--text-secondary)" }}>
              Accedé a tu cuenta de Amparo
            </p>
          </div>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {error && (
              <Alert variant="error" title="No pudimos ingresar">
                {error}. Revisá tus datos e intentá de nuevo.
              </Alert>
            )}

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

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <Input
                label="Contraseña"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Tu contraseña"
                size="lg"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {/* Reset DEV: sólo se ofrece fuera de producción (la barrera real
                  es el gate del backend; ver convex/auth.ts). */}
              {process.env.NODE_ENV !== "production" && (
                <Link
                  href={RUTAS.recuperar}
                  style={{ alignSelf: "flex-end", fontSize: "var(--text-body-sm-size)", fontWeight: 600, color: "var(--primary-600)", textDecoration: "none" }}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              )}
            </div>

            <Button variant="primary" size="lg" fullWidth type="submit" loading={loading}>
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <p style={{ textAlign: "center", margin: 0, fontSize: "var(--text-caption-size)", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            ¿Sos nuevo? Tu agente te envía la invitación por email.
          </p>
        </div>
      </div>
    </div>
  );
}
