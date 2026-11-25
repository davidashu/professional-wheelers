"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { optText, optState, optZip } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { fieldErrors, normalizePhone } from "@/lib/validation";

const schema = z.object({
  customer_id: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.union([z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), z.literal("")]),
  phone: z.string().trim().max(30),
  company: z.string().trim().max(120),
  notes: z.string().trim().max(5000),
  billing_email: z.union([z.string().trim().toLowerCase().pipe(z.email("Enter a valid billing email")), z.literal("")]).optional().default(""),
  payment_terms_days: z.coerce.number().int().min(0, "0–120 days").max(120, "0–120 days").optional().default(0),
  customer_type: z.string().trim().max(60).optional().default(""),
});

export async function updateCustomer(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrors(parsed.error));
  const { customer_id, ...c } = parsed.data;
  const { error } = await supabase
    .from("customers")
    .update({
      name: c.name,
      email: c.email || null,
      phone: c.phone ? normalizePhone(c.phone) : null,
      company: c.company || null,
      notes: c.notes || null,
      billing_email: c.billing_email || null,
      payment_terms_days: c.payment_terms_days,
      customer_type: c.customer_type || null,
    })
    .eq("id", customer_id);
  if (error) {
    if (error.code === "23505") return fail("Another customer already uses that email. Search for them instead.");
    return fail(dbMessage(error));
  }
  revalidatePath(`/customers/${customer_id}`);
  revalidatePath("/customers");
  return ok("Customer saved.");
}

export async function setSalesRep(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = z.object({ customer_id: z.uuid(), sales_rep_id: z.union([z.uuid(), z.literal("")]) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid selection.");
  const { error, count } = await supabase
    .from("customers")
    .update({ sales_rep_id: parsed.data.sales_rep_id || null }, { count: "exact" })
    .eq("id", parsed.data.customer_id);
  if (error) return fail(dbMessage(error));
  if (!count) return fail("Customer not found.");
  revalidatePath(`/customers/${parsed.data.customer_id}`);
  revalidatePath("/customers");
  return ok("Sales rep saved.");
}

const locationSchema = z.object({
  customer_id: z.uuid(),
  name: z.string().trim().min(1, "Location name is required").max(120),
  address: optText(300), city: optText(80), state: optState, zip: optZip,
  contact_name: optText(120), contact_phone: optText(30), hours: optText(200), notes: optText(2000),
});

export async function addLocation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = locationSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the location.", fieldErrors(parsed.error));
  const { error } = await supabase.from("customer_locations").insert(parsed.data);
  if (error) return fail(dbMessage(error));
  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return ok("Location added.");
}

export async function removeLocation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = z.object({ customer_id: z.uuid(), location_id: z.uuid() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid location.");
  const { error } = await supabase.from("customer_locations").delete().eq("id", parsed.data.location_id);
  if (error) return fail(dbMessage(error));
  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return ok("Location removed.");
}

const portalUserSchema = z.object({
  customer_id: z.uuid(),
  full_name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(12, "Temporary password must be at least 12 characters").max(72),
});

/** Admin creates a portal login for someone at the customer (for example one per store). */
export async function addPortalUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = portalUserSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the login details.", fieldErrors(parsed.error));
  const d = parsed.data;
  const { error } = await createAdminClient().auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    app_metadata: { role: "customer", customer_id: d.customer_id },
    user_metadata: { full_name: d.full_name },
  });
  if (error) {
    return fail(/already|exists|registered/i.test(error.message) ? "A user with that email already exists." : `Couldn't add the login: ${error.message}`);
  }
  revalidatePath(`/customers/${d.customer_id}`);
  return ok(`${d.full_name} can now sign in to the customer portal. Send them the temporary password separately.`);
}
