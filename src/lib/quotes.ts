import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { sendQuoteEmail } from "@/lib/email";
import { recoverQuoteToken } from "@/lib/tokens";
import type { Lead, Quote } from "@/lib/types";

export function quoteLink(token: string) {
  return `${serverEnv.siteUrl}/q/${token}`;
}

/** The customer link for a sent quote, or null if it can't be rebuilt with the current secret. */
export function linkForQuote(q: Pick<Quote, "link_id" | "token_hash">): string | null {
  if (!q.link_id || !q.token_hash) return null;
  const token = recoverQuoteToken(q.link_id, q.token_hash, serverEnv.quoteLinkSecret);
  return token ? quoteLink(token) : null;
}

/** End of the chosen day in business time (US Pacific). */
export function expiryFromDate(isoDate: string): string {
  // 23:59:59 Pacific == 06:59:59/07:59:59 UTC next day depending on DST; compute via offset.
  const [y, m, d] = isoDate.split("-").map(Number);
  const noonUtc = Date.UTC(y!, m! - 1, d!, 12);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" })
    .formatToParts(new Date(noonUtc))
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT-8"
  const offsetHours = Number(parts.replace("GMT", "") || 0);
  return new Date(Date.UTC(y!, m! - 1, d!, 23 - offsetHours, 59, 59)).toISOString();
}

export type EmailOutcome = { status: "sent" | "failed" | "skipped"; message: string };

/**
 * Email a quote link and record the delivery honestly:
 * pending -> sent (provider accepted it, with message id) or failed (with error).
 * "delivered"/"bounced" only arrive later from the provider webhook.
 */
export async function emailQuote(
  supabase: SupabaseClient,
  quote: Quote,
  lead: Lead,
  link: string,
  companyName: string,
): Promise<EmailOutcome> {
  if (!serverEnv.emailConfigured) {
    return { status: "skipped", message: "Email isn't set up yet, so nothing was sent. Copy the link and send it yourself." };
  }
  if (!lead.contact_email) {
    return { status: "skipped", message: "This lead has no email address. Copy the link and text or email it." };
  }
  const subject = `${quote.version > 1 ? "Your revised" : "Your"} vehicle shipping quote ${lead.reference}`;
  const { data: delivery, error } = await supabase
    .from("email_deliveries")
    .insert({ quote_id: quote.id, lead_id: lead.id, to_email: lead.contact_email, subject, status: "pending" })
    .select("id")
    .single();
  if (error || !delivery) {
    return { status: "failed", message: "Couldn't record the email, so it wasn't sent. Try again." };
  }

  const result = await sendQuoteEmail({
    to: lead.contact_email,
    customerName: lead.contact_name,
    companyName,
    reference: lead.reference,
    version: quote.version,
    total: Number(quote.total),
    routeText: `${lead.pickup_city}, ${lead.pickup_state} to ${lead.delivery_city}, ${lead.delivery_state}`,
    pickupWindowStart: quote.pickup_window_start,
    pickupWindowEnd: quote.pickup_window_end,
    expiresAt: quote.expires_at,
    link,
    idempotencyKey: delivery.id,
  });

  if (result.ok) {
    await supabase.from("email_deliveries").update({ status: "sent", provider_message_id: result.id }).eq("id", delivery.id);
    return { status: "sent", message: `Emailed to ${lead.contact_email}.` };
  }
  await supabase.from("email_deliveries").update({ status: "failed", error: result.error.slice(0, 500) }).eq("id", delivery.id);
  return { status: "failed", message: `The email to ${lead.contact_email} failed: ${result.error}. Copy the link instead.` };
}
