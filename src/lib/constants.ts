/**
 * Constantes del dominio — Amparo CRM.
 * Fuente: PRD (Notion) + tareas de Linear. Mantener sincronizado con
 * convex/schema.ts (los valores deben coincidir con los v.literal del enum).
 */

// ── Tipo de siniestro ────────────────────────────────────────────
export const TIPOS_SINIESTRO = [
  { value: "ACCIDENTE", label: "Accidente" },
  { value: "ROBO", label: "Robo" },
  { value: "INCENDIO", label: "Incendio" },
  { value: "INUNDACION", label: "Inundación" },
  { value: "OTRO", label: "Otro" },
] as const;
export type TipoSiniestro = (typeof TIPOS_SINIESTRO)[number]["value"];

// ── Etapas del pipeline (en orden) ───────────────────────────────
// labelAgente = texto denso para el agente
// labelHumano = traducción para "Mi caso" del damnificado
// badge       = variante de color del badge (ver design system Amparo)
export const ETAPAS = [
  { value: "NUEVO", labelAgente: "Nuevo", labelHumano: "Tu caso fue registrado", badge: "nuevo" },
  { value: "EXPEDIENTE_EN_ARMADO", labelAgente: "En armado", labelHumano: "Estamos armando tu expediente", badge: "armado" },
  { value: "EXPEDIENTE_COMPLETO", labelAgente: "Completo", labelHumano: "Tu expediente está completo", badge: "completo" },
  { value: "PRESENTADO_A_ASEGURADORA", labelAgente: "Presentado", labelHumano: "Tu reclamo fue presentado a la aseguradora", badge: "presentado" },
  { value: "EN_NEGOCIACION", labelAgente: "Negociación", labelHumano: "Tu reclamo está en negociación con la aseguradora", badge: "negociacion" },
  { value: "CERRADO", labelAgente: "Resuelto", labelHumano: "Tu caso fue cerrado", badge: "resuelto" },
] as const;
export type Etapa = (typeof ETAPAS)[number]["value"];
export const ETAPA_TOTAL_PASOS = ETAPAS.length; // 6

// ── Prioridad ────────────────────────────────────────────────────
export const PRIORIDADES = [
  { value: "ALTA", label: "Alta", badge: "alta" },
  { value: "MEDIA", label: "Media", badge: "media" },
  { value: "BAJA", label: "Baja", badge: "baja" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["value"];
export const PRIORIDAD_DEFAULT: Prioridad = "MEDIA";

// ── Resultado del cierre ─────────────────────────────────────────
export const RESULTADOS_CIERRE = [
  { value: "RESUELTO", label: "Resuelto", descripcion: "La aseguradora aceptó el reclamo y el damnificado recibió lo que correspondía.", badge: "resuelto" },
  { value: "RECHAZADO", label: "Rechazado", descripcion: "La aseguradora rechazó el reclamo y no se va a apelar.", badge: "rechazado" },
  { value: "EN_APELACION", label: "En apelación", descripcion: "El reclamo fue rechazado pero se está apelando la decisión.", badge: "apelacion" },
] as const;
export type ResultadoCierre = (typeof RESULTADOS_CIERRE)[number]["value"];

// ── Motivos de notificación → texto humano para el damnificado ───
export const MOTIVO_NOTIFICACION_TEXTO: Record<string, string> = {
  CASO_ABIERTO: "Tu caso fue abierto por tu agente",
  NUEVO_PEDIDO: "Tu agente te pidió documentación",
  AVANCE_ETAPA: "Tu reclamo avanzó de etapa",
  EXPEDIENTE_VALIDADO: "Tu agente revisó y validó tu expediente",
  PLAZO_PROXIMO: "Hay un plazo próximo a vencer",
  PEDIDO_RESPONDIDO: "Recibimos tu respuesta",
  CASO_CERRADO: "Tu reclamo fue cerrado",
};

// ── Relato del siniestro · las 7 preguntas del wizard (REC-22) ───
export const RELATO_PREGUNTAS = [
  { id: "cuando", titulo: "¿Cuándo ocurrió el siniestro?", tipo: "fecha", ayuda: "Si no recordás el día exacto, poné el más aproximado." },
  { id: "donde", titulo: "¿Dónde ocurrió?", tipo: "texto", ayuda: "Ej: Av. Rivadavia 4500, CABA." },
  { id: "que_paso", titulo: "¿Qué pasó? Contalo con tus palabras.", tipo: "textarea", ayuda: "No hace falta que sea perfecto ni que uses términos técnicos." },
  { id: "dano", titulo: "¿Cuál fue el daño o la pérdida?", tipo: "texto", ayuda: "" },
  { id: "denuncia", titulo: "¿Ya hiciste alguna denuncia o contacto con la aseguradora?", tipo: "si_no_detalle", ayuda: "Si ya llamaste, escribiste o presentaste algo, contanos." },
  { id: "documentos", titulo: "¿Tenés documentos relacionados?", tipo: "si_no", ayuda: "" },
  { id: "algo_mas", titulo: "¿Algo más que el agente debería saber?", tipo: "textarea", ayuda: "" },
] as const;
export const RELATO_TOTAL_PASOS = RELATO_PREGUNTAS.length; // 7

// ── Archivos aceptados en la carga de documentos (REC-23) ────────
export const ARCHIVOS_ACEPTADOS = ["image/jpeg", "image/png", "image/heic", "application/pdf"];
// Extensiones espejo de ARCHIVOS_ACEPTADOS (con punto, en minúscula). Sirven para
// el `accept` del input y como fallback de validación cuando el content-type no es
// confiable (típico de HEIC): tanto el pre-check del cliente como el server las usan.
export const EXTENSIONES_ACEPTADAS = [".jpg", ".jpeg", ".png", ".heic", ".pdf"];
export const ARCHIVO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ── Rutas ────────────────────────────────────────────────────────
export const RUTAS = {
  login: "/login",
  recuperar: "/recuperar",
  activar: (token: string) => `/activar/${token}`,
  agente: {
    casos: "/agente/casos",
    historico: "/agente/casos/historico",
    nuevoCaso: "/agente/casos/nuevo",
    caso: (id: string) => `/agente/casos/${id}`,
    solicitar: (id: string) => `/agente/casos/${id}/solicitar`,
    cerrar: (id: string) => `/agente/casos/${id}/cerrar`,
  },
  damnificado: {
    onboarding: "/damnificado/onboarding",
    miCaso: "/damnificado/mi-caso",
    relato: "/damnificado/relato",
    documentos: "/damnificado/documentos",
    pedido: (id: string) => `/damnificado/pedido/${id}`,
  },
} as const;
