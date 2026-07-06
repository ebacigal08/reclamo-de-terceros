import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { DevPasswordReset } from "./passwordReset";

/**
 * Configuración de Convex Auth (REC-17).
 *
 * Provider Password (email + contraseña). El rol (agente / damnificado) NO
 * lo maneja Convex Auth: se deriva por email en `users.ts` (ver `resolveRole`),
 * contra las tablas de dominio `agentes` / `damnificados`.
 *
 * Las cuentas se crean server-side (no hay auto-registro): el agente por seed,
 * el damnificado por invitación/activación (ver `invitaciones.ts`).
 *
 * `reset` habilita el flujo de recuperación de contraseña (flows "reset" y
 * "reset-verification") para ambos roles. En dev, el código se loguea en el
 * servidor en vez de enviarse por email (ver `passwordReset.ts`).
 *
 * ⚠️ Barrera de seguridad (M1): el provider de reset DEV queda OFF por default.
 * Sólo se activa con doble condición explícita: `DEPLOYMENT_ENV==="dev"` Y
 * `ENABLE_DEV_PASSWORD_RESET==="true"`. Con `reset: undefined`, Convex Auth
 * responde "Password reset is not enabled" — sin loguear el OTP — también ante
 * llamadas directas al backend (`signIn(flow:"reset")`), no sólo desde la UI.
 * NUNCA setear `ENABLE_DEV_PASSWORD_RESET` en un deployment al que apunte un
 * frontend público (ver `.env.example`). El reemplazo por email real
 * (Resend/Nodemailer) queda pendiente.
 */
const devResetEnabled =
  process.env.DEPLOYMENT_ENV === "dev" &&
  process.env.ENABLE_DEV_PASSWORD_RESET === "true";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({ reset: devResetEnabled ? DevPasswordReset : undefined }),
  ],
});
