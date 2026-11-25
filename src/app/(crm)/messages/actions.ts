"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, displayName } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { serverEnv } from "@/lib/env";
import { getSettings } from "@/lib/data";
import { newMessageEmailContent, sendEmail } from "@/lib/email";
import { newPortalToken, portalLoginUrl } from "@/lib/portal";
import type { Customer } from "@/lib/types";

const schema = z.object({
  customer_id: z.uuid(),
  lead_id: z.union([z.uuid(), z.literal("")]).optional(),
  body: z.string().trim().min(1, "Type a message first.").max(4000, "Messages can be up to 4,000 characters."),
  notify: z.string().optional(),
});

function refresh(customerId: string, leadId?: string | null) {
  revalidatePath("/messages");
  revalidatePath(`/customers/${customerId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/** Staff reply. Optionally emails the customer a "new message" notice with a sign-in link. */
export async function sendStaffMessage(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireStaff();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid message.");
  const { customer_id, body } = parsed.data;
  const leadId = parsed.data.lead_id || null;

  const { data: msg, error } = await supabase
    .from("messages")
    .insert({ customer_id, lead_id: leadId, sender_type: "staff", sender_id: profile.id, body })
    .select("id")
    .single();
  if (error || !msg) return fail(dbMessage(error, "Your message wasn't sent."));
  // Replying means the customer's messages have been seen.
  await supabase.rpc("mark_customer_messages_read", { p_customer_id: customer_id });

  let note = "Sent. The customer sees it in their portal.";
  if (parsed.data.notify === "on") {
    const { data: customer } = await supabase.from("customers").select("*").eq("id", customer_id).single<Customer>();
    if (!serverEnv.emailConfigured) {
      await supabase.from("messages").update({ email_status: "not_configured" }).eq("id", msg.id);
      note = "Sent to the portal. Email isn't set up, so the customer wasn't emailed.";
    } else if (!customer?.email) {
      note = "Sent to the portal. This customer has no email address, so they weren't emailed.";
    } else {
      const invite = newPortalToken();
      const { error: inviteError } = await supabase.rpc("create_portal_invite", { p_customer_id: customer_id, p_token_hash: invite.tokenHash });
      const settings = await getSettings(supabase);
      const result = inviteError
        ? ({ ok: false, error: "Couldn't create a sign-in link" } as const)
        : await sendEmail({
            to: customer.email,
            ...newMessageEmailContent({
              customerName: customer.name,
              companyName: settings.company_name,
              staffName: profile.full_name?.split(" ")[0] || displayName(profile),
              link: portalLoginUrl(invite.token),
            }),
            idempotencyKey: `portal-message-${msg.id}`,
          });
      await supabase
        .from("messages")
        .update(result.ok ? { email_status: "sent" } : { email_status: "failed", email_error: result.error.slice(0, 500) })
        .eq("id", msg.id);
      note = result.ok ? `Sent, and ${customer.email} was emailed a notice.` : `Sent to the portal, but the email notice failed: ${result.error}`;
    }
  }
  refresh(customer_id, leadId);
  return ok(note);
}

/** A 7-day sign-in link a staff member can text or email to the customer themselves. */
export async function createPortalLink(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const id = z.uuid().safeParse(fd.get("customer_id"));
  if (!id.success) return fail("Invalid request.");
  const invite = newPortalToken();
  const { error } = await supabase.rpc("create_portal_invite", { p_customer_id: id.data, p_token_hash: invite.tokenHash });
  if (error) return fail(dbMessage(error, "Couldn't create a sign-in link."));
  return ok("Link ready. It works for 7 days. Send it only to this customer.", { link: portalLoginUrl(invite.token) });
}
