import { Placeholder } from "@/components/ui";

export default async function ResponderPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Placeholder
      registro="damnificado"
      rec="REC-64 / REC-25"
      titulo="Responder pedido del agente"
      descripcion={`Ver el pedido del agente (pedido ${id}), subir lo solicitado y recibir confirmación. Estado "ya respondido" en solo lectura.`}
    />
  );
}
