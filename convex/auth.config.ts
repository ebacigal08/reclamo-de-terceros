/**
 * Config de proveedores de identidad para Convex Auth.
 * `CONVEX_SITE_URL` lo setea el deployment; las claves JWT_PRIVATE_KEY / JWKS
 * se generan con `npx @convex-dev/auth` y viven en el env del deployment.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
