import { z } from "zod";
import { STATE_CODES } from "./us-states";

const trimmed = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer`);
const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

const phone = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .refine((v) => {
    const digits = v.replace(/\D/g, "");
    return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
  }, "Enter a 10-digit US phone number");

const email = z.string().trim().toLowerCase().min(1, "Email is required").pipe(z.email("Enter a valid email address")).pipe(z.string().max(254));
const state = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => STATE_CODES.has(v), "Choose a state");
const zip = z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code");

const currentYear = new Date().getFullYear();

export const vehicleSchema = z.object({
  year: z.coerce
    .number({ error: "Year is required" })
    .int("Enter a valid year")
    .min(1900, "Enter a valid year")
    .max(currentYear + 2, "Enter a valid year"),
  make: required("Make", 40),
  model: required("Model", 60),
  operable: z.enum(["yes", "no"], { error: "Tell us if it runs" }).transform((v) => v === "yes"),
});

/** Local calendar date in the business time zone (US Pacific) - the earliest a customer may pick. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

const futureDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .refine((v) => v >= todayIso(), "Pickup date can't be in the past")
  .refine((v) => {
    const max = new Date();
    max.setFullYear(max.getFullYear() + 1);
    return v <= max.toISOString().slice(0, 10);
  }, "Choose a date within the next year");

export const quoteRequestSchema = z.object({
  submission_key: z.uuid("Please reload the page and try again"),
  name: required("Name", 120),
  email,
  phone,
  company: trimmed(120).optional().default(""),
  pickup_city: required("Pickup city", 80),
  pickup_state: state,
  pickup_zip: zip,
  delivery_city: required("Delivery city", 80),
  delivery_state: state,
  delivery_zip: zip,
  earliest_pickup_date: futureDate,
  pickup_date_flexible: z.enum(["yes", "no"], { error: "Tell us if the date is flexible" }).transform((v) => v === "yes"),
  transport_type: z.enum(["open", "enclosed"], { error: "Choose open or enclosed transport" }),
  special_instructions: trimmed(2000).optional().default(""),
  vehicles: z.array(vehicleSchema).min(1, "Add at least one vehicle").max(10, "Up to 10 vehicles per request"),
});
export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

export const staffLeadSchema = quoteRequestSchema
  .omit({ submission_key: true, email: true, phone: true, earliest_pickup_date: true })
  .extend({
    customer_id: z.union([z.uuid(), z.literal("")]).optional().default(""),
    email: z.union([email, z.literal("")]).optional().default(""),
    phone: z.union([phone, z.literal("")]).optional().default(""),
    earliest_pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    source: z.enum(["phone", "email", "referral", "repeat_customer", "other", "web_form"]),
    assigned_to: z.union([z.uuid(), z.literal("")]).optional().default(""),
    note: trimmed(5000).optional().default(""),
  })
  .refine((v) => v.customer_id || v.email || v.phone, {
    message: "Enter an email or phone number",
    path: ["phone"],
  });

export const quoteDraftSchema = z
  .object({
    lead_id: z.uuid(),
    carrier_pay: z.coerce.number({ error: "Enter carrier pay" }).min(0, "Can't be negative").max(1_000_000),
    broker_fee: z.coerce.number({ error: "Enter the brokerage fee" }).min(0, "Can't be negative").max(1_000_000),
    pickup_window_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
    pickup_window_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
    expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an expiration date"),
    terms: required("Terms", 5000),
    internal_note: trimmed(2000).optional().default(""),
  })
  .refine((v) => v.pickup_window_end >= v.pickup_window_start, {
    message: "End date must be on or after the start date",
    path: ["pickup_window_end"],
  })
  .refine((v) => v.expires_on >= todayIso(), { message: "Expiration must be today or later", path: ["expires_on"] })
  .refine((v) => v.carrier_pay + v.broker_fee > 0, { message: "Total must be more than $0", path: ["broker_fee"] });

export const followUpSchema = z.object({
  lead_id: z.uuid(),
  assigned_to: z.uuid("Choose a rep"),
  due_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a due date and time"),
  note: trimmed(1000).optional().default(""),
});

export const bookingUpdateSchema = z.object({
  booking_id: z.uuid(),
  pickup_address: trimmed(300),
  pickup_contact_name: trimmed(120),
  pickup_contact_phone: trimmed(30),
  delivery_address: trimmed(300),
  delivery_contact_name: trimmed(120),
  delivery_contact_phone: trimmed(30),
  carrier_name: trimmed(120),
  carrier_phone: trimmed(30),
  notes: trimmed(5000),
  status: z.enum(["awaiting_carrier", "carrier_assigned", "picked_up", "delivered"]),
});

export type FieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Turn FormData with keys like vehicles.0.make into a nested object. */
export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const vehicles: Record<string, Record<string, string>> = {};
  for (const [key, raw] of fd.entries()) {
    if (typeof raw !== "string") continue;
    const m = key.match(/^vehicles\.(\d+)\.(\w+)$/);
    if (m) {
      (vehicles[m[1]!] ??= {})[m[2]!] = raw;
    } else if (!key.startsWith("$ACTION")) {
      out[key] = raw;
    }
  }
  out.vehicles = Object.keys(vehicles)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => vehicles[k]);
  return out;
}

export function normalizePhone(v: string): string {
  const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v.trim();
}
