"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { laneSchema, money, optMoney, optText } from "@/lib/form";
import { fieldErrors } from "@/lib/validation";

function touch() {
  revalidatePath("/quote-orders");
  revalidatePath("/loads");
}

export async function postQuoteOrder(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = laneSchema.extend({ customer_id: z.uuid("Choose a customer") }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the quote order.", fieldErrors(parsed.error));
  const { error } = await supabase.from("lane_requests").insert(parsed.data);
  if (error) return fail(dbMessage(error, "Couldn't post the quote order."));
  touch();
  return ok("Quote order posted.");
}

export async function priceQuoteOrder(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = z.object({ id: z.uuid(), rate: money("Rate"), note: optText(2000) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the quote.", fieldErrors(parsed.error));
  const { error } = await supabase.rpc("quote_lane_request", { p_id: parsed.data.id, p_rate: parsed.data.rate, p_note: parsed.data.note });
  if (error) return fail(dbMessage(error, "Couldn't save the quote."));
  touch();
  return ok("Quote sent. The customer sees it in their portal.");
}

export async function recordQuoteResponse(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = z
    .object({
      id: z.uuid(),
      response: z.enum(["approved", "too_high", "too_low", "cancelled"]),
      note: optText(500),
      target_rate: optMoney("Target rate"),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid response.");
  const { data, error } = await supabase.rpc("staff_respond_quote_order", {
    p_id: parsed.data.id, p_response: parsed.data.response, p_note: parsed.data.note, p_target: parsed.data.target_rate,
  });
  if (error) return fail(dbMessage(error, "Couldn't record the answer."));
  touch();
  const loadId = (data as { load_id?: string } | null)?.load_id;
  return ok(parsed.data.response === "approved" ? "Approved. The load was created." : "Answer recorded.", loadId ? { load_id: loadId } : undefined);
}
