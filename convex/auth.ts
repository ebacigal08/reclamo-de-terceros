import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Configuración de Convex Auth (REC-17 · core).
 *
 * Provider Password (email + contraseña). El rol (agente / damnificado) NO
 * lo maneja Convex Auth: se deriva por email en `users.ts` (ver `resolveRole`),
 * contra las tablas de dominio `agentes` / `damnificados`.
 *
 * Las cuentas se crean server-side (no hay auto-registro): el agente por seed,
 * el damnificado por invitación (fuera de alcance de esta entrega).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
