import type { Metadata } from "next";
import { Header } from "./_components/Header";
import { Footer } from "./_components/Footer";

/**
 * Layout del route group `(marketing)`. Los paréntesis NO agregan segmento a la
 * URL: la página de adentro sigue siendo `/`. Lo que compra el group es poder
 * darle a la parte pública su propio chrome y su propia metadata sin tocar el
 * root layout, que es compartido con todo el CRM autenticado.
 *
 * La metadata de acá pisa la del root layout (`"Amparo — CRM Siniestros AR"`),
 * que describe la herramienta interna y no le dice nada a alguien que llega de
 * Google buscando cómo reclamarle a una aseguradora.
 *
 * `robots`, `sitemap`, favicon, OG image y `metadataBase` van en REC-155, que
 * sale INMEDIATAMENTE después de esto: hoy `/activar/[token]` es crawleable, y
 * con una landing indexable en la raíz eso deja de ser teórico.
 */
export const metadata: Metadata = {
  title: "Amparo — Reclamos a aseguradoras",
  description:
    "Si te chocaron o sufriste un siniestro, llevamos tu reclamo ante la aseguradora y seguís todo el expediente desde tu celular.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}
