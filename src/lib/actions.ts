import type { FieldErrors } from "./validation";

export type ActionResult = { ok: boolean; message?: string; errors?: FieldErrors; data?: Record<string, string> } | null;

export const ok = (message?: string, data?: Record<string, string>): ActionResult => ({ ok: true, message, data });
export const fail = (message: string, errors?: FieldErrors): ActionResult => ({ ok: false, message, errors });

/** Turn a Postgres/PostgREST error into a message staff can act on. */
export function dbMessage(error: { message: string; code?: string } | null, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  // Messages raised by our own functions/triggers are written for staff.
  if (error.code === "P0001" || error.code === "22023" || error.code === "P0002" || error.code === "42501") {
    return error.message;
  }
  if (error.code === "23514") return "One of the values isn't valid. Check the form and try again.";
  if (error.code === "23505") return "That record already exists.";
  console.error("Database error", error);
  return fallback;
}
