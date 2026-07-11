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
 *  - tipoRespuesta: OFERTA | RECHAZO | CONTRAOFERTA | PENDIENTE  (sólo agente)
 *  - tipoGestion:   LLAMADA | CORREO | PRESENTACION | REUNION | OTRO  (sólo agente)
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

// Qué contestó la aseguradora en una instancia de la negociación (REC-31).
const tipoRespuesta = v.union(
  v.literal("OFERTA"),
  v.literal("RECHAZO"),
  v.literal("CONTRAOFERTA"),
  v.literal("PENDIENTE"),
);

// Qué acción hizo el agente sobre el caso (REC-32). Son CATEGORÍAS de canal, no
// estados: por eso en la UI se distinguen por ícono y no por badge de color
// (ver TIPOS_GESTION en src/lib/constants.ts).
const tipoGestion = v.union(
  v.literal("LLAMADA"),
  v.literal("CORREO"),
  v.literal("PRESENTACION"),
  v.literal("REUNION"),
  v.literal("OTRO"),
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
    cerradoEn: v.optional(v.number()), // timestamp de cierre (REC-66); ausente en casos cerrados antes de REC-66
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
    .index("by_caso_fecha", ["casoId", "fechaVencimiento"])
    // Job de alertas (REC-29): plazos no avisados con vencimiento próximo, sin
    // escanear toda la tabla —> q.eq("avisadoAlAgente", false).lte("fechaVencimiento", limite).
    .index("by_avisado_fecha", ["avisadoAlAgente", "fechaVencimiento"]),

  // ── Respuestas de la aseguradora (REC-31) · SÓLO AGENTE ────────
  // Bitácora interna: qué ofreció o resolvió la aseguradora en cada instancia.
  // El damnificado NO la ve → se lee SÓLO por `respuestasAseguradora.listPorCaso`
  // (guard rol=agente), NUNCA desde `casos.get`, que es una query dual-rol.
  respuestasAseguradora: defineTable({
    casoId: v.id("casos"),
    texto: v.string(),
    tipo: tipoRespuesta,
    fecha: v.string(), // ISO date (YYYY-MM-DD): cuándo se RECIBIÓ la respuesta
    // El `registradoAt` del issue = `_creationTime` (convención del módulo: no
    // hay campos "creadoEn" manuales). La query lo proyecta como `registradoEn`.
  })
    // Historial cronológico del caso por orden de índice, sin ordenar en JS
    // (mismo patrón que `plazos.by_caso_fecha`). Sirve además como "todas las de
    // un caso" por prefijo → no hace falta un `by_caso` aparte.
    //
    // DESEMPATE (misma `fecha`): el índice las devuelve en orden de creación, y
    // la UI invierte todo el listado → de dos respuestas recibidas el mismo día,
    // la ÚLTIMA que cargó el agente se muestra ARRIBA. Es deliberado (bitácora
    // operativa: lo último anotado va primero), no un efecto colateral.
    .index("by_caso_fecha", ["casoId", "fecha"]),

  // ── Log de gestiones del agente (REC-32) · SÓLO AGENTE ─────────
  // Bitácora interna: qué hizo el agente y cuándo (llamó, mandó un correo,
  // presentó, se reunió). El damnificado NO la ve → se lee SÓLO por
  // `gestiones.listPorCaso` (guard rol=agente), NUNCA desde `casos.get`, que es
  // una query dual-rol. Mismo criterio que `respuestasAseguradora` (REC-31).
  gestiones: defineTable({
    casoId: v.id("casos"),
    tipo: tipoGestion,
    descripcion: v.string(),
    fechaGestion: v.string(), // ISO date (YYYY-MM-DD): cuándo OCURRIÓ la gestión
    // El `registradoAt` del issue = `_creationTime` (convención del módulo: no
    // hay campos "creadoEn" manuales); la query lo proyecta como `registradoEn`.
    // Al EDITAR una gestión el `_creationTime` NO cambia, que es lo correcto:
    // es cuándo se anotó, no cuándo se corrigió.
  })
    // Historial cronológico por orden de índice, sin ordenar en JS. Sirve además
    // como "todas las de un caso" por prefijo → no hace falta un `by_caso` aparte.
    //
    // DESEMPATE (misma `fechaGestion`): el índice las devuelve en orden de
    // creación y la UI invierte el listado → de dos gestiones del mismo día, la
    // ÚLTIMA que cargó el agente se muestra ARRIBA. Es deliberado (bitácora
    // operativa: lo último anotado, primero), no un efecto colateral.
    //
    // Editar `fechaGestion` REUBICA la fila en la lista (el índice la re-ordena).
    // Es el comportamiento correcto, no un bug.
    .index("by_caso_fecha", ["casoId", "fechaGestion"]),

  // ── Notas internas del agente (REC-33) · SÓLO AGENTE ───────────
  // El espacio PRIVADO del agente dentro del caso: sospechas sobre el reclamo,
  // estrategia legal, datos sensibles de negociación, recordatorios. El criterio
  // de aceptación del issue es absoluto — "el damnificado no puede acceder a
  // ellas bajo ninguna circunstancia" — así que, igual que `gestiones` y
  // `respuestasAseguradora`, se leen SÓLO por `notasInternas.listPorCaso` (guard
  // rol=agente) y NUNCA desde `casos.get`, que es una query dual-rol.
  notasInternas: defineTable({
    casoId: v.id("casos"),
    // Quién la escribió. Se DERIVA de la sesión (`resolveRole`), nunca llega del
    // cliente. Hoy hay un solo agente; el campo es lo que mañana permite saber
    // quién escribió qué.
    agenteId: v.id("agentes"),
    texto: v.string(),
    // `creadaAt` del issue = `_creationTime` (convención del módulo); la query lo
    // proyecta como `creadaEn`. `actualizadaAt`, en cambio, SÍ es un campo real:
    // "cuándo se editó por última vez" no se deriva de nada. Ausente = nunca
    // editada, y sólo se setea si la edición cambió el texto de verdad.
    actualizadaAt: v.optional(v.number()),
  })
    // El orden es por CREACIÓN, no por una fecha editable: una nota es de cuando
    // la escribiste, así que editarla NO la reordena (a diferencia de `gestiones`,
    // donde la fecha es un campo del usuario). La consulta por este índice
    // devuelve en orden de creación ascendente y la UI invierte para mostrar la
    // más reciente arriba.
    .index("by_caso", ["casoId"]),

  // ── Notificaciones automáticas ─────────────────────────────────
  notificaciones: defineTable({
    destinatario,
    casoId: v.id("casos"),
    motivo: motivoNotificacion,
    visto: v.boolean(),
  }).index("by_caso_destinatario", ["casoId", "destinatario"]),
});
