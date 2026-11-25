"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { fieldErrors, formDataToObject, followUpSchema, normalizePhone, staffLeadSchema } from "@/lib/validation";

const uuid = z.uuid();

function leadPaths(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
}

/** Convert a "YYYY-MM-DDTHH:mm" value entered in business time (US Pacific) to an ISO instant. */
function pacificLocalToIso(local: string): string {
  const [date, time] = local.split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [hh, mm] = time!.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  const offsetFor = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - t;
  };
  return new Date(guess - offsetFor(guess - offsetFor(guess))).toISOString();
}

export async function createLead(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = staffLeadSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrors(parsed.error));
  const d = parsed.data;
  const { data: leadId, error } = await supabase.rpc("create_staff_lead", {
    p: {
      ...d,
      phone: d.phone ? normalizePhone(d.phone) : "",
      vehicles: d.vehicles.map((v) => ({ year: v.year, make: v.make, model: v.model, operable: v.operable })),
    },
  });
  if (error) return fail(dbMessage(error, "Couldn't create the lead."));
  leadPaths(leadId as string);
  redirect(`/leads/${leadId}`);
}

const editSchema = z.object({
  lead_id: uuid,
  contact_name: z.string().trim().min(1, "Name is required").max(120),
  contact_email: z.union([z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), z.literal("")]),
  contact_phone: z.string().trim().max(30),
  contact_company: z.string().trim().max(120),
  pickup_city: z.string().trim().min(1, "Pickup city is required").max(80),
  pickup_state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a pickup state"),
  pickup_zip: z.string().trim().regex(/^\d{5}$/, "Pickup ZIP must be 5 digits"),
  delivery_city: z.string().trim().min(1, "Delivery city is required").max(80),
  delivery_state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a delivery state"),
  delivery_zip: z.string().trim().regex(/^\d{5}$/, "Delivery ZIP must be 5 digits"),
  earliest_pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a pickup date"),
  pickup_date_flexible: z.enum(["yes", "no"]).transform((v) => v === "yes"),
  transport_type: z.enum(["open", "enclosed"]),
  special_instructions: z.string().trim().max(2000),
  vehicles: z.array(z.object({
    year: z.coerce.number().int().min(1900, "Enter a valid year").max(2100, "Enter a valid year"),
    make: z.string().trim().min(1, "Make is required").max(40),
    model: z.string().trim().min(1, "Model is required").max(60),
    operable: z.enum(["yes", "no"]).transform((v) => v === "yes"),
  })).min(1, "Add at least one vehicle").max(10),
});

export async function updateLeadDetails(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = editSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrors(parsed.error));
  const { lead_id, vehicles, ...fields } = parsed.data;

  const { data: lead } = await supabase.from("leads").select("status").eq("id", lead_id).maybeSingle();
  if (!lead) return fail("Lead not found.");
  if (lead.status === "booked") return fail("This lead is booked. Update addresses and notes on the booking instead.");

  const { error } = await supabase
    .from("leads")
    .update({
      ...fields,
      contact_email: fields.contact_email || null,
      contact_phone: fields.contact_phone ? normalizePhone(fields.contact_phone) : null,
      contact_company: fields.contact_company || null,
      special_instructions: fields.special_instructions || null,
    })
    .eq("id", lead_id);
  if (error) return fail(dbMessage(error, "Couldn't save the lead."));

  // Replace the vehicle list (quotes already sent keep their own snapshot).
  const del = await supabase.from("lead_vehicles").delete().eq("lead_id", lead_id);
  if (del.error) return fail(dbMessage(del.error, "Couldn't update vehicles."));
  const ins = await supabase.from("lead_vehicles").insert(
    vehicles.map((v, i) => ({ lead_id, position: i, year: v.year, make: v.make, model: v.model, operable: v.operable })),
  );
  if (ins.error) return fail(dbMessage(ins.error, "Couldn't update vehicles."));

  leadPaths(lead_id);
  redirect(`/leads/${lead_id}`);
}

export async function assignLead(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const leadId = uuid.safeParse(fd.get("lead_id"));
  const assignee = String(fd.get("assigned_to") ?? "");
  if (!leadId.success || (assignee && !uuid.safeParse(assignee).success)) return fail("Invalid request.");
  const { error } = await supabase.from("leads").update({ assigned_to: assignee || null }).eq("id", leadId.data);
  if (error) return fail(dbMessage(error));
  leadPaths(leadId.data);
  return ok("Assignment saved.");
}

export async function updateSource(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const leadId = uuid.safeParse(fd.get("lead_id"));
  const source = z.enum(["web_form", "phone", "email", "referral", "repeat_customer", "other"]).safeParse(fd.get("source"));
  if (!leadId.success || !source.success) return fail("Invalid request.");
  const { error } = await supabase.from("leads").update({ source: source.data }).eq("id", leadId.data);
  if (error) return fail(dbMessage(error));
  leadPaths(leadId.data);
  return ok("Lead source saved.");
}

export async function setStage(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const leadId = uuid.safeParse(fd.get("lead_id"));
  const stage = z.enum(["new", "contacted", "pricing", "quote_sent"]).safeParse(fd.get("status"));
  if (!leadId.success || !stage.success) return fail("Choose a stage.");
  const { error } = await supabase.rpc("set_lead_stage", { p_lead_id: leadId.data, p_status: stage.data });
  if (error) return fail(dbMessage(error));
  leadPaths(leadId.data);
  return ok("Stage updated.");
}

export async function markLost(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const leadId = uuid.safeParse(fd.get("lead_id"));
  const reason = String(fd.get("reason") ?? "").trim();
  const detail = String(fd.get("detail") ?? "").trim();
  if (!leadId.success) return fail("Invalid request.");
  if (!reason) return fail("Choose a reason.", { reason: "A reason is required to mark a lead lost." });
  const full = detail ? `${reason}: ${detail}` : reason;
  const { error } = await supabase.rpc("mark_lead_lost", { p_lead_id: leadId.data, p_reason: full.slice(0, 500) });
  if (error) return fail(dbMessage(error));
  leadPaths(leadId.data);
  return ok("Lead marked lost.");
}

export async function reopenLead(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const leadId = uuid.safeParse(fd.get("lead_id"));
  if (!leadId.success) return fail("Invalid request.");
  const { error } = await supabase.rpc("reopen_lead", { p_lead_id: leadId.data });
  if (error) return fail(dbMessage(error));
  leadPaths(leadId.data);
  return ok("Lead reopened.");
}

export async function addNote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireStaff();
  const leadId = uuid.safeParse(fd.get("lead_id"));
  const body = String(fd.get("body") ?? "").trim();
  if (!leadId.success) return fail("Invalid request.");
  if (!body) return fail("Write a note first.");
  if (body.length > 5000) return fail("Notes are limited to 5,000 characters.");
  const { error } = await supabase.from("lead_notes").insert({ lead_id: leadId.data, author_id: user.id, body });
  if (error) return fail(dbMessage(error));
  leadPaths(leadId.data);
  return ok("Note added.");
}

export async function scheduleFollowUp(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireStaff();
  const parsed = followUpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the follow-up details.", fieldErrors(parsed.error));
  const { error } = await supabase.from("follow_ups").insert({
    lead_id: parsed.data.lead_id,
    assigned_to: parsed.data.assigned_to,
    due_at: pacificLocalToIso(parsed.data.due_at),
    note: parsed.data.note || null,
    created_by: user.id,
  });
  if (error) return fail(dbMessage(error));
  leadPaths(parsed.data.lead_id);
  revalidatePath("/follow-ups");
  return ok("Follow-up scheduled.");
}

export async function completeFollowUp(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireStaff();
  const id = uuid.safeParse(fd.get("follow_up_id"));
  if (!id.success) return fail("Invalid request.");
  const { data, error } = await supabase
    .from("follow_ups")
    .update({ completed_at: new Date().toISOString(), completed_by: user.id })
    .eq("id", id.data)
    .is("completed_at", null)
    .select("lead_id")
    .maybeSingle();
  if (error) return fail(dbMessage(error));
  if (data) leadPaths(data.lead_id);
  revalidatePath("/follow-ups");
  return ok("Follow-up completed.");
}
