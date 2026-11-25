"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternal, requireStaff } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { money, optDate, optInt, optMoney, optState, optText, optUuid, optZip, parseVehicles, signedMoney } from "@/lib/form";
import { CARRIER_STATUSES, CUSTOMER_STATUSES, EQUIPMENT, PAY_TERMS, NEEDS_ISSUE_NOTE } from "@/lib/tms";
import { fieldErrors } from "@/lib/validation";

const id = z.uuid("Invalid load");

const detailsSchema = z.object({
  customer_ref: optText(80),
  equipment: z.enum(EQUIPMENT),
  origin_name: optText(120), origin_address: optText(300), origin_city: optText(80), origin_state: optState,
  origin_zip: optZip, origin_contact: optText(120), origin_phone: optText(30),
  dest_name: optText(120), dest_address: optText(300), dest_city: optText(80), dest_state: optState,
  dest_zip: optZip, dest_contact: optText(120), dest_phone: optText(30),
  pickup_date: optDate, pickup_window: optText(200), delivery_date: optDate, delivery_window: optText(200),
  commodity: optText(300), weight_lbs: optInt("Weight", 200000), miles: optInt("Miles", 10000),
  special_instructions: optText(2000), internal_notes: optText(5000),
});

const createSchema = detailsSchema.extend({
  customer_id: z.uuid("Choose a customer"),
  customer_rate: money("Customer rate"),
  carrier_rate: money("Carrier rate"),
  vehicles: z.string().max(4000).optional().default(""),
});

function touch(loadId: string) {
  revalidatePath(`/loads/${loadId}`);
  revalidatePath("/loads");
}

export async function createLoad(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = createSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the load details.", fieldErrors(parsed.error));
  const { vehicles: vehicleText, ...load } = parsed.data;
  const { vehicles, errors } = parseVehicles(vehicleText);
  if (errors.length) return fail("Please fix the vehicles.", { vehicles: errors.join(" ") });

  const { data, error } = await supabase.from("loads").insert(load).select("id").single();
  if (error) return fail(dbMessage(error, "Couldn't create the load."));
  if (vehicles.length) {
    const { error: vErr } = await supabase
      .from("load_vehicles")
      .insert(vehicles.map((v, i) => ({ ...v, load_id: data.id, position: i })));
    if (vErr) return fail(dbMessage(vErr, "The load was created, but the vehicles couldn't be saved."));
  }
  revalidatePath("/loads");
  redirect(`/loads/${data.id}`);
}

export async function updateLoadDetails(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireInternal();
  const parsed = detailsSchema.extend({ load_id: id }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the load details.", fieldErrors(parsed.error));
  const { load_id, ...patch } = parsed.data;
  const { error, count } = await supabase.from("loads").update(patch, { count: "exact" }).eq("id", load_id);
  if (error) return fail(dbMessage(error, "Couldn't save the load."));
  if (!count) return fail("You can't edit this load.");
  touch(load_id);
  return ok("Load saved.");
}

const ratesSchema = z.object({
  load_id: id,
  customer_rate: money("Customer rate"),
  carrier_rate: money("Carrier rate"),
  quick_pay_pct: z.coerce.number().min(0, "0–20%").max(20, "0–20%"),
  carrier_pay_terms: z.enum(PAY_TERMS),
  adjustments: signedMoney("Adjustment"),
  adjustments_note: optText(500),
  competitor_price: optMoney("Competitor price"),
});

export async function updateRates(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireInternal();
  const parsed = ratesSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the rates.", fieldErrors(parsed.error));
  const { load_id, ...rates } = parsed.data;
  // Dispatch manages carrier pay only; the database enforces the same rule.
  const patch =
    profile.role === "dispatch"
      ? { carrier_rate: rates.carrier_rate, quick_pay_pct: rates.quick_pay_pct, carrier_pay_terms: rates.carrier_pay_terms }
      : rates;
  const { error, count } = await supabase.from("loads").update(patch, { count: "exact" }).eq("id", load_id);
  if (error) return fail(dbMessage(error, "Couldn't save the rates."));
  if (!count) return fail("You can't edit this load.");
  touch(load_id);
  return ok("Rates saved.");
}

export async function setCustomerStatus(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireInternal();
  const parsed = z
    .object({ load_id: id, status: z.enum(CUSTOMER_STATUSES), note: optText(2000) })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Choose a status.");
  const { load_id, status, note } = parsed.data;
  const patch: Record<string, unknown> = { customer_status: status };
  if (status === "cancelled") {
    if (!note) return fail("Add the reason the load was cancelled.", { note: "Reason is required" });
    patch.cancel_reason = note;
  } else if (NEEDS_ISSUE_NOTE.includes(status)) {
    if (!note) return fail("Describe the issue.", { note: "A note is required for issue statuses" });
    patch.issue_note = note;
  }
  const { error, count } = await supabase.from("loads").update(patch, { count: "exact" }).eq("id", load_id);
  if (error) return fail(dbMessage(error, "Couldn't change the status."));
  if (!count) return fail("You can't edit this load.");
  touch(load_id);
  return ok("Customer status updated.");
}

export async function setCarrierStatus(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireInternal();
  const parsed = z
    .object({ load_id: id, status: z.enum(CARRIER_STATUSES), note: optText(2000), carrier_invoice_number: optText(60) })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Choose a status.");
  const { load_id, status, note, carrier_invoice_number } = parsed.data;
  const patch: Record<string, unknown> = { carrier_status: status };
  if (status === "issue") {
    if (!note) return fail("Describe the issue or claim.", { note: "A note is required" });
    patch.issue_note = note;
  }
  if (carrier_invoice_number) patch.carrier_invoice_number = carrier_invoice_number;
  const { error, count } = await supabase.from("loads").update(patch, { count: "exact" }).eq("id", load_id);
  if (error) return fail(dbMessage(error, "Couldn't change the status."));
  if (!count) return fail("You can't edit this load.");
  touch(load_id);
  return ok("Carrier status updated.");
}

export async function assignLoad(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireInternal();
  const parsed = z
    .object({ load_id: id, carrier_id: optUuid, dispatcher_id: optUuid, sales_rep_id: optUuid })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid selection.");
  const { load_id, ...a } = parsed.data;
  const patch: Record<string, unknown> = { carrier_id: a.carrier_id };
  if (profile.role !== "dispatch") patch.dispatcher_id = a.dispatcher_id;
  if (profile.role === "admin") patch.sales_rep_id = a.sales_rep_id;
  const { error, count } = await supabase.from("loads").update(patch, { count: "exact" }).eq("id", load_id);
  if (error) return fail(dbMessage(error, "Couldn't save the assignment."));
  if (!count) return fail("You can't edit this load.");
  touch(load_id);
  return ok("Assignment saved.");
}

export async function replaceVehicles(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireInternal();
  const loadId = id.safeParse(fd.get("load_id"));
  if (!loadId.success) return fail("Invalid load.");
  const { vehicles, errors } = parseVehicles(String(fd.get("vehicles") ?? ""));
  if (errors.length) return fail("Please fix the vehicles.", { vehicles: errors.join(" ") });
  const del = await supabase.from("load_vehicles").delete().eq("load_id", loadId.data);
  if (del.error) return fail(dbMessage(del.error));
  if (vehicles.length) {
    const ins = await supabase.from("load_vehicles").insert(vehicles.map((v, i) => ({ ...v, load_id: loadId.data, position: i })));
    if (ins.error) return fail(dbMessage(ins.error));
  }
  touch(loadId.data);
  return ok("Vehicles saved.");
}

export async function createInvoice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = z
    .object({ load_id: id, amount: money("Amount"), due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"), notes: optText(2000) })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the invoice.", fieldErrors(parsed.error));
  const { data: load } = await supabase.from("loads").select("customer_id").eq("id", parsed.data.load_id).maybeSingle();
  if (!load) return fail("Load not found.");
  const { error } = await supabase.from("invoices").insert({ ...parsed.data, customer_id: load.customer_id });
  if (error) return fail(dbMessage(error, "Couldn't issue the invoice."));
  touch(parsed.data.load_id);
  return ok("Invoice issued. The customer can see it in their portal.");
}

export async function setInvoiceStatus(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = z.object({ invoice_id: z.uuid(), status: z.enum(["paid", "void"]), load_id: id }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid request.");
  const { invoice_id, status, load_id } = parsed.data;
  const patch = status === "paid" ? { status, paid_on: new Date().toISOString().slice(0, 10) } : { status };
  const { error, count } = await supabase.from("invoices").update(patch, { count: "exact" }).eq("id", invoice_id);
  if (error) return fail(dbMessage(error, "Couldn't update the invoice."));
  if (!count) return fail("Invoice not found.");
  touch(load_id);
  return ok(status === "paid" ? "Invoice marked paid." : "Invoice voided.");
}
