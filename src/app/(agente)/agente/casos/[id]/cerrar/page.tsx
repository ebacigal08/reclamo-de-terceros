import { Placeholder } from "@/components/ui";

export default async function CerrarCasoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Placeholder
      registro="agente"
      rec="REC-59 / REC-30"
      titulo="Cerrar caso"
      descripcion={`Modal sobre la ficha (caso ${id}): elegir el resultado final (resuelto, rechazado o en apelación) y confirmar. Acción irreversible.`}
    />
  );
}
