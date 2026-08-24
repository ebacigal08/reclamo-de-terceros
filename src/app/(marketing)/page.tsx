import { Hero } from "./_components/Hero";
import { ComoFunciona } from "./_components/ComoFunciona";
import { TiposDeReclamo } from "./_components/TiposDeReclamo";
import { Confianza } from "./_components/Confianza";
import { Faq } from "./_components/Faq";
import { CierreCta } from "./_components/CierreCta";

/**
 * REC-154 · La landing pública, en `/`.
 *
 * ⚠️ Este archivo y `src/app/page.tsx` NO PUEDEN COEXISTIR: los dos resuelven a
 * `/` y Next falla el build con "two parallel pages resolve to the same path".
 * El puente que dejó REC-153 se borró en el mismo commit que creó éste, y
 * `scripts/rutas.test.mjs` vigila que nadie lo reintroduzca.
 *
 * Todo lo que cuelga de acá es RSC salvo `FormularioConsulta`, que es el único
 * `"use client"` de la landing. Con eso la página llega al navegador
 * prácticamente sin JavaScript propio.
 *
 * La decisión de producto es que `/` sirve la landing SIEMPRE, incluso a un
 * usuario logueado: menos aristas de redirect, menos bucles. Quien quiera volver
 * al panel usa "Ingresar" → `/login`, y desde ahí el middleware lo manda a
 * `/inicio`.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <ComoFunciona />
      <TiposDeReclamo />
      <Confianza />
      <Faq />
      <CierreCta />
    </>
  );
}
