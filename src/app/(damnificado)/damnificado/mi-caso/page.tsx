import { MiCasoView } from "./MiCasoView";

// REC-27 · Hub del damnificado. La vista resuelve el caso desde la sesión
// (query `casos.miCaso`, sin `casoId` en la URL), así que la página sólo monta
// el client component.
export default function MiCasoPage() {
  return <MiCasoView />;
}
