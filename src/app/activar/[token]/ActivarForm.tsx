"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Alert, Button, Input } from "@/components/ui";

/** Extrae el mensaje legible de un error de Convex (o un fallback). */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

export function ActivarForm({
  token,
  nombre,
  email,
}: {
  token: string;
  nombre: string;
  email: string;
}) {
  const router = useRouter();
  const activar = useAction(api.invitaciones.activar);
  const { signIn } = useAuthActions();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      // 1) Crea la cuenta Password y marca la cuenta como activada (server).
      const res = await activar({ token, password });
      // 2) Inicia sesión y deja que el resolver de "/" mande a onboarding.
      await signIn("password", {
        email: res.email,
        password,
        flow: "signIn",
      });
      router.replace("/");
    } catch (err) {
      setError(mensajeError(err, "No pudimos activar tu cuenta. Intentá de nuevo."));
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "var(--text-h2-size)", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          Hola, {nombre.split(" ")[0]}
        </h1>
        <p style={{ margin: "7px 0 0", fontSize: "var(--text-body-size)", color: "var(--text-secondary)" }}>
          Creá una contraseña para activar tu cuenta y seguir tu caso. Tu email es{" "}
          <strong style={{ color: "var(--text-primary)" }}>{email}</strong>.
        </p>
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {error && (
          <Alert variant="error" title="No pudimos activar tu cuenta">
            {error}
          </Alert>
        )}

        <Input
          label="Contraseña"
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
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

        <Input
          label="Repetir contraseña"
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Volvé a escribirla"
          size="lg"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={error ? " " : undefined}
          required
        />

        <Button variant="primary" size="lg" fullWidth type="submit" loading={loading}>
          {loading ? "Activando…" : "Activar mi cuenta"}
        </Button>
      </form>
    </div>
  );
}
