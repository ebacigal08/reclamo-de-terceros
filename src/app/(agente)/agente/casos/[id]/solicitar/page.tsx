import { Placeholder } from "@/components/ui";

export default async function SolicitarDocumentacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Placeholder
      registro="agente"
      rec="REC-58 / REC-24"
      titulo="Solicitar documentación"
      descripcion={`Drawer sobre la ficha (caso ${id}): historial de pedidos y campo para escribir el nuevo pedido. Al enviar, notifica al damnificado por email.`}
    />
  );
}
