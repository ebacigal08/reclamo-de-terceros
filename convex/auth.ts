import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { PasswordReset } from "./passwordReset";

/**
 * Configuración de Convex Auth (REC-17, REC-65).
 *
 * Provider Password (email + contraseña). El rol (agente / damnificado) NO
 * lo maneja Convex Auth: se deriva por email en `users.ts` (ver `resolveRole`),
 * contra las tablas de dominio `agentes` / `damnificados`.
 *
 * Las cuentas se crean server-side (no hay auto-registro): el agente por seed,
 * el damnificado por invitación/activación (ver `invitaciones.ts`).
 *
 * `reset` habilita el flujo de recuperación de contraseña (flows "reset" y
 * "reset-verification") para ambos roles. Desde REC-65 el código se ENVÍA por
 * email (Resend, ver `passwordReset.ts`) en vez de loguearse, así que el provider
 * queda activo siempre — ya no hay gate DEV. Si no se puede entregar el email,
 * el flujo falla explícitamente (ver `sendEmailOrThrow`), nunca en silencio.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ reset: PasswordReset })],
});
