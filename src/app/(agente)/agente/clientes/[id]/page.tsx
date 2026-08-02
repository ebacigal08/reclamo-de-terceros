import { FichaClienteView } from "./FichaClienteView";

// Server wrapper (convención del repo: la ruta resuelve `params` en el server y
// pasa el id al componente cliente que hace `useQuery`). La ficha en sí (REC-90)
// vive en `FichaClienteView` ("use client").
export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FichaClienteView damnificadoId={id} />;
}
