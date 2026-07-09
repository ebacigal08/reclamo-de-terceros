import { CerrarCasoView } from "./CerrarCasoView";

// Server wrapper (convención del repo: la ruta resuelve `params` en el server y
// pasa el id al componente cliente que hace `useQuery`). La pantalla en sí
// (REC-30) vive en `CerrarCasoView` ("use client").
export default async function CerrarCasoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CerrarCasoView casoId={id} />;
}
