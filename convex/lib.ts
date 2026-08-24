/**
 * Helpers puros compartidos por las funciones Convex.
 * (No pueden importar de `src/`: el bundle de Convex está aislado.)
 */

/**
 * Normaliza un email para lookups y unicidad global entre agentes/damnificados.
 * Se aplica en TODO punto que toque email (seed, resolveRole, escrituras).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A qué dirección se le manda un email AL AGENTE (REC-73).
 *
 * Es el ÚNICO lugar que decide el destino de un aviso al agente. Los tres
 * productores (`plazos`, `pedidos`, `mensajes`) pasan por acá; un cuarto que se
 * olvide vuelve, en silencio, a la dirección de identidad — que en producción es
 * `agente@amparo.ar`, inexistente y suprimida en Resend. "En silencio" es
 * exactamente la enfermedad que este helper cura, así que no lo inlinees.
 *
 * OJO con el `??`, que es la trampa obvia: `"" ?? email` devuelve `""`, no
 * `email` — el `??` sólo atrapa null/undefined. Una fila con la cadena vacía
 * mandaría los avisos a una dirección inválida: el mismo agujero, otro disfraz.
 * Por eso el chequeo es de TRUTHINESS, no de nulidad. (`configurarEmailNotificaciones`
 * ya rechaza la cadena vacía; esto es la segunda línea de defensa.)
 *
 * `email` (identidad) NO se toca acá: `resolveRole`, el guard de unicidad del
 * alta y `contarPorEmail` siguen usándolo. Eso es identidad, no entrega.
 */
export function emailDeAvisos(agente: {
  email: string;
  emailNotificaciones?: string;
}): string {
  const propio = agente.emailNotificaciones?.trim();
  return propio ? propio : agente.email;
}

// ── Fechas de calendario (ISO YYYY-MM-DD) ────────────────────────
// Viven acá, y no en el módulo que las estrenó (respuestasAseguradora, REC-31),
// porque las usan los guards de "fecha no futura" de VARIAS tablas y tienen que
// validar IDÉNTICO. Con una copia por módulo, la corrección del fallback de
// abajo se aplicaría en una y se olvidaría en la otra → dos fronteras de
// validación que deberían ser la misma, comportándose distinto.

export const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const TZ_AR = "America/Argentina/Buenos_Aires";

/**
 * "Hoy" del dominio (YYYY-MM-DD) en hora ARGENTINA, calculado en el SERVER.
 *
 * Por qué no el hoy UTC: Convex corre en UTC y el agente está en AR (UTC-3), así
 * que entre las 21:00 y la medianoche argentinas el UTC ya pasó de día → un hoy
 * UTC dejaría entrar el "mañana" del agente (fail-open). Y el `max` de un
 * `<input type="date">` es UX, no frontera: las mutations son API pública.
 *
 * Ruta principal: `Intl` con la zona IANA. Por spec, si el runtime no tiene datos
 * de zonas horarias, una `timeZone` no soportada TIRA `RangeError` (no cae en
 * silencio a UTC) → lo capturamos. `en-CA` produce YYYY-MM-DD; el regex blinda
 * contra un build sin datos de locale.
 *
 * Fallback: Argentina es UTC-3 FIJO (no observa horario de verano desde 2009), así
 * que restar 3 horas da la fecha local exacta. DEUDA: si algún día AR vuelve a
 * aplicar DST, esta rama queda corrida una hora y hay que BORRARLA — para entonces
 * el runtime de Convex debería soportar `Intl`, que es la ruta correcta igual.
 */
export function hoyEnArgentina(): string {
  try {
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_AR,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (RE_FECHA.test(iso)) return iso;
  } catch {
    // Runtime sin datos de zonas horarias → cae al fallback determinístico.
  }
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Descarta fechas con formato válido pero inexistentes (ej. 2026-02-31). */
export function esFechaReal(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// ── Envío de invitación: estado y cooldown (REC-71) ──────────────
/** Ventana mínima entre dos envíos de invitación al MISMO damnificado. */
export const COOLDOWN_INVITACION_MS = 60_000;

/** Los tres timestamps del ciclo de vida de un envío (ver schema.ts). */
export type MarcasInvitacion = {
  invitacionIntentoEn?: number;
  invitacionEnviadaEn?: number;
  invitacionFalloEn?: number;
};

export type EstadoEnvioInvitacion =
  | "NUNCA" // no se intentó nunca
  | "ENTREGADA" // el último intento fue aceptado por Resend
  | "FALLIDA" // el último intento fue rechazado por Resend
  | "EN_CURSO"; // se intentó y todavía no se sabe (o la action murió)

/**
 * Deriva en qué estado quedó el ÚLTIMO intento de envío, comparándolo con sus dos
 * posibles desenlaces. Es la única fuente de esa lectura: la usan el cooldown, los
 * dos productores y la ficha, así que no puede haber dos interpretaciones distintas
 * de los mismos tres campos.
 */
export function estadoInvitacion(
  m: MarcasInvitacion,
  ahora: number = Date.now(),
): { estado: EstadoEnvioInvitacion; enCooldown: boolean } {
  const intento = m.invitacionIntentoEn;
  if (intento === undefined) return { estado: "NUNCA", enCooldown: false };

  const entregada = (m.invitacionEnviadaEn ?? 0) >= intento;
  const fallida = (m.invitacionFalloEn ?? 0) >= intento;

  const estado: EstadoEnvioInvitacion = entregada
    ? "ENTREGADA"
    : fallida
      ? "FALLIDA"
      : "EN_CURSO";

  // Un intento FALLIDO no consume cooldown: si Resend rechazó el email, el agente
  // tiene que poder reintentar YA — es lo que el propio mensaje de error le dice que
  // haga. Bloquearlo 60 s y encima contestarle "ya se le envió una invitación" sería
  // mentirle sobre un correo que nunca salió.
  //
  // Un intento EN CURSO sí bloquea: es lo que evita que dos llamadas concurrentes
  // (dos pestañas, dos POST al endpoint) manden dos emails. Si la action murió sin
  // resolver, el bloqueo se cura solo al vencer la ventana.
  //
  // Y una ENTREGA reciente también bloquea: no le llenamos la casilla al damnificado.
  const enCooldown =
    estado !== "FALLIDA" && ahora - intento < COOLDOWN_INVITACION_MS;

  return { estado, enCooldown };
}

/**
 * ¿Hay que bloquear un nuevo envío de invitación a este damnificado?
 *
 * Vive acá, y no en el módulo que lo estrenó, porque el claim del cooldown tiene
 * DOS productores —`casos.crearRegistro` (alta) e `invitaciones.prepararInvitacion`
 * (reenvío desde la ficha)— y ambos tienen que aplicar EXACTAMENTE la misma regla.
 * Con una copia por módulo, el rate-limit se puentea por el camino más trivial:
 * crearle un segundo caso a un damnificado sin activar recién invitado.
 *
 * Lo que difiere entre los dos productores es la REACCIÓN, no la regla: la ficha
 * lanza ConvexError (apretaste un botón que dice "enviar"), el alta lo reporta como
 * un estado más del resultado (pediste crear un caso; el email es un accesorio).
 *
 * El chequeo y la escritura del claim van en la MISMA mutation: es lo que lo hace
 * atómico contra dos llamadas concurrentes (una gana, la otra reintenta por OCC,
 * ve el timestamp nuevo y corta).
 */
export function enCooldownInvitacion(
  m: MarcasInvitacion,
  ahora: number,
): boolean {
  return estadoInvitacion(m, ahora).enCooldown;
}

// ── Clientes: edición de datos y agrupación por damnificado (REC-90) ──
// Todo lo de esta sección es PURO a propósito. `convex/clientes.ts` importa
// `_generated/server`, así que no se puede ejercitar desde `scripts/` con
// `node --test` (el resolver ESM de Node no acepta los specifiers sin extensión
// del bundler de Convex). La lógica que puede fallar EN SILENCIO —qué cuenta
// como conflicto de email, si un cliente con casos sólo cerrados sigue siendo
// cliente— vive acá para que tenga tests de verdad.

/**
 * Formato de email. Es la MISMA frontera que valida el alta (`casos.ts`), que
 * ahora la importa de acá en vez de repetir el literal.
 *
 * Mismo motivo que `RE_FECHA` unas líneas más arriba: dos fronteras que validan
 * el mismo campo tienen que validar IDÉNTICO, porque si no la corrección se
 * aplica en una y se olvida en la otra. (La copia del front, en el formulario de
 * alta, se queda donde está: `src/` no puede importar del bundle de Convex.)
 */
export const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esEmailValido(email: string): boolean {
  return RE_EMAIL.test(email);
}

/**
 * Qué hacer con el email en una edición de damnificado.
 *
 * `cuentaActivada` es la línea exacta en la que el email deja de ser un dato de
 * contacto y pasa a ser un IDENTIFICADOR DE LOGIN: del otro lado habría que
 * migrar en sincronía `authAccounts.providerAccountId` + `users.email` +
 * `damnificados.email`, y `resolveRole` es fail-closed, así que una
 * desincronización deja al damnificado logueándose bien y viendo la app entera
 * cerrada. Convex Auth no expone ninguna API para renombrar una cuenta.
 *
 * ⚠️ El caso que parece un detalle y no lo es: con la cuenta activada y un email
 * IGUAL al actual esto devuelve `SIN_CAMBIO`, no `BLOQUEADO`. Sólo un email
 * DISTINTO bloquea. Si no, una pestaña abierta desde antes de la activación —que
 * manda el email tal cual lo leyó— rompería el guardado de nombre y teléfono, que
 * sí están permitidos siempre.
 *
 * `emailNuevo === undefined` significa "no lo toqué", que es lo que manda el
 * front cuando el campo viene deshabilitado.
 * Los dos emails llegan YA normalizados (`normalizeEmail`).
 */
export function resolucionEmail(args: {
  cuentaActivada: boolean;
  emailActual: string;
  emailNuevo?: string;
}): "SIN_CAMBIO" | "CAMBIA" | "BLOQUEADO_CUENTA_ACTIVADA" {
  const { cuentaActivada, emailActual, emailNuevo } = args;
  if (emailNuevo === undefined || emailNuevo === emailActual) {
    return "SIN_CAMBIO";
  }
  return cuentaActivada ? "BLOQUEADO_CUENTA_ACTIVADA" : "CAMBIA";
}

/**
 * ¿El email destino ya es de otro? Réplica del guard de unicidad global del alta
 * (`casos.crearRegistro`), con UNA diferencia esencial: acá hay un "yo".
 *
 * El alta pregunta "¿existe alguna fila con este email?" y una fila significa
 * REUSAR ese damnificado. En una edición, una fila que SOY YO es un guardado
 * idempotente perfectamente válido, y una fila AJENA es un conflicto. Por eso la
 * decisión no puede ser `length > 1` copiado del alta: sobre el propio email eso
 * daría verde por el motivo equivocado, y sobre un email ajeno preexistente
 * dejaría pasar el pisotón.
 *
 * La unicidad es GLOBAL entre `agentes` y `damnificados` porque es el invariante
 * que sostiene `resolveRole` (que hace fail-closed si un email matchea en las dos
 * tablas, o dos veces en la misma).
 */
export function conflictoDeEmail(args: {
  agentesConEseEmail: number;
  damnificadosConEseEmail: readonly string[];
  propioId: string;
}): null | "AGENTE" | "OTRO_DAMNIFICADO" {
  if (args.agentesConEseEmail > 0) return "AGENTE";
  const ajenos = args.damnificadosConEseEmail.filter(
    (id) => id !== args.propioId,
  );
  return ajenos.length > 0 ? "OTRO_DAMNIFICADO" : null;
}

/** Lo que la lista de clientes resume de los casos de una persona. */
export type ResumenCliente = {
  abiertos: number;
  cerrados: number;
  ultimoCasoEn: number;
};

/**
 * Agrupa los casos DE UN AGENTE por damnificado, para la lista de clientes.
 *
 * ⚠️ Cuenta abiertos y cerrados, y devuelve una entrada por cada damnificado que
 * aparezca — INCLUIDO el que sólo tiene casos cerrados. Suena obvio y es la
 * regresión más probable de toda la sección: el índice `casos.by_agente` es
 * `["agenteId","cerrado"]`, así que copiar el `.eq("cerrado", false)` de
 * `casos.listMine` haría desaparecer clientes de la agenda al cerrarles el último
 * caso, sin ningún error. El llamador tiene que consultar el índice SÓLO con el
 * prefijo `agenteId` (como `notificaciones.casosDelAgente`).
 *
 * Tipado estructural en vez de `Doc<"casos">` (mismo truco que `emailDeAvisos`):
 * así este módulo sigue sin importar nada y se puede testear desde `scripts/`.
 */
export function agruparClientes(
  casos: readonly {
    damnificadoId: string;
    cerrado: boolean;
    _creationTime: number;
  }[],
): Map<string, ResumenCliente> {
  const porCliente = new Map<string, ResumenCliente>();
  for (const caso of casos) {
    const previo = porCliente.get(caso.damnificadoId);
    const resumen: ResumenCliente = previo ?? {
      abiertos: 0,
      cerrados: 0,
      ultimoCasoEn: caso._creationTime,
    };
    if (caso.cerrado) resumen.cerrados += 1;
    else resumen.abiertos += 1;
    if (caso._creationTime > resumen.ultimoCasoEn) {
      resumen.ultimoCasoEn = caso._creationTime;
    }
    porCliente.set(caso.damnificadoId, resumen);
  }
  return porCliente;
}

// ── Usuarios y roles (REC-91) ────────────────────────────────────
// Los dos campos que estos helpers leen (`rol`, `activo`) son OPCIONALES en el
// schema y lo van a seguir siendo: Convex valida el schema contra los datos
// existentes al hacer push, así que un campo requerido en `agentes` —que ya
// tiene filas en prod y en staging— falla el push. El default no se rellena por
// migración: se DERIVA acá, y por eso estas tres funciones son la única forma
// legítima de leer esos campos. Leerlos a mano es cómo se pierde el default.
//
// Tipado estructural en vez de `Doc<"agentes">` (mismo truco que `emailDeAvisos`):
// así este módulo sigue sin importar nada y se puede testear desde `scripts/`.

export type RolAgente = "admin" | "agente";

/**
 * El rol de un agente. **Ausente ⇒ `"agente"`**: el rol nació con REC-91 y
 * ninguna de las filas que ya existían lo tiene, así que el default tiene que
 * ser el rol sin privilegios. Al revés —ausente ⇒ admin— la administración del
 * estudio quedaría abierta para todos el día que se publique el campo, sin un
 * solo error que lo delate.
 */
export function rolDeAgente(agente: { rol?: RolAgente }): RolAgente {
  return agente.rol ?? "agente";
}

/**
 * Si el agente administra usuarios. Es la ÚNICA diferencia entre los dos roles:
 * un admin no ve más casos ni escribe más cosas que cualquier otro agente.
 */
export function esAdmin(agente: { rol?: RolAgente }): boolean {
  return rolDeAgente(agente) === "admin";
}

/**
 * Si el agente puede usar la app. **Ausente ⇒ `true` (fail-OPEN)**.
 *
 * ⚠️ Es la única excepción a la cultura fail-closed del repo, y es deliberada:
 * el push que agrega `activo` no puede rellenar las filas que ya existen, así
 * que un default `false` le cerraría la app —en el mismo instante del deploy y
 * sin aviso— al único agente de producción. El fail-closed de verdad vive un
 * escalón más arriba: `resolveRole` sigue devolviendo `null` ante CUALQUIER
 * identidad que no resuelva a exactamente una persona.
 *
 * Por eso la comparación es `!== false` y no `!!agente.activo`: sólo el `false`
 * EXPLÍCITO —el que escribe una desactivación real— cierra la puerta. Si alguien
 * lo "corrige" a fail-closed de buena fe, `scripts/roles.test.mjs` es lo único
 * que lo dice antes de que el deploy lo demuestre.
 */
export function esAgenteActivo(agente: { activo?: boolean }): boolean {
  return agente.activo !== false;
}

// ── Correlativo de `numeroCaso` (REC-99) ─────────────────────────────
/** Un correlativo emitido por el sistema son 5 dígitos, siempre. */
export const RE_CORRELATIVO = /^\d{5}$/;

/**
 * REC-99 · De una tanda de `numeroCaso` del MISMO año **ordenada descendente**,
 * devuelve el mayor correlativo VÁLIDO, o `null` si ninguno lo es.
 *
 * Vive acá, separado de `generarNumeroCaso`, porque es la única parte de la
 * numeración que puede fallar en silencio y `convex/lib.ts` es el módulo sin
 * imports que `node --test` puede cargar (mismo motivo que `esAgenteActivo`).
 *
 * **Por qué alcanza con el PRIMERO que matchee:** la lista viene de mayor a menor,
 * así que el primer elemento bien formado es, por definición, el mayor bien
 * formado. Dónde caigan los malformados es indistinto.
 *
 * **Qué malformados existen de verdad.** La query que alimenta esto acota el rango
 * a `< SIN-AAAA-999999`, así que un sufijo que arranca con letra (`SIN-2026-zzz`)
 * ni siquiera llega hasta acá: queda fuera del rango. Los que sí entran son los
 * que arrancan con dígito y traen basura después (`SIN-2026-00012abc`,
 * `SIN-2026-0001A`) y el sufijo vacío (`SIN-2026-`) — los tres daban `NaN` o `0`
 * en la versión anterior. El helper igual no asume nada del rango: filtra por
 * formato exacto.
 *
 * **Por qué devuelve `null` y no `0`:** un `0` se convertiría en `00001`, que es
 * un número YA EMITIDO, y Convex no tiene índices únicos que frenen el duplicado.
 * Distinguir "no hay ninguno válido" de "el máximo es 0" es lo que le permite al
 * llamador fallar cerrado en vez de adivinar. `scripts/numero-caso.test.mjs` es
 * lo único que lo dice antes de que lo demuestre un identificador duplicado.
 */
export function maximoCorrelativo(
  numerosCasoDesc: string[],
  prefijo: string,
): number | null {
  for (const numeroCaso of numerosCasoDesc) {
    const sufijo = numeroCaso.slice(prefijo.length);
    if (RE_CORRELATIVO.test(sufijo)) return Number(sufijo);
  }
  return null;
}

// ── Ventana deslizante de rate-limit (REC-151) ───────────────────────
// La mecánica que `passwordReset.registrarEnvio` venía haciendo inline, extraída
// acá cuando apareció el SEGUNDO limiter (el del formulario público). Vive en este
// módulo por el mismo motivo que `maximoCorrelativo` y `esAgenteActivo`: es la
// parte que puede fallar EN SILENCIO —un limiter roto no tira ninguna excepción,
// simplemente deja pasar todo— y `convex/lib.ts` no importa nada, que es lo único
// que permite ejercitarlo desde `scripts/` con `node --test`.
//
// Un limiter "que anda" y un limiter que no frena nada se ven exactamente igual
// desde afuera hasta el día que alguien te inunda la casilla.

/** Un techo: `max` eventos dentro de los últimos `ventanaMs`. */
export type UmbralEnvios = { max: number; ventanaMs: number };

/**
 * Descarta los timestamps que ya salieron de la ventana más larga y devuelve el
 * resto ORDENADO ASCENDENTE.
 *
 * Es lo que hace que la ventana sea deslizante de verdad y sin cron de reseteo: la
 * poda corre en cada intento, así que la lista queda acotada por el propio límite
 * en vez de crecer para siempre.
 *
 * ⚠️ `>` y no `>=`: un timestamp exactamente en el borde de la ventana ya cumplió
 * su condena. Con `>=` un evento seguiría contando un instante de más — invisible
 * en producción y visible en el test de borde, que es justamente para eso.
 */
export function podarEnvios(
  envios: readonly number[],
  ahora: number,
  ventanaMaxMs: number,
): number[] {
  const desde = ahora - ventanaMaxMs;
  return envios.filter((t) => t > desde).sort((a, b) => a - b);
}

/**
 * ¿Alguno de los umbrales YA está alcanzado? Se evalúa ANTES de registrar el
 * intento en curso, así que la comparación es `>=` y no `>`: con `max` eventos ya
 * hechos, el que viene sería el `max + 1`.
 *
 * Es el mismo `>=` que usa `passwordReset.registrarEnvio`, y la razón de que sea
 * fácil equivocarse: `>` deja pasar uno de más por cada ventana, para siempre, sin
 * ningún síntoma.
 *
 * `envios` tiene que venir de `podarEnvios` (la ventana más larga de `umbrales`):
 * las ventanas más cortas se filtran acá, la más larga se asume ya aplicada.
 */
export function superaUmbral(
  enviosPodados: readonly number[],
  ahora: number,
  umbrales: readonly UmbralEnvios[],
): boolean {
  return umbrales.some(
    ({ max, ventanaMs }) =>
      enviosPodados.filter((t) => t > ahora - ventanaMs).length >= max,
  );
}
