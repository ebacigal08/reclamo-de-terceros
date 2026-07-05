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
  if (esLogin(request) && autenticado) {
    return nextjsMiddlewareRedirect(request, "/");
  }
});

export const config = {
  // Corre en todas las rutas salvo estáticos de Next.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
