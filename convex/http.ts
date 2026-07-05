import { httpRouter } from "convex/server";
import { auth } from "./auth";

/** Rutas HTTP de Convex Auth (callbacks de login, etc.). */
const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
