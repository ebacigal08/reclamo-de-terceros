import type { EmailConfig } from "@convex-dev/auth/server";

/**
 * Provider de recuperación de contraseña — modo DEV (REC-17).
 *
 * El flujo de reset del provider Password (flows "reset" / "reset-verification")
 * exige un "email provider" que entregue un código de verificación. En vez de
 * enviar un email real, este provider **loguea el código en la consola del
 * servidor Convex** (visible en la terminal de `npx convex dev`).
 *
 * El envío real (Resend / Nodemailer) queda para una entrega posterior: REC-15
 * lo define como "configurar, no implementar todavía". Cuando se cablee el
 * proveedor, se reemplaza `sendVerificationRequest` por el envío real y no hay
 * que tocar nada más del flujo.
 */

/** OTP numérico de `longitud` dígitos con CSPRNG (disponible en el runtime de acciones). */
function generarOtpNumerico(longitud: number): string {
  const buf = new Uint32Array(longitud);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => (n % 10).toString()).join("");
}

export const DevPasswordReset: EmailConfig = {
  id: "dev-password-reset",
  type: "email",
  name: "Recuperación de contraseña",
  // El código de reset vive 15 minutos.
  maxAge: 60 * 15,
  // OTP corto y legible para copiar del log en dev (8 dígitos).
  generateVerificationToken: async () => generarOtpNumerico(8),
  sendVerificationRequest: async ({ identifier: email, token }) => {
    // DEV: no se envía email; el código se toma de este log del servidor.
    console.log(
      `[auth][reset][DEV] Código de recuperación para ${email}: ${token} ` +
        "(válido 15 min). En producción esto se envía por email.",
    );
  },
  // Igual que el helper Email de Convex Auth: el código sólo vale para el email
  // con el que se pidió (evita reutilizar un OTP contra otra cuenta).
  authorize: async (params, account) => {
    if (
      typeof params.email !== "string" ||
      account.providerAccountId !== params.email
    ) {
      throw new Error("El código no corresponde a este email.");
    }
  },
};
