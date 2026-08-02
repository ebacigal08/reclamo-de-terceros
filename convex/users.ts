import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { normalizeEmail, esAdmin, esAgenteActivo } from "./lib";

/**
 * Identidad y rol (REC-17 · core · REC-91).
 *
 * El rol NO lo guarda Convex Auth: se DERIVA por email contra las tablas de
 * dominio `agentes` / `damnificados`. `resolveRole` es la única fuente de
 * verdad de "quién es el que llama", y es **fail-closed**: ante falta de
 * sesión, email sin vínculo, vínculo ambiguo (email en ambas tablas), agente
 * desactivado o damnificado sin activar, devuelve `null`. Los conflictos se
 * loguean **sólo en server y sin PII** (userId, nunca el email completo ni
 * datos en el cliente).
 *
 * Invariante asumido: email único global entre agentes y damnificados
 * (lo garantizan las escrituras; ver seed.ts).
 */

/**
 * Quién es el que llama, cuando la respuesta es "alguien con acceso".
 *
 * ⚠️ Tiene DOS miembros y tiene que seguir teniendo dos. Unos 50 call-sites
 * hacen `if (!resolved || resolved.rol !== "agente")`, y el guard dual
 * (`autorizacion.ts`, `casos.ts`) usa un ternario cuyo *else* asume damnificado:
 * un tercer miembro rompería ese narrowing en todo el repo a la vez. Los estados
 * que NO son acceso viven en `EstadoSesion`, que es un tipo aparte a propósito.
 */
export type Sesion =
  | {
      rol: "agente";
      userId: Id<"users">;
      agente: Doc<"agentes">;
      esAdmin: boolean;
    }
  | {
      rol: "damnificado";
      userId: Id<"users">;
      damnificado: Doc<"damnificados">;
    };

/**
 * El resultado COMPLETO de resolver la identidad, incluidos los cinco motivos
 * por los que puede no haber acceso.
 *
 * Existe para una sola cosa: que `users.me` pueda distinguir "agente
 * desactivado" (→ `/sin-acceso`) de "no hay sesión" (→ `/login`). Todo el resto
 * del sistema usa `resolveRole`, que colapsa los cinco motivos en `null` — que
 * es lo correcto para un guard: por qué no entrás no es asunto de la función que
 * te está negando el paso.
 */
export type EstadoSesion =
  | { estado: "OK"; sesion: Sesion }
  | { estado: "SIN_SESION" }
  | { estado: "SIN_EMAIL" }
  | { estado: "AMBIGUO"; agentes: number; damnificados: number }
  | { estado: "AGENTE_DESACTIVADO"; nombre: string }
  | { estado: "DAMNIFICADO_SIN_ACTIVAR" };

/**
 * Resuelve la identidad con el motivo. **La usa SÓLO `users.me`.**
 *
 * No agrega ni una lectura respecto de la versión anterior: `rol` y `activo`
 * viven en el mismo documento `agentes` que el `.take(2)` de abajo ya trae.
 * Importa, porque esto corre en CADA query del sistema.
 */
export async function estadoSesion(ctx: QueryCtx): Promise<EstadoSesion> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return { estado: "SIN_SESION" };

  const user = await ctx.db.get(userId);
  const rawEmail = user?.email;
  if (!rawEmail) {
    console.warn(`[auth] userId ${userId} sin email; no se puede derivar rol`);
    return { estado: "SIN_EMAIL" };
  }
  const email = normalizeEmail(rawEmail);

  // take(2) por tabla: detecta también duplicados DENTRO de una misma tabla.
  // El invariante exige exactamente UNA coincidencia en total (agentes+damnificados).
  const [agentes, damnificados] = await Promise.all([
    ctx.db
      .query("agentes")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(2),
    ctx.db
      .query("damnificados")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(2),
  ]);

  const total = agentes.length + damnificados.length;
  if (total !== 1) {
    // 0 = sin vínculo; >1 = duplicado intra-tabla o email en ambas tablas.
    console.error(
      `[auth] email con ${total} coincidencias (agentes=${agentes.length}, damnificados=${damnificados.length}) para userId ${userId}; fail-closed`,
    );
    return {
      estado: "AMBIGUO",
      agentes: agentes.length,
      damnificados: damnificados.length,
    };
  }

  if (agentes.length === 1) {
    const agente = agentes[0];
    // REC-91 · Un agente desactivado conserva su cuenta Auth y su contraseña: la
    // baja NO toca las credenciales (para poder reactivarlo sin re-invitarlo), y
    // tampoco invalida el JWT que ya tenga en el navegador. Este guard es el que
    // hace que esa cookie viva no sirva para nada: sin sesión resuelta no se lee
    // ni se escribe un solo documento.
    //
    // Por eso NO se usa `invalidateSessions` de Convex Auth: exige un `ActionCtx`
    // y resolver `users._id` desde el email (un vínculo `agentes → users` que hoy
    // no existe), a cambio de invalidar un token que ya no autoriza nada.
    if (!esAgenteActivo(agente)) {
      console.warn(`[auth] agente ${agente._id} desactivado; sin acceso`);
      return { estado: "AGENTE_DESACTIVADO", nombre: agente.nombre };
    }
    return {
      estado: "OK",
      sesion: {
        rol: "agente",
        userId,
        agente,
        esAdmin: esAdmin(agente),
      },
    };
  }

  const damnificado = damnificados[0];
  // Fail-closed: una cuenta Auth cuyo damnificado todavía no activó su cuenta
  // NO resuelve como sesión usable. Cubre estados parciales de activación
  // (cuenta Auth creada pero `marcarActivado` no aplicado; ver
  // invitaciones.activar). Recién con cuentaActivada=true accede al flujo privado.
  if (!damnificado.cuentaActivada) {
    console.warn(
      `[auth] damnificado ${damnificado._id} con cuenta Auth pero cuentaActivada=false; fail-closed`,
    );
    return { estado: "DAMNIFICADO_SIN_ACTIVAR" };
  }
  return {
    estado: "OK",
    sesion: { rol: "damnificado", userId, damnificado },
  };
}

/**
 * Quién es el que llama, o `null`. **El guard de todo el sistema.**
 *
 * Su contrato es idéntico al que tenía antes de REC-91 —un `Sesion` de dos
 * miembros, o `null`— y esa estabilidad es el punto: los ~50 call-sites que
 * hacen `if (!resolved || resolved.rol !== "agente")` no se tocaron, y el agente
 * desactivado entra por el mismo `null` que ya sabían manejar.
 */
export async function resolveRole(ctx: QueryCtx): Promise<Sesion | null> {
  const estado = await estadoSesion(ctx);
  return estado.estado === "OK" ? estado.sesion : null;
}

/**
 * Datos de la sesión para la UI (shell y resolver de rol).
 *
 * Es el ÚNICO consumidor de `estadoSesion`, porque es el único lugar del sistema
 * donde el motivo del rechazo cambia a dónde va la persona:
 *
 *   AGENTE_DESACTIVADO                        → `sin_acceso` → /sin-acceso
 *   sin sesión · sin email · ambiguo ·        → `null`       → /login
 *   damnificado sin activar
 *
 * ⚠️ Los cuatro últimos devuelven `null` EXACTAMENTE como antes de REC-91. Que
 * el damnificado sin activar siga cayendo en `/login` y no en `/sin-acceso` no
 * es un descuido: su cuenta no está desactivada, está a medio activar, y el
 * camino que lo arregla es volver a entrar.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const estado = await estadoSesion(ctx);

    if (estado.estado === "AGENTE_DESACTIVADO") {
      // Sin `nombre`: /sin-acceso es una pantalla estática que no consulta nada
      // (ver el comentario de esa página), así que no habría quién lo muestre.
      return { rol: "sin_acceso" as const, motivo: "AGENTE_DESACTIVADO" as const };
    }
    if (estado.estado !== "OK") return null;
    const resolved = estado.sesion;

    if (resolved.rol === "agente") {
      const casos = await ctx.db
        .query("casos")
        .withIndex("by_agente", (q) =>
          q.eq("agenteId", resolved.agente._id).eq("cerrado", false),
        )
        .collect();
      return {
        rol: "agente" as const,
        nombre: resolved.agente.nombre,
        agenteId: resolved.agente._id,
        casosActivos: casos.length,
        // REC-91 · Todavía no habilita nada: la sección Usuarios llega en REC-94.
        // Va desde ahora porque es aditivo y porque el shell del agente es quien
        // lo va a leer, así que el día que exista la pantalla no hay que volver a
        // tocar el contrato de `me`.
        esAdmin: resolved.esAdmin,
      };
    }

    return {
      rol: "damnificado" as const,
      nombre: resolved.damnificado.nombre,
      damnificadoId: resolved.damnificado._id,
      onboardingCompletado: resolved.damnificado.onboardingCompletado,
    };
  },
});

/**
 * Marca el onboarding del damnificado como visto (REC-26). Sin args: la
 * identidad se DERIVA de la sesión con `resolveRole` (regla del módulo; nunca
 * se acepta id del cliente). Fail-closed (guard → Error) e idempotente: no
 * re-escribe si ya estaba en `true`. La dispara la pantalla de onboarding al
 * finalizar o saltar; el resolver `/` deja de mostrar el wizard cuando queda
 * en `true`.
 */
export const completarOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const resolved = await resolveRole(ctx);
    if (!resolved || resolved.rol !== "damnificado") {
      throw new Error("No autorizado: se requiere una sesión de damnificado.");
    }
    if (!resolved.damnificado.onboardingCompletado) {
      await ctx.db.patch(resolved.damnificado._id, { onboardingCompletado: true });
    }
    return null;
  },
});
