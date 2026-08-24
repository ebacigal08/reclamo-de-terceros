import { redirect } from "next/navigation";
import { RUTAS } from "@/lib/constants";

/**
 * REC-153 · Puente temporal. El resolver de rol se mudó a `/inicio` para dejar
 * la raíz libre para la landing pública, y esto queda mientras dure la mudanza:
 * cualquier pestaña vieja, bookmark o link externo que todavía apunte a `/`
 * termina en el mismo lugar de siempre.
 *
 * Se BORRA en REC-154, en el mismo commit que agrega `(marketing)/page.tsx`:
 * los dos archivos resuelven a `/` y Next falla el build con "two parallel
 * pages resolve to the same path", así que no pueden convivir ni un commit.
 */
export default function RaizPage() {
  redirect(RUTAS.inicio);
}
