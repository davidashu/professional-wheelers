import { z } from "zod";
import { EQUIPMENT } from "./tms";

/** Optional trimmed text: "" becomes null. */
export const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : null));

export const reqText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

export const optState = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use a 2-letter state");

export const optZip = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{5}$/.test(v), "Use a 5-digit ZIP");

export const optDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Choose a date");

export const optUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, "Invalid selection");

export const money = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/[$,\s]/g, "")) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1_000_000, `${label} must be between 0 and 1,000,000`);

export const signedMoney = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/[$,\s]/g, "")) : 0))
    .refine((v) => Number.isFinite(v) && Math.abs(v) <= 1_000_000, `${label} is out of range`);

export const optMoney = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/[$,\s]/g, "")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 1_000_000), `${label} must be between 0 and 1,000,000`);

export const optInt = (label: string, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/[,\s]/g, "")) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= max), `${label} must be a whole number up to ${max}`);

const usState = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter state");

/** A lane posted for quoting (quote order), from staff or the customer portal. */
export const laneSchema = z.object({
  origin_city: z.string().trim().min(1, "Pickup city is required").max(80),
  origin_state: usState,
  origin_zip: optZip,
  dest_city: z.string().trim().min(1, "Delivery city is required").max(80),
  dest_state: usState,
  dest_zip: optZip,
  equipment: z.enum(EQUIPMENT),
  description: z.string().trim().min(1, "Describe what's moving").max(1000),
  pickup_date: optDate,
  notes: optText(2000),
});

export type ParsedVehicle = { vin: string | null; year: number | null; make: string | null; model: string | null };

/**
 * Vehicles typed one per line, e.g. "KNDC3DLC1R5215758 2024 Kia EV6" or "2021 Ford F-150".
 * A 17-character token is the VIN; a 4-digit token is the year; the next word is
 * the make and the rest is the model.
 */
export function parseVehicles(text: string): { vehicles: ParsedVehicle[]; errors: string[] } {
  const vehicles: ParsedVehicle[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20)
    .forEach((line, i) => {
      const tokens = line.split(/[\s,]+/).filter(Boolean);
      let vin: string | null = null;
      let year: number | null = null;
      const rest: string[] = [];
      for (const t of tokens) {
        const up = t.toUpperCase();
        if (!vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(up)) vin = up;
        else if (!year && /^(19|20)\d{2}$/.test(t)) year = Number(t);
        else rest.push(t);
      }
      if (/\b[A-Z0-9]{17}\b/i.test(line) && !vin) errors.push(`Line ${i + 1}: the VIN has an invalid character (I, O or Q).`);
      const make = rest[0]?.slice(0, 40) ?? null;
      const model = rest.slice(1).join(" ").slice(0, 60) || null;
      if (!vin && !make) errors.push(`Line ${i + 1}: enter a VIN or a make and model.`);
      vehicles.push({ vin, year, make, model });
    });
  return { vehicles, errors };
}
