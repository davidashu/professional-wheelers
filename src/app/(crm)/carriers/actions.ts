"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternal } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { optDate, optMoney, optText } from "@/lib/form";
import { CARRIER_STANDING } from "@/lib/tms";
import { fieldErrors } from "@/lib/validation";

const digits = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || /^\d{1,8}$/.test(v), `${label} must be up to 8 digits`);

const carrierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  mc_number: digits("MC #"),
  dot_number: digits("DOT #"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
  phone: optText(30),
  contact_name: optText(120),
  standing: z.enum(CARRIER_STANDING),
  standing_reason: optText(500),
  auto_liability_amount: optMoney("Auto liability"),
  cargo_amount: optMoney("Cargo"),
  insurance_expires_on: optDate,
  agreement_signed_on: optDate,
  lanes: optText(1000),
  notes: optText(5000),
});

export async function createCarrier(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireInternal();
  if (profile.role === "sales") return fail("Ask dispatch or an admin to add carriers.");
  const parsed = carrierSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the carrier details.", fieldErrors(parsed.error));
  const { data, error } = await supabase.from("carriers").insert(parsed.data).select("id").single();
  if (error) return fail(error.code === "23505" ? "A carrier with that MC # already exists." : dbMessage(error));
  revalidatePath("/carriers");
  redirect(`/carriers/${data.id}`);
}

export async function updateCarrier(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireInternal();
  if (profile.role === "sales") return fail("Ask dispatch or an admin to edit carriers.");
  const parsed = carrierSchema.extend({ carrier_id: z.uuid() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the carrier details.", fieldErrors(parsed.error));
  const { carrier_id, ...patch } = parsed.data;
  const { error, count } = await supabase.from("carriers").update(patch, { count: "exact" }).eq("id", carrier_id);
  if (error) return fail(error.code === "23505" ? "Another carrier already has that MC #." : dbMessage(error));
  if (!count) return fail("Carrier not found.");
  revalidatePath(`/carriers/${carrier_id}`);
  revalidatePath("/carriers");
  return ok("Carrier saved.");
}
