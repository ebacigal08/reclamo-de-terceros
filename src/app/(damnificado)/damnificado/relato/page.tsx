import { RelatoView } from "./RelatoView";

// REC-22 · Wizard de relato del siniestro. La vista resuelve la sesión y el
// caso (query `relato.miRelato`) y hace el guard de acceso; la página sólo monta
// el client component.
export default function RelatoPage() {
  return <RelatoView />;
}
