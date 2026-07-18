/**
 * Taxonomía de tipos de documento del checklist (REC-77). **Fuente ÚNICA**,
 * compartida por el backend Convex (`./tiposDocumento`) y el front
 * (`@convex/tiposDocumento`). El front NO redefine la taxonomía.
 *
 * Módulo PLANO a propósito: sólo importa `v`/`Infer` de `convex/values`
 * (isomórfico, browser-safe) — **nada de `convex/server` ni runtime de Convex** —
 * para que el bundle del navegador sea seguro.
 *
 * `tipoDocumentoValidator` se escribe EXPLÍCITO (convención del repo, tipos
 * limpios) y el check de sincronía de abajo lo ata a `TIPOS_DOCUMENTO`: si
 * divergen (en cualquier sentido), `npm run typecheck` FALLA.
 */
import { v, type Infer } from "convex/values";

export const TIPOS_DOCUMENTO = [
  { value: "CEDULA_VEHICULO", label: "Cédula verde/azul (titularidad)", grupo: "vehiculo" },
  { value: "LICENCIA_CONDUCIR", label: "Licencia de conducir", grupo: "vehiculo" },
  { value: "PRESUPUESTO_DANOS", label: "Presupuesto / cotización de daños", grupo: "vehiculo" },
  { value: "FOTOS_DANOS", label: "Fotografías de los daños", grupo: "vehiculo" },
  { value: "DENUNCIA_POLICIAL", label: "Denuncia policial", grupo: "adicional" },
  { value: "CERTIFICADO_COBERTURA", label: "Certificado de cobertura del seguro", grupo: "adicional" },
  { value: "OTROS", label: "Otros (especificar)", grupo: "adicional" },
  { value: "DNI_DAMNIFICADO", label: "DNI del damnificado", grupo: "lesiones" },
  { value: "HISTORIA_CLINICA", label: "Historia clínica / certificados médicos", grupo: "lesiones" },
  { value: "FACTURAS_MEDICAS", label: "Facturas médicas / de sepelio", grupo: "lesiones" },
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]["value"];
export type GrupoDocumento = (typeof TIPOS_DOCUMENTO)[number]["grupo"];

/** Grupos en orden, con su título para el selector del agente. */
export const GRUPOS_DOCUMENTO: { value: GrupoDocumento; label: string }[] = [
  { value: "vehiculo", label: "Documentación del vehículo dañado" },
  { value: "adicional", label: "Documentación adicional" },
  { value: "lesiones", label: "Si hubo lesiones" },
];

/** Etiqueta libre de `OTROS`: máximo de caracteres. */
export const DOC_ETIQUETA_MAX = 80;

/** `value → label` (para mostrar un ítem tipado; `OTROS` usa su `etiqueta`). */
export const TIPO_DOCUMENTO_LABEL = Object.fromEntries(
  TIPOS_DOCUMENTO.map((t) => [t.value, t.label]),
) as Record<TipoDocumento, string>;

// Validador explícito (convención del repo — tipos limpios).
export const tipoDocumentoValidator = v.union(
  v.literal("CEDULA_VEHICULO"),
  v.literal("LICENCIA_CONDUCIR"),
  v.literal("PRESUPUESTO_DANOS"),
  v.literal("FOTOS_DANOS"),
  v.literal("DENUNCIA_POLICIAL"),
  v.literal("CERTIFICADO_COBERTURA"),
  v.literal("OTROS"),
  v.literal("DNI_DAMNIFICADO"),
  v.literal("HISTORIA_CLINICA"),
  v.literal("FACTURAS_MEDICAS"),
);

// Check de sincronía en COMPILACIÓN: si `tipoDocumentoValidator` y
// `TIPOS_DOCUMENTO` divergen (en cualquier sentido), este `true` deja de tipar y
// `npm run typecheck` falla. Usa `Infer` (patrón ya presente en el repo,
// convex/notificaciones.ts).
type _SyncTipoDoc = [TipoDocumento] extends [Infer<typeof tipoDocumentoValidator>]
  ? [Infer<typeof tipoDocumentoValidator>] extends [TipoDocumento]
    ? true
    : never
  : never;
const _tipoDocSync: _SyncTipoDoc = true;
void _tipoDocSync;
