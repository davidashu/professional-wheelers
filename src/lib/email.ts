import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { money, pickupWindow, formatDate } from "@/lib/format";

export type QuoteEmailInput = {
  to: string;
  customerName: string;
  companyName: string;
  reference: string;
  version: number;
  total: number;
  routeText: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  expiresAt: string;
  link: string;
  idempotencyKey: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function quoteEmailContent(i: QuoteEmailInput) {
  const subject = `${i.version > 1 ? "Your revised" : "Your"} vehicle shipping quote ${i.reference}`;
  const first = i.customerName.split(" ")[0] || "there";
  const text = [
    `Hi ${first},`,
    "",
    `Thanks for requesting a quote from ${i.companyName}. Your quote for ${i.routeText} is ready.`,
    "",
    `Total price: ${money(i.total)}`,
    `Pickup window: ${pickupWindow(i.pickupWindowStart, i.pickupWindowEnd)}`,
    `Valid until: ${formatDate(i.expiresAt)}`,
    "",
    `Review and accept your quote: ${i.link}`,
    "",
    `${i.companyName}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p>Hi ${esc(first)},</p>
<p>Thanks for requesting a quote from ${esc(i.companyName)}. Your quote for <strong>${esc(i.routeText)}</strong> is ready.</p>
<table style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:4px 16px 4px 0;color:#475569">Total price</td><td style="padding:4px 0;font-weight:bold">${esc(money(i.total))}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#475569">Pickup window</td><td style="padding:4px 0">${esc(pickupWindow(i.pickupWindowStart, i.pickupWindowEnd))}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#475569">Valid until</td><td style="padding:4px 0">${esc(formatDate(i.expiresAt))}</td></tr>
</table>
<p><a href="${esc(i.link)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Review your quote</a></p>
<p style="color:#64748b;font-size:13px">Reference ${esc(i.reference)}. This link is personal to you; please don't forward it.</p>
</body></html>`;
  return { subject, text, html };
}

/** Sends via Resend's REST API. Returns the provider's message id on success. */
export async function sendQuoteEmail(input: QuoteEmailInput): Promise<SendResult> {
  const apiKey = serverEnv.resendApiKey;
  const from = serverEnv.emailFrom;
  if (!apiKey || !from) return { ok: false, error: "Email provider is not configured" };
  const { subject, text, html } = quoteEmailContent(input);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject,
        text,
        html,
        ...(serverEnv.emailReplyTo ? { reply_to: serverEnv.emailReplyTo } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok || !body.id) {
      return { ok: false, error: body.message || body.name || `Provider returned HTTP ${res.status}` };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error contacting email provider" };
  }
}

/**
 * Verify a Resend (Svix) webhook signature.
 * signed payload = `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the
 * base64-decoded secret (after the "whsec_" prefix).
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const RESEND_EVENT_STATUS: Record<string, "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed"> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};
