"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { portalLoginEmailContent, sendEmail } from "@/lib/email";
import { clientIp, hashIp } from "@/lib/spam";
import { hashToken, isWellFormedToken } from "@/lib/tokens";
import { clearPortalCookie, newPortalToken, portalLoginUrl, portalSessionHash, setPortalCookie } from "@/lib/portal";

export type PortalFormState = { ok: boolean; message: string } | null;

const CHECK_EMAIL =
  "If that email is on file with us, a sign-in link is on its way. It works once and expires in 30 minutes. Check your spam folder if you don't see it.";

/** Step 1: email a one-time sign-in link. The answer is the same whether or not we know the email. */
export async function requestPortalLink(_prev: PortalFormState, fd: FormData): Promise<PortalFormState> {
  if (String(fd.get("website") ?? "") !== "") return { ok: true, message: CHECK_EMAIL }; // honeypot
  const email = z.email().max(200).safeParse(String(fd.get("email") ?? "").trim());
  if (!email.success) return { ok: false, message: "Enter the email address you used for your quote." };
  if (!serverEnv.emailConfigured) {
    return {
      ok: false,
      message:
        "Email sign-in isn't available yet. Open the quote link we sent you and choose “Open my customer portal”, or ask our team for a sign-in link.",
    };
  }

  const { token, tokenHash } = newPortalToken();
  const ipHash = hashIp(clientIp(await headers()), serverEnv.appSecret);
  const { data, error } = await createAdminClient().rpc("portal_request_login", {
    p_email: email.data,
    p_token_hash: tokenHash,
    p_ip_hash: ipHash,
  });
  if (error) {
    console.error("portal_request_login failed", { code: error.code });
    return { ok: false, message: "We couldn't send a sign-in link right now. Please try again in a moment." };
  }
  const r = data as { result: string; name?: string; email?: string };
  if (r.result === "rate_limited") {
    return { ok: false, message: "Too many sign-in requests. Please wait a while and try again." };
  }
  if (r.result === "ok" && r.email) {
    const content = portalLoginEmailContent({ customerName: r.name ?? "", companyName: serverEnv.companyName, link: portalLoginUrl(token) });
    const sent = await sendEmail({ to: r.email, ...content, idempotencyKey: `portal-login-${tokenHash.slice(0, 32)}` });
    if (!sent.ok) console.error("Portal sign-in email failed", { error: sent.error });
  }
  return { ok: true, message: CHECK_EMAIL };
}

const LINK_ERRORS: Record<string, string> = {
  invalid: "This sign-in link isn't valid. Request a new one below.",
  expired: "This sign-in link has expired. Request a new one below.",
  used: "This sign-in link was already used. Request a new one below.",
};

/** Step 2: the customer presses "Continue" on /portal/auth. A POST, so email link scanners can't use up the link. */
export async function redeemPortalLink(_prev: PortalFormState, fd: FormData): Promise<PortalFormState> {
  const token = String(fd.get("token") ?? "");
  if (!isWellFormedToken(token)) return { ok: false, message: LINK_ERRORS.invalid! };
  const session = newPortalToken();
  const { data, error } = await createAdminClient().rpc("portal_redeem_login", {
    p_token_hash: hashToken(token),
    p_session_hash: session.tokenHash,
  });
  if (error) {
    console.error("portal_redeem_login failed", { code: error.code });
    return { ok: false, message: "We couldn't sign you in right now. Please try again." };
  }
  const result = (data as { result: string }).result;
  if (result !== "ok") return { ok: false, message: LINK_ERRORS[result] ?? LINK_ERRORS.invalid! };
  await setPortalCookie(session.token);
  redirect("/portal");
}

/** "Open my customer portal" on a quote link page. */
export async function openPortalFromQuote(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (!isWellFormedToken(token)) redirect("/portal/login");
  const session = newPortalToken();
  const { data, error } = await createAdminClient().rpc("portal_session_from_quote", {
    p_quote_token_hash: hashToken(token),
    p_session_hash: session.tokenHash,
  });
  if (error || (data as { result: string } | null)?.result !== "ok") redirect("/portal/login?error=link");
  await setPortalCookie(session.token);
  redirect("/portal");
}

export async function signOutOfPortal() {
  const hash = await portalSessionHash();
  if (hash) await createAdminClient().rpc("portal_sign_out", { p_session_hash: hash });
  await clearPortalCookie();
  redirect("/portal/login?signed_out=1");
}

export async function sendPortalMessage(_prev: PortalFormState, fd: FormData): Promise<PortalFormState> {
  const body = String(fd.get("body") ?? "").trim();
  const reference = String(fd.get("reference") ?? "").trim();
  if (!body) return { ok: false, message: "Type a message first." };
  if (body.length > 4000) return { ok: false, message: "Messages can be up to 4,000 characters." };
  const hash = await portalSessionHash();
  if (!hash) redirect("/portal/login");
  const { data, error } = await createAdminClient().rpc("portal_send_message", {
    p_session_hash: hash,
    p_body: body,
    p_reference: /^Q-[A-Z0-9]{6}$/.test(reference) ? reference : null,
  });
  if (error) {
    console.error("portal_send_message failed", { code: error.code });
    return { ok: false, message: "Your message wasn't sent. Please try again." };
  }
  const result = (data as { result: string }).result;
  if (result === "signed_out") redirect("/portal/login");
  if (result === "rate_limited") return { ok: false, message: "You've sent a lot of messages in the last hour. Please wait a bit, or call us." };
  if (result !== "sent") return { ok: false, message: "Your message wasn't sent. Please try again." };
  revalidatePath("/portal/messages");
  return { ok: true, message: "Sent" };
}
