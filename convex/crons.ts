import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Tareas programadas — Amparo CRM.
 *
 * Alertas de plazos (REC-29): una vez por día detecta los plazos por vencer que
 * todavía no se avisaron y notifica al agente. 12:00 UTC ≈ 09:00 AR (mañana).
 */
const crons = cronJobs();

crons.daily(
  "alertas-de-plazos",
  { hourUTC: 12, minuteUTC: 0 },
  internal.plazos.revisarVencimientos,
  {},
);

export default crons;
