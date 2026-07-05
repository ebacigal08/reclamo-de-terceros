import { redirect } from "next/navigation";
import { RUTAS } from "@/lib/constants";

// La app arranca en el login; el rol se detecta al autenticar (REC-17).
export default function Home() {
  redirect(RUTAS.login);
}
