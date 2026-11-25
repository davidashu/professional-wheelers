"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { serverEnv } from "@/lib/env";
import { getSettings } from "@/lib/data";
import { emailQuote, expiryFromDate, linkForQuote, quoteLink } from "@/lib/quotes";
import { newQuoteLink } from "@/lib/tokens";
import type { Lead, Quote } from "@/lib/types";
import { fieldErrors, quoteDraftSchema } from "@/lib/validation";

const uuid = z.uuid();

function refresh(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath("/bookings");
}

async function loadQuote(quoteId: string) {
  const ctx = await requireStaff();
  const { data: quote } = await ctx.supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle<Quote>();
  if (!quote) return { ...ctx, quote: null, lead: null };
  const { data: lead } = await ctx.supabase.from("leads").select("*").eq("id", quote.lead_id).single<Lead>();
  return { ...ctx, quote, lead };
}

export async function saveQuote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const intent = String(fd.get("intent") ?? "draft");
  const parsed = quoteDraftSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the quote details.", fieldErrors(parsed.error));
  const q = parsed.data;

  const { data: quoteId, error } = await supabase.rpc("save_quote_draft", {
    p_lead_id: q.lead_id,
    p_carrier_pay: q.carrier_pay,
    p_broker_fee: q.broker_fee,
    p_pickup_window_start: q.pickup_window_start,
    p_pickup_window_end: q.pickup_window_end,
    p_terms: q.terms,
    p_expires_at: expiryFromDate(q.expires_on),
    p_internal_note: q.internal_note,
  });
  if (error) return fail(dbMessage(error, "Couldn't save the quote."));
  if (intent === "draft") {
    refresh(q.lead_id);
    return ok("Draft saved. It isn't visible to the customer until you send it.");
  }

  const link = newQuoteLink(serverEnv.quoteLinkSecret);
  const { data: sent, error: sendError } = await supabase
    .rpc("send_quote", { p_quote_id: quoteId, p_link_id: link.linkId, p_token_hash: link.tokenHash })
    .single<Quote>();
  if (sendError || !sent) {
    refresh(q.lead_id);
    return fail(dbMessage(sendError, "The draft was saved but couldn't be sent."));
  }
  const url = quoteLink(link.token);

  if (intent === "send_email") {
    const { data: lead } = await supabase.from("leads").select("*").eq("id", q.lead_id).single<Lead>();
    const settings = await getSettings(supabase);
    const outcome = await emailQuote(supabase, sent, lead!, url, settings.company_name);
    refresh(q.lead_id);
    return { ok: outcome.status === "sent", message: `Quote v${sent.version} is live. ${outcome.message}`, data: { link: url } };
  }
  refresh(q.lead_id);
  return ok(`Quote v${sent.version} is live. Copy the link below and send it to the customer.`, { link: url });
}

export async function resendQuoteEmail(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("quote_id"));
  if (!id.success) return fail("Invalid request.");
  const { supabase, quote, lead } = await loadQuote(id.data);
  if (!quote || !lead) return fail("Quote not found.");
  if (quote.status !== "sent") return fail("Only an active quote can be emailed.");
  if (new Date(quote.expires_at) <= new Date()) return fail("This quote has expired. Create a revision with a new expiration date.");
  const link = linkForQuote(quote);
  if (!link) return fail("This link can't be rebuilt (the link secret changed). Issue a new link first.");
  const settings = await getSettings(supabase);
  const outcome = await emailQuote(supabase, quote, lead, link, settings.company_name);
  refresh(lead.id);
  return outcome.status === "sent" ? ok(outcome.message) : fail(outcome.message);
}

export async function rotateQuoteLink(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const id = uuid.safeParse(fd.get("quote_id"));
  const leadId = uuid.safeParse(fd.get("lead_id"));
  if (!id.success || !leadId.success) return fail("Invalid request.");
  const link = newQuoteLink(serverEnv.quoteLinkSecret);
  const { error } = await supabase.rpc("rotate_quote_link", {
    p_quote_id: id.data,
    p_link_id: link.linkId,
    p_token_hash: link.tokenHash,
  });
  if (error) return fail(dbMessage(error));
  refresh(leadId.data);
  return ok("New link issued. The old link no longer works.", { link: quoteLink(link.token) });
}

export async function withdrawQuote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const id = uuid.safeParse(fd.get("quote_id"));
  const leadId = uuid.safeParse(fd.get("lead_id"));
  if (!id.success || !leadId.success) return fail("Invalid request.");
  const { error } = await supabase.rpc("withdraw_quote", { p_quote_id: id.data });
  if (error) return fail(dbMessage(error));
  refresh(leadId.data);
  return ok("Quote withdrawn. The customer link no longer accepts responses.");
}

export async function recordPhoneAcceptance(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const id = uuid.safeParse(fd.get("quote_id"));
  const leadId = uuid.safeParse(fd.get("lead_id"));
  if (!id.success || !leadId.success) return fail("Invalid request.");
  const { data, error } = await supabase.rpc("staff_record_acceptance", { p_quote_id: id.data });
  if (error) return fail(dbMessage(error));
  const r = data as { result: string; booking_reference?: string };
  refresh(leadId.data);
  if (r.result === "accepted" || r.result === "already_accepted") {
    return ok(`Booked. Booking ${r.booking_reference} is awaiting a carrier.`);
  }
  const reasons: Record<string, string> = {
    expired: "This quote has expired. Send a revised quote first.",
    superseded: "A newer version replaced this quote.",
    withdrawn: "This quote was withdrawn.",
    declined: "The customer declined this quote.",
    unavailable: "This lead is no longer open.",
  };
  return fail(reasons[r.result] ?? "This quote can't be accepted.");
}

export async function discardDraft(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const id = uuid.safeParse(fd.get("quote_id"));
  const leadId = uuid.safeParse(fd.get("lead_id"));
  if (!id.success || !leadId.success) return fail("Invalid request.");
  const { error } = await supabase.from("quotes").delete().eq("id", id.data).eq("status", "draft");
  if (error) return fail(dbMessage(error));
  refresh(leadId.data);
  return ok("Draft discarded.");
}
