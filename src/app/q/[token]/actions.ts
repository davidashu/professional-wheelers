"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { clientIp, hashIp } from "@/lib/spam";
import { hashToken, isWellFormedToken } from "@/lib/tokens";
import { z } from "zod";
import { fieldErrors, normalizePhone } from "@/lib/validation";
import type { PublicQuote } from "@/lib/types";

export type RespondState = { ok: boolean; message: string } | null;

const MESSAGES: Record<string, { ok: boolean; message: string }> = {
  accepted: { ok: true, message: "Thank you! Your shipment is booked." },
  already_accepted: { ok: true, message: "You've already accepted this quote. Your shipment is booked." },
  declined: { ok: true, message: "Thanks for letting us know. We've recorded that you declined this quote." },
  already_declined: { ok: true, message: "You already declined this quote." },
  expired: { ok: false, message: "This quote has expired, so it can't be accepted. Contact us for an updated price." },
  superseded: { ok: false, message: "We've sent you a newer quote. Please use the link in your most recent message." },
  withdrawn: { ok: false, message: "This quote is no longer available. Please contact us." },
  unavailable: { ok: false, message: "This quote is no longer available. Please contact us." },
  not_found: { ok: false, message: "We couldn't find this quote. Please check your link." },
};

export async function respondToQuote(_prev: RespondState, fd: FormData): Promise<RespondState> {
  const token = String(fd.get("token") ?? "");
  const action = String(fd.get("action") ?? "");
  if (!isWellFormedToken(token) || (action !== "accept" && action !== "decline")) {
    return MESSAGES.not_found!;
  }
  if (action === "accept" && fd.get("agree") !== "on") {
    return { ok: false, message: "Please confirm you agree to the terms before accepting." };
  }
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 1000);
  const ipHash = hashIp(clientIp(await headers()), serverEnv.appSecret);

  const { data, error } = await createAdminClient().rpc("respond_to_quote", {
    p_token_hash: hashToken(token),
    p_action: action,
    p_reason: reason || null,
    p_ip_hash: ipHash,
  });
  if (error) {
    console.error("respond_to_quote failed", { code: error.code });
    return { ok: false, message: "We couldn't record your response. Please try again in a moment." };
  }
  const result = (data as { result: string }).result;
  revalidatePath(`/q/${token}`);
  // Only the outcome goes back to the browser: never any pricing internals.
  return MESSAGES[result] ?? { ok: false, message: "This quote can't be changed. Please contact us." };
}

const detailsSchema = z.object({
  token: z.string(),
  pickup_street: z.string().trim().min(3, "Enter the pickup street address").max(200),
  pickup_contact_name: z.string().trim().min(2, "Enter a pickup contact name").max(120),
  pickup_contact_phone: z.string().trim().refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a pickup contact phone"),
  delivery_street: z.string().trim().min(3, "Enter the delivery street address").max(200),
  delivery_contact_name: z.string().trim().min(2, "Enter a delivery contact name").max(120),
  delivery_contact_phone: z.string().trim().refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a delivery contact phone"),
  customer_notes: z.string().trim().max(1000).optional().default(""),
  signed_name: z.string().trim().min(2, "Type your full name to sign").max(120),
  agree: z.literal("on", { error: "Check the box to accept the agreement" }),
});

export type DetailsState = { ok: boolean; message: string; errors?: Record<string, string> } | null;

export async function submitBookingDetails(_prev: DetailsState, fd: FormData): Promise<DetailsState> {
  const parsed = detailsSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", errors: fieldErrors(parsed.error) };
  const d = parsed.data;
  if (!isWellFormedToken(d.token)) return MESSAGES.not_found!;
  const admin = createAdminClient();
  const tokenHash = hashToken(d.token);

  // City/state/ZIP come from the accepted quote; the customer adds the street.
  const { data: quote } = await admin.rpc("get_public_quote", { p_token_hash: tokenHash });
  const q = quote as PublicQuote | null;
  if (!q || q.state !== "accepted" || !q.pickup || !q.delivery) {
    return { ok: false, message: "This booking can't be updated from this link. Please contact us." };
  }
  const place = (street: string, p: { city: string; state: string; zip: string }) => `${street}, ${p.city}, ${p.state} ${p.zip}`;

  const { data, error } = await admin.rpc("submit_booking_details", {
    p_token_hash: tokenHash,
    p: {
      pickup_address: place(d.pickup_street, q.pickup),
      pickup_contact_name: d.pickup_contact_name,
      pickup_contact_phone: normalizePhone(d.pickup_contact_phone),
      delivery_address: place(d.delivery_street, q.delivery),
      delivery_contact_name: d.delivery_contact_name,
      delivery_contact_phone: normalizePhone(d.delivery_contact_phone),
      customer_notes: d.customer_notes,
      signed_name: d.signed_name,
      agree: true,
    },
    p_ip_hash: hashIp(clientIp(await headers()), serverEnv.appSecret),
  });
  if (error) {
    console.error("submit_booking_details failed", { code: error.code });
    return { ok: false, message: "We couldn't save your details. Please try again in a moment." };
  }
  const result = (data as { result: string }).result;
  revalidatePath(`/q/${d.token}`);
  if (result === "submitted") return { ok: true, message: "Thank you! Your booking details and signed agreement are saved." };
  if (result === "already_submitted") return { ok: true, message: "We already have your signed agreement. Contact us to change any details." };
  return { ok: false, message: "This booking can't be updated from this link. Please contact us." };
}
