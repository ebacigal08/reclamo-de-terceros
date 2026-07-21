import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { tipoDocumentoValidator } from "./tiposDocumento";

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

// Quién escribió un mensaje del chat (REC-34). Misma forma que `subidoPor` y
// `destinatario`, pero semántica propia: discrimina AUTOR, y su complemento define
// al ÚNICO lector posible del mensaje (la contraparte).
const autorTipo = v.union(v.literal("AGENTE"), v.literal("DAMNIFICADO"));

// Participante del chat de un caso (REC-34), para `chatEstado`.
const participante = v.union(v.literal("AGENTE"), v.literal("DAMNIFICADO"));

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
  // REC-74 · alerta in-app al agente cuando un aviso por email NO se entregó
  // (rebote/queja/fallo detectado por webhook). Es sólo in-app: se inserta directo
  // (no pasa por `datosNotificacion`/`enviar`, así que no manda email).
  v.literal("AVISO_NO_ENTREGADO"),
);

export default defineSchema({
  // ── Convex Auth: sesiones, cuentas, tokens, verificación ───────
  // Provee la tabla `users` (identidad). El rol se deriva por email
  // contra `agentes` / `damnificados` (ver convex/users.ts).
  ...authTables,

  // ── El profesional que gestiona los casos ──────────────────────
  agentes: defineTable({
    nombre: v.string(),
    // IDENTIDAD. Es la mitad derecha del match de rol de `resolveRole`
    // (`users.email` ↔ `agentes.email`) y es fail-closed: si se desincronizan,
    // el login sigue andando (depende de `authAccounts`) pero la app entera se
    // le cierra al agente. NO es, necesariamente, dónde recibe los avisos.
    email: v.string(),
    // ENTREGA (REC-73). Dónde recibe los avisos por email, si es distinto de su
    // identidad. Nació porque el agente de producción es la identidad demo
    // `agente@amparo.ar`: una dirección que no existe, que rebotó, y que Resend
    // tiene SUPRIMIDA → durante meses NINGÚN aviso al agente se entregó (plazo
    // por vencer, pedido respondido, chat), en silencio y sin rastro.
    //
    // Separar entrega de identidad evita la cirugía de migrar los tres campos que
    // hoy contienen el email (authAccounts.providerAccountId = login, users.email
    // + agentes.email = rol) en sincronía y a mano.
    //
    // Ausente ⇒ cae en `email` (el comportamiento histórico). Se lee SIEMPRE con
    // `emailDeAvisos()` de `lib.ts`, nunca a mano.
    emailNotificaciones: v.optional(v.string()),
    // Las credenciales las gestiona Convex Auth (tabla authAccounts), no acá.
  }).index("by_email", ["email"]),

  // ── La persona afectada. La crea el agente; accede por invitación ─
  damnificados: defineTable({
    nombre: v.string(),
    email: v.string(),
    telefono: v.string(),
    // Credenciales gestionadas por Convex Auth (authAccounts), no acá.
    invitacionToken: v.optional(v.string()),
    // El ciclo de vida de un envío de invitación son TRES hechos distintos, y por
    // eso son tres campos (REC-71). No se pueden colapsar en menos:
    //
    //   invitacionIntentoEn  → se INTENTÓ. Se escribe ANTES de llamar a Resend, en
    //                          la misma mutation que lo chequea → es el claim atómico
    //                          del cooldown (sin él, dos envíos concurrentes pasarían
    //                          los dos el chequeo y llegarían dos emails).
    //   invitacionEnviadaEn  → Resend lo ACEPTÓ. Se escribe después de entregar.
    //   invitacionFalloEn    → Resend lo RECHAZÓ. Se escribe después de fallar.
    //
    // El estado se DERIVA comparando el intento contra sus dos posibles desenlaces
    // (ver `estadoInvitacion` en lib.ts):
    //   sin intento                        → NUNCA se le envió
    //   entregada >= intento               → ENTREGADA
    //   fallo     >= intento               → FALLIDA      ← evidencia persistida
    //   ninguno de los dos                 → EN_CURSO (o una action que murió)
    //
    // Por qué NO alcanzan dos campos: sin `invitacionFalloEn`, "en curso" y "falló"
    // son indistinguibles (los dos son "intento sin entrega"), y hay que tratarlos
    // AL REVÉS — un envío en curso debe bloquear otro (duplicado), y uno fallido
    // NO debe bloquear el reintento. Colapsarlos hacía que, tras un fallo, el sistema
    // rechazara el reintento diciendo "ya se le envió una invitación": exactamente la
    // clase de mentira que REC-71 vino a eliminar.
    invitacionIntentoEn: v.optional(v.number()),
    invitacionEnviadaEn: v.optional(v.number()),
    invitacionFalloEn: v.optional(v.number()),
    // QUIÉN produjo el último intento: el `solicitudId` del alta que lo reclamó, o
    // ausente si lo reclamó un reenvío manual desde la ficha.
    //
    // Sirve para una sola pregunta, en el reintento idempotente del alta: "el envío que
    // veo, ¿lo produjo ESTE alta?". La respuesta tiene que ser CAUSAL, no temporal —
    // comparar `invitacionIntentoEn` contra `caso._creationTime` no sirve: el claim usa
    // el `Date.now()` tomado al empezar la mutation y `_creationTime` lo asigna Convex al
    // insertar el caso, después, así que el claim del propio alta puede quedar ANTERIOR
    // al caso y la atribución fallaría justo hacia el lado que vuelve a mentir.
    invitacionSolicitudId: v.optional(v.string()),
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
    // Idempotencia del alta (REC-71). Lo genera el FRONT, uno por intento de alta,
    // y lo reenvía igual si reintenta. Existe porque `casos.crear` es una action (para
    // poder esperar la entrega del email) y las actions —a diferencia de las mutations—
    // no tienen retry ni deduplicación del lado del cliente: si la conexión se corta
    // DESPUÉS de que la transacción commiteó, el agente ve "no pudimos crear el caso"
    // sobre un caso que YA existe, y al reintentar crearía un duplicado.
    // Con esto, el reintento encuentra el caso por este id y devuelve ESE, sin crear
    // nada. Optional: los casos previos a REC-71 (y el seed) no lo tienen.
    solicitudId: v.optional(v.string()),
  })
    .index("by_agente", ["agenteId", "cerrado"])
    .index("by_damnificado", ["damnificadoId"])
    .index("by_numeroCaso", ["numeroCaso"])
    .index("by_solicitudId", ["solicitudId"]),

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
    // Vínculo opcional a un ítem del checklist (REC-77). Ausente ⇒ documento
    // "general" (subida libre, comportamiento histórico). Presente ⇒ satisface
    // ese ítem (→ "recibido", derivado). Un archivo satisface a lo sumo UN ítem.
    itemId: v.optional(v.id("itemsDocumentacion")),
  })
    .index("by_caso", ["casoId"])
    // Qué documentos satisfacen un ítem (estado "recibido" derivado) y para
    // bloquear el borrado de un ítem ya recibido (REC-77).
    .index("by_item", ["itemId"]),

  // ── Checklist tipado de documentación por caso (REC-77) ────────
  // El agente arma la lista; cada ítem está "pendiente" hasta que hay ≥1
  // `documentos` con este `itemId` ("recibido" es DERIVADO, no se guarda).
  // `etiqueta` sólo para el tipo OTROS (descripción libre).
  itemsDocumentacion: defineTable({
    casoId: v.id("casos"),
    tipoDocumento: tipoDocumentoValidator,
    etiqueta: v.optional(v.string()),
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
    // LEGACY (REC-29): "intento encolado", NO verdad de entrega. Hoy sólo lo usa
    // `reabrirAvisos`. La ENTREGA real vive en `entregasEmail` (REC-74).
    avisadoAlAgente: v.boolean(),
    // REC-74 · "último INTENTO de aviso" (ms). Driver de la cadencia de recordatorio
    // (cada 3 días) del cron. No dice si se entregó — eso lo saben los webhooks.
    ultimoAvisoEn: v.optional(v.number()),
  })
    .index("by_caso", ["casoId"])
    // Permite tomar el plazo más próximo de un caso por orden de índice,
    // sin ordenar en JS (REC-18 · lista del agente).
    .index("by_caso_fecha", ["casoId", "fechaVencimiento"])
    // Job de alertas (REC-29): plazos no avisados con vencimiento próximo, sin
    // escanear toda la tabla —> q.eq("avisadoAlAgente", false).lte("fechaVencimiento", limite).
    .index("by_avisado_fecha", ["avisadoAlAgente", "fechaVencimiento"])
    // REC-74 · el cron ahora recorre por vencimiento (todos los ≤ hoy+3), no por el
    // booleano legacy: así puede REAVISAR los que siguen venciendo (cadencia C2).
    .index("by_fecha", ["fechaVencimiento"]),

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

  // ── Chat agente ↔ damnificado (REC-34) · DUAL-ROL ──────────────
  // La ÚNICA tabla del módulo que ambos roles leen y escriben. No es una bitácora
  // interna como respuestasAseguradora/gestiones/notasInternas: acá el damnificado
  // es parte. Igual que ellas, NO cuelga de `casos.get`: módulo y query propios
  // (`mensajes.listPorCaso`) con guard de pertenencia DUAL.
  //
  // Las notas internas y este canal son TABLAS DISTINTAS → no hay forma de que una
  // nota aparezca acá (criterio de aceptación del issue).
  mensajes: defineTable({
    casoId: v.id("casos"),
    // Autor real. Se DERIVA de la sesión (`resolveRole`), nunca llega del cliente.
    // Union de ids porque puede ser de cualquiera de las dos tablas de identidad.
    // NO se proyecta al cliente: devolverlo le filtraría el `agenteId` al
    // damnificado, justo lo que la proyección estricta de `casos.miCaso` evita.
    autorId: v.union(v.id("agentes"), v.id("damnificados")),
    autorTipo,
    texto: v.string(),
    // `enviadoAt` del issue = `_creationTime` (convención del módulo).
    //
    // `leidoAt`: cuándo lo leyó su ÚNICO lector posible, la contraparte del autor
    // (mismo truco que `notificaciones.destinatario`: no hace falta guardar quién
    // leyó, lo determina el autor).
    //
    // AUSENTE = sin leer. NUNCA se escribe `null`: el índice `by_caso_autor_leido`
    // se consulta con `q.eq("leidoAt", undefined)`, que matchea el campo ausente
    // pero NO un `null` explícito → un `null` volvería el mensaje invisible para el
    // badge y para el gate del email, en silencio. El insert OMITE el campo; la
    // proyección normaliza a `null` sólo de salida.
    //
    // Gobierna el contador de no leídos y el acuse de "leído". NO gobierna la
    // notificación por email: de eso se ocupa `chatEstado` (ver abajo).
    leidoAt: v.optional(v.number()),
  })
    // (1) Línea de tiempo del caso, en orden de creación ascendente. Hace falta
    //     APARTE del compuesto: dentro de un `casoId`, el compuesto ordena por
    //     (autorTipo, leidoAt, …) e intercala los dos autores → no es una
    //     conversación. Por eso acá SÍ hay un `by_caso` suelto, a diferencia de
    //     `gestiones`/`respuestasAseguradora`, donde el prefijo del compuesto
    //     alcanzaba.
    .index("by_caso", ["casoId"])
    // (2) No leídos de un autor en un caso, sin scan en JS. Lo usan el contador del
    //     badge (ficha, lista de casos y Mi caso) y `marcarLeidos`.
    .index("by_caso_autor_leido", ["casoId", "autorTipo", "leidoAt"]),

  // ── Estado de aviso del chat, POR PARTICIPANTE (REC-34; alcance REC-70) ────────
  // Gate de la política "avisar una vez, hasta que lea" del email del chat, que
  // desde REC-70 va SÓLO al AGENTE (cuando el damnificado responde): el damnificado
  // ya no recibe email por mensajes, se entera por el badge de no leídos in-app. La
  // fila del participante DAMNIFICADO queda siempre en false (nadie le encola aviso).
  //
  // POR QUÉ NO ALCANZA `mensajes.leidoAt`: usar "¿tiene mensajes sin leer?" como
  // proxy de "¿ya fue avisado?" rompe si el email falla (sendEmail es best-effort y
  // no lanza): el gate asumiría que ya avisó y no reintentaría. Por eso es una fuente
  // de verdad separada; `avisoPendiente` se pone en true SÓLO cuando el email se
  // encola de verdad, y vuelve a false cuando el agente lee (`marcarLeidos`) o
  // escribe (`enviar` implica haber leído la conversación).
  //
  // Va en tabla propia y no como campos de `casos` porque `casos.get` hace spread
  // del caso: todo lo que se agregue ahí viaja a los dos roles.
  chatEstado: defineTable({
    casoId: v.id("casos"),
    participante,
    avisoPendiente: v.boolean(),
  })
    // La fila se crea de forma perezosa. SIEMPRE leer por este índice ANTES de
    // insertar, en la misma mutation: así el rango entra en el read-set y dos
    // envíos concurrentes conflictúan en el OCC de Convex (la perdedora reintenta y
    // ve la fila) en vez de crear dos filas para el mismo (casoId, participante),
    // que volvería el gate del email no determinístico.
    .index("by_caso_participante", ["casoId", "participante"]),

  // ── Notificaciones automáticas ─────────────────────────────────
  notificaciones: defineTable({
    destinatario,
    casoId: v.id("casos"),
    motivo: motivoNotificacion,
    visto: v.boolean(),
  }).index("by_caso_destinatario", ["casoId", "destinatario"]),

  // ── Rate-limit de envíos del código de reset, POR EMAIL (REC-69) ─
  // Frena el bombardeo de la casilla de un usuario real y protege la reputación
  // del dominio en Resend (los envíos repetidos a direcciones reales la queman).
  //
  // El enforcement vive en `passwordReset.sendVerificationRequest` —el ÚNICO
  // punto en el camino real del envío—, porque `auth:signIn` es una action
  // PÚBLICA: un guard de cliente o un wrapper serían bypasseables llamándola
  // directo. NO hay IP disponible en el flujo de Convex Auth (sólo el email llega
  // al hook), así que el límite es POR EMAIL: la protección significativa contra
  // el bombardeo de una casilla. El envío sólo ocurre para cuentas existentes.
  //
  // `envios` guarda los timestamps (ms) de los envíos dentro de la ventana de
  // 24h; `registrarEnvio` los poda en cada intento → ventana deslizante exacta
  // sin cron de reseteo, y la lista queda acotada por el límite.
  resetEnvios: defineTable({
    email: v.string(), // normalizado con normalizeEmail
    envios: v.array(v.number()),
  })
    // Leer SIEMPRE por este índice ANTES de escribir, en la misma mutation: el
    // rango entra en el read-set y dos solicitudes concurrentes conflictúan en el
    // OCC serializable (la perdedora reintenta y ve la fila), misma trampa que
    // `chatEstado`. `registrarEnvio` además consolida con `.collect()` como
    // defensa ante duplicados: si por lo que sea hubiera 2+ filas, `.unique()`
    // ROMPERÍA el limiter (lanza), mientras que consolidar la unión de timestamps
    // es correcto igual y se auto-cura.
    .index("by_email", ["email"]),

  // ── REC-74 · Entrega REAL de los emails (webhooks de Resend) ──────
  // La VERDAD de si un aviso llegó vive acá, no en flags "avisado" que sólo saben
  // que se INTENTÓ. Se correlaciona por el `id` que devuelve Resend al enviar
  // (`resendId`), y los eventos del webhook la completan. Upsert bidireccional: la
  // fila la crea el que llegue primero (envío o webhook), porque Resend entrega los
  // eventos at-least-once y sin orden garantizado; por eso el contexto del envío
  // (motivo/destinatario/casoId/to) es opcional (una fila creada por un evento
  // huérfano aún no lo tiene).
  entregasEmail: defineTable({
    resendId: v.string(),
    motivo: v.optional(v.string()),
    destinatario: v.optional(destinatario),
    casoId: v.optional(v.id("casos")),
    to: v.optional(v.string()),
    aceptadoEn: v.optional(v.number()), // Resend respondió 200 (encolado)
    // Desenlaces reales, con el timestamp de `payload.created_at` del evento.
    entregadoEn: v.optional(v.number()),
    rebotadoEn: v.optional(v.number()),
    quejadoEn: v.optional(v.number()),
    falladoEn: v.optional(v.number()),
    // ¿Ya se creó la alerta in-app al agente por no-entrega? (idempotencia)
    alertaCreada: v.optional(v.boolean()),
  }).index("by_resend_id", ["resendId"]),

  // ── REC-74 · Log de eventos de webhook de Resend (dedup + auditoría) ─
  // Resend puede entregar el MISMO evento más de una vez → se deduplica por `svixId`
  // (el header `svix-id`). Guarda cuándo OCURRIÓ (`createdAtEvento`, de
  // `payload.created_at`) y cuándo lo RECIBIÓ Convex (`recibidoEn`), porque el orden
  // no está garantizado.
  eventosResend: defineTable({
    svixId: v.string(),
    resendId: v.string(),
    tipo: v.string(), // "delivered" | "bounced" | "complained" | "failed"
    createdAtEvento: v.optional(v.number()),
    recibidoEn: v.number(),
  })
    .index("by_svix_id", ["svixId"])
    .index("by_resend_id", ["resendId"]),
});
