import { ReactNode } from "react";
import { EmptyState } from "@/components/ui";

/**
 * Piezas compartidas de la ficha del caso (REC-20), extraídas de
 * `FichaCasoView.tsx` para que las cards que la ficha compone —empezando por
 * `RespuestasAseguradoraCard` (REC-31)— puedan usarlas sin importar de la ficha,
 * lo que crearía un ciclo de imports (ficha → card → ficha).
 *
 * Presentacionales puras, sin estado ni hooks → no necesitan "use client"
 * (misma convención que los componentes de `src/components/ui`).
 */

/**
 * `SectionCard` se mudó al design system (`@/components/ui`) cuando la ficha de
 * cliente (REC-90) pasó a componerse con la misma card. Se re-exporta desde acá
 * para no tocar los diez archivos de la ficha que ya la importaban de este módulo.
 */
export { SectionCard } from "@/components/ui";

/**
 * Estado vacío centrado dentro de una `SectionCard`.
 *
 * `action` (opcional) se reenvía a `EmptyState`: el vacío suele ser justo donde
 * el agente se topa con lo que falta, así que ahí conviene ofrecerle la acción.
 */
export function CenteredEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}

/**
 * Las fechas de calendario del dominio viajan como "YYYY-MM-DD": se parsean como
 * fecha LOCAL (con "T00:00:00") para no correr un día por timezone (AR es UTC-3).
 * Pasar el ISO pelado a `new Date()` lo interpretaría como UTC.
 */
export const fechaLocal = (iso: string) => new Date(`${iso}T00:00:00`);
