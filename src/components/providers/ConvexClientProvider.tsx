"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

// Se instancia una sola vez. Si todavía no está configurada la env
// NEXT_PUBLIC_CONVEX_URL (antes de correr `npx convex dev`), el provider
// se salta para poder seguir maquetando pantallas sin romper el render.
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    if (typeof window !== "undefined") {
      console.warn(
        "[Amparo] Falta NEXT_PUBLIC_CONVEX_URL. Corré `npx convex dev` y completá .env.local.",
      );
    }
    return <>{children}</>;
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
