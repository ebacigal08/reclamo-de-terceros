import { Placeholder } from "@/components/ui";

export default async function FichaCasoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Placeholder
      registro="agente"
      rec="REC-56 / REC-20 / REC-37"
      titulo="Ficha del caso"
      descripcion={`Pantalla central de trabajo del agente (caso ${id}): pipeline visual, relato, documentos, pedidos, plazos, prioridad y acciones (solicitar documentación, cerrar caso).`}
    />
  );
}
