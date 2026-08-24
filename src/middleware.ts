import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

/**
 * Protección de rutas — SÓLO grueso (autenticado / no autenticado).
 * La autorización real por rol y por recurso vive en las funciones de Convex
 * (ver convex/users.ts y convex/casos.ts); este middleware es sólo UX.
 */
const esRutaProtegida = createRouteMatcher(["/agente(.*)", "/damnificado(.*)"]);
const esLogin = createRouteMatcher(["/login"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const autenticado = await convexAuth.isAuthenticated();

  if (esRutaProtegida(request) && !autenticado) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
  // Ya logueado en el login → al resolver de rol.
  //
  // ⚠️ REC-153 · El destino tiene que ser el RESOLVER, nunca la landing pública
  // de `/`. El agente desactivado sigue AUTENTICADO (la baja no toca sus
  // credenciales), así que rebota por acá cada vez: hoy sale /login → /inicio →
  // el resolver ve `sin_acceso` → /sin-acceso, el callejón sin salida que corta
  // el bucle de REC-91. Con la landing de destino sería /login → landing →
  // "Ingresar" → /login → landing, para siempre, y /sin-acceso dejaría de ser
  // alcanzable: exactamente el modo de falla que esa pantalla existe para evitar.
  if (esLogin(request) && autenticado) {
    return nextjsMiddlewareRedirect(request, "/inicio");
  }
});

export const config = {
  // Corre en todas las rutas salvo estáticos de Next.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
