import { ResponderPedidoView } from "./ResponderPedidoView";

export default async function ResponderPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResponderPedidoView pedidoId={id} />;
}
