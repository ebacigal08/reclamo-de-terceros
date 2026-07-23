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

// ── Respuesta de la aseguradora (REC-31) · SÓLO AGENTE ───────────
// El orden del array es el orden del <Select>. `badge` = key de token en
// semantic.css: `rechazado` y `pendiente` se reusan (mismo significado que en
// cierre/pedidos); `oferta` y `contraoferta` son tokens nuevos, porque `resuelto`
// (verde) mentiría sobre una oferta y `negociacion` es visualmente idéntico a
// `pendiente` (ambos warning-50/700) → los estados quedarían indistinguibles.
export const TIPOS_RESPUESTA = [
  { value: "OFERTA", label: "Oferta", badge: "oferta" },
  { value: "CONTRAOFERTA", label: "Contraoferta", badge: "contraoferta" },
  { value: "RECHAZO", label: "Rechazo", badge: "rechazado" },
  { value: "PENDIENTE", label: "Pendiente de resolución", badge: "pendiente" },
] as const;
export type TipoRespuesta = (typeof TIPOS_RESPUESTA)[number]["value"];
/** Espejo de MAX_TEXTO en convex/respuestasAseguradora.ts (el server valida igual). */
export const RESPUESTA_MAX_TEXTO = 2000;

// ── Gestiones del agente (REC-32) · SÓLO AGENTE ──────────────────
// El orden del array es el orden del <Select>.
//
// SIN `badge`, a diferencia de todos los otros enums de acá, y es una decisión,
// no un olvido: estos 5 valores son CATEGORÍAS de canal (por dónde se hizo la
// gestión), no ESTADOS —que es lo que el badge de color codifica en Amparo
// (etapa, prioridad, resultado, tipo de respuesta)—. Además ya no queda ninguna
// escala de color libre en colors.css: cinco badges nuevos tendrían que reciclar
// hues cargados de significado (danger=rechazo, success=resuelto…) y serían ruido
// en la lista más larga de la ficha. Se distinguen por ÍCONO + el label en texto
// (el mapa tipo→ícono vive en GestionesCard.tsx, que es donde importa lucide).
export const TIPOS_GESTION = [
  { value: "LLAMADA", label: "Llamada" },
  { value: "CORREO", label: "Correo" },
  { value: "PRESENTACION", label: "Presentación" },
  { value: "REUNION", label: "Reunión" },
  { value: "OTRO", label: "Otro" },
] as const;
export type TipoGestion = (typeof TIPOS_GESTION)[number]["value"];
/** Espejo de MAX_DESCRIPCION en convex/gestiones.ts (el server valida igual). */
export const GESTION_MAX_DESCRIPCION = 1000;

// ── Notas internas del agente (REC-33) · SÓLO AGENTE ─────────────
// No hay enum: la nota es texto libre. Sólo el límite, espejo de MAX_TEXTO en
// convex/notasInternas.ts (el server valida igual).
export const NOTA_MAX_TEXTO = 2000;

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

// ── Motivos → texto para el AGENTE (REC-68 · REC-74) ─────────────
// Distintos a los del damnificado: el mismo motivo se lee al revés según de qué lado
// estés ("Recibimos tu respuesta" vs "Un damnificado respondió tu pedido"). Están los
// motivos que llegan con `destinatario: "AGENTE"`. Los mensajes del chat NO están acá
// a propósito (no se persisten como notificación — ver `datosSoloEmail` en
// convex/notificaciones.ts).
export const MOTIVO_NOTIFICACION_AGENTE: Record<string, string> = {
  PEDIDO_RESPONDIDO: "Un damnificado respondió tu pedido",
  PLAZO_PROXIMO: "Hay un plazo próximo a vencer",
  // REC-74 · un aviso por email al agente no se entregó (rebote/queja/fallo).
  AVISO_NO_ENTREGADO: "No pudimos entregar un aviso por email — revisá tu casilla",
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
  raiz: "/",
  login: "/login",
  recuperar: "/recuperar",
  activar: (token: string) => `/activar/${token}`,
  agente: {
    casos: "/agente/casos",
    novedades: "/agente/novedades",
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
