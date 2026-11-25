"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { laneSchema, optMoney, optText } from "@/lib/form";
import { fieldErrors } from "@/lib/validation";

export async function requestQuote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireCustomer();
  const parsed = laneSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the lane details.", fieldErrors(parsed.error));
  const { data, error } = await supabase.rpc("portal_request_lane", { p: parsed.data });
  if (error) return fail(dbMessage(error, "Couldn't post your lane. Please try again or call us."));
  revalidatePath("/portal");
  return ok(`Posted as ${(data as { reference?: string } | null)?.reference ?? "a new quote order"}. We'll send you a price shortly.`);
}

export async function answerQuote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireCustomer();
  const parsed = z
    .object({
      id: z.uuid(),
      response: z.enum(["approved", "too_high", "too_low", "cancelled"]),
      note: optText(500),
      target_rate: optMoney("Your price"),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please check your answer.", parsed.success ? undefined : fieldErrors(parsed.error));
  const { error } = await supabase.rpc("portal_respond_lane", {
    p_id: parsed.data.id, p_response: parsed.data.response, p_note: parsed.data.note, p_target: parsed.data.target_rate,
  });
  if (error) return fail(dbMessage(error, "Couldn't save your answer."));
  revalidatePath("/portal");
  const msg = {
    approved: "Approved. Your load is booked and we'll start dispatching it.",
    too_high: "Thanks. Your rep will look at the price again.",
    too_low: "Thanks. Your rep will review the quote.",
    cancelled: "Quote order cancelled.",
  } as const;
  return ok(msg[parsed.data.response]);
}
