import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Amparo — CRM Siniestros AR",
  description:
    "Acompañamos a personas damnificadas en su reclamo ante la aseguradora.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
