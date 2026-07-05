import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Esquema de la base de datos — Amparo CRM (MVP).
 *
 * Traduce el modelo de datos del PRD (Notion) y de la tarea REC-16 de Linear.
 * Convex agrega automáticamente a cada documento `_id` y `_creationTime`,
 * así que no definimos `id` ni la mayoría de los "creadoEn" manuales.
 *
 * Enums del dominio (ver src/lib/constants.ts para labels legibles):
 *  - tipoSiniestro: ACCIDENTE | ROBO | INCENDIO | INUNDACION | OTRO
 *  - etapa:         NUEVO | EXPEDIENTE_EN_ARMADO | EXPEDIENTE_COMPLETO |
 *                   PRESENTADO_A_ASEGURADORA | EN_NEGOCIACION | CERRADO
 *  - prioridad:     ALTA | MEDIA | BAJA
 *  - resultadoCierre: RESUELTO | RECHAZADO | EN_APELACION
 *  - motivo (notif): CASO_ABIERTO | NUEVO_PEDIDO | AVANCE_ETAPA |
 *                    EXPEDIENTE_VALIDADO | PLAZO_PROXIMO | PEDIDO_RESPONDIDO |
 *                    CASO_CERRADO
 */

const tipoSiniestro = v.union(
  v.literal("ACCIDENTE"),
  v.literal("ROBO"),
  v.literal("INCENDIO"),
  v.literal("INUNDACION"),
  v.literal("OTRO"),
);

const etapa = v.union(
  v.literal("NUEVO"),
  v.literal("EXPEDIENTE_EN_ARMADO"),
  v.literal("EXPEDIENTE_COMPLETO"),
  v.literal("PRESENTADO_A_ASEGURADORA"),
  v.literal("EN_NEGOCIACION"),
  v.literal("CERRADO"),
);

const prioridad = v.union(
  v.literal("ALTA"),
  v.literal("MEDIA"),
  v.literal("BAJA"),
);

const resultadoCierre = v.union(
  v.literal("RESUELTO"),
  v.literal("RECHAZADO"),
  v.literal("EN_APELACION"),
);

const subidoPor = v.union(v.literal("AGENTE"), v.literal("DAMNIFICADO"));

const destinatario = v.union(v.literal("AGENTE"), v.literal("DAMNIFICADO"));

const motivoNotificacion = v.union(
  v.literal("CASO_ABIERTO"),
  v.literal("NUEVO_PEDIDO"),
  v.literal("AVANCE_ETAPA"),
  v.literal("EXPEDIENTE_VALIDADO"),
  v.literal("PLAZO_PROXIMO"),
  v.literal("PEDIDO_RESPONDIDO"),
  v.literal("CASO_CERRADO"),
);

export default defineSchema({
  // ── Convex Auth: sesiones, cuentas, tokens, verificación ───────
  // Provee la tabla `users` (identidad). El rol se deriva por email
  // contra `agentes` / `damnificados` (ver convex/users.ts).
  ...authTables,

  // ── El profesional que gestiona los casos ──────────────────────
  agentes: defineTable({
    nombre: v.string(),
    email: v.string(),
    // Las credenciales las gestiona Convex Auth (tabla authAccounts), no acá.
  }).index("by_email", ["email"]),

  // ── La persona afectada. La crea el agente; accede por invitación ─
  damnificados: defineTable({
    nombre: v.string(),
    email: v.string(),
    telefono: v.string(),
    // Credenciales gestionadas por Convex Auth (authAccounts), no acá.
    invitacionToken: v.optional(v.string()),
    invitacionEnviadaEn: v.optional(v.number()),
    cuentaActivada: v.boolean(),
    onboardingCompletado: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_invitacionToken", ["invitacionToken"]),

  // ── El elemento central del sistema ────────────────────────────
  casos: defineTable({
    numeroCaso: v.string(), // SIN-AAAA-NNNNN, legible
    damnificadoId: v.id("damnificados"),
    agenteId: v.id("agentes"),
    tipoSiniestro,
    aseguradora: v.string(),
    etapa,
    prioridad,
    cerrado: v.boolean(),
    resultadoCierre: v.optional(resultadoCierre),
  })
    .index("by_agente", ["agenteId", "cerrado"])
    .index("by_damnificado", ["damnificadoId"])
    .index("by_numeroCaso", ["numeroCaso"]),

  // ── Relato guiado (wizard de 7 preguntas) ──────────────────────
  relatosSiniestro: defineTable({
    casoId: v.id("casos"),
    respuestas: v.array(
      v.object({ pregunta: v.string(), respuesta: v.string() }),
    ),
    completo: v.boolean(),
    completadoEn: v.optional(v.number()),
  }).index("by_caso", ["casoId"]),

  // ── Archivos del expediente ────────────────────────────────────
  documentos: defineTable({
    casoId: v.id("casos"),
    nombreArchivo: v.string(),
    storageId: v.optional(v.id("_storage")), // archivo en Convex File Storage
    url: v.optional(v.string()),
    tipoMime: v.optional(v.string()),
    tamanoBytes: v.optional(v.number()),
    subidoPor,
  }).index("by_caso", ["casoId"]),

  // ── Pedidos de documentación del agente al damnificado ─────────
  pedidosDocumentacion: defineTable({
    casoId: v.id("casos"),
    descripcion: v.string(),
    respondido: v.boolean(),
    respondidoEn: v.optional(v.number()),
  }).index("by_caso", ["casoId"]),

  // ── Plazos críticos del reclamo ────────────────────────────────
  plazos: defineTable({
    casoId: v.id("casos"),
    descripcion: v.string(),
    fechaVencimiento: v.string(), // ISO date (YYYY-MM-DD)
    avisadoAlAgente: v.boolean(),
  })
    .index("by_caso", ["casoId"])
    // Permite tomar el plazo más próximo de un caso por orden de índice,
    // sin ordenar en JS (REC-18 · lista del agente).
    .index("by_caso_fecha", ["casoId", "fechaVencimiento"]),

  // ── Notificaciones automáticas ─────────────────────────────────
  notificaciones: defineTable({
    destinatario,
    casoId: v.id("casos"),
    motivo: motivoNotificacion,
    visto: v.boolean(),
  }).index("by_caso_destinatario", ["casoId", "destinatario"]),
});
