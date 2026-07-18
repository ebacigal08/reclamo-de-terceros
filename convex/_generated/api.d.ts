/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentes from "../agentes.js";
import type * as auth from "../auth.js";
import type * as autorizacion from "../autorizacion.js";
import type * as casos from "../casos.js";
import type * as crons from "../crons.js";
import type * as documentos from "../documentos.js";
import type * as email from "../email.js";
import type * as gestiones from "../gestiones.js";
import type * as http from "../http.js";
import type * as invitaciones from "../invitaciones.js";
import type * as itemsDocumentacion from "../itemsDocumentacion.js";
import type * as lib from "../lib.js";
import type * as mensajes from "../mensajes.js";
import type * as notasInternas from "../notasInternas.js";
import type * as notificaciones from "../notificaciones.js";
import type * as passwordReset from "../passwordReset.js";
import type * as pedidos from "../pedidos.js";
import type * as plazos from "../plazos.js";
import type * as relato from "../relato.js";
import type * as respuestasAseguradora from "../respuestasAseguradora.js";
import type * as seed from "../seed.js";
import type * as tiposDocumento from "../tiposDocumento.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentes: typeof agentes;
  auth: typeof auth;
  autorizacion: typeof autorizacion;
  casos: typeof casos;
  crons: typeof crons;
  documentos: typeof documentos;
  email: typeof email;
  gestiones: typeof gestiones;
  http: typeof http;
  invitaciones: typeof invitaciones;
  itemsDocumentacion: typeof itemsDocumentacion;
  lib: typeof lib;
  mensajes: typeof mensajes;
  notasInternas: typeof notasInternas;
  notificaciones: typeof notificaciones;
  passwordReset: typeof passwordReset;
  pedidos: typeof pedidos;
  plazos: typeof plazos;
  relato: typeof relato;
  respuestasAseguradora: typeof respuestasAseguradora;
  seed: typeof seed;
  tiposDocumento: typeof tiposDocumento;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
