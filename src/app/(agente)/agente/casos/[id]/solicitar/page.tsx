import { SolicitarDocumentacionView } from "./SolicitarDocumentacionView";

// Server wrapper (convención del repo: la ruta resuelve `params` en el server y
// pasa el id al componente cliente que hace `useQuery`). La pantalla en sí
// (REC-24) vive en `SolicitarDocumentacionView` ("use client").
export default async function SolicitarDocumentacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SolicitarDocumentacionView casoId={id} />;
}
