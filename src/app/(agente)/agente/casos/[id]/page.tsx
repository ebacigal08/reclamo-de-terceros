import { FichaCasoView } from "./FichaCasoView";

// Server wrapper (convención del repo: la ruta resuelve `params` en el server y
// pasa el id al componente cliente que hace `useQuery`). La ficha en sí (REC-20)
// vive en `FichaCasoView` ("use client").
export default async function FichaCasoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FichaCasoView casoId={id} />;
}
