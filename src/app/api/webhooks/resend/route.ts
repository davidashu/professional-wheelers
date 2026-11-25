import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { RESEND_EVENT_STATUS, verifyWebhookSignature } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resend delivery events -> email_deliveries.status (delivered, bounced, ...). */
export async function POST(request: NextRequest) {
  const secret = serverEnv.resendWebhookSecret;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const raw = await request.text();
  const valid = verifyWebhookSignature(
    raw,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: { type?: string; data?: { email_id?: string; bounce?: { message?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = event.type ? RESEND_EVENT_STATUS[event.type] : undefined;
  const messageId = event.data?.email_id;
  if (!status || !messageId) return NextResponse.json({ ignored: true });

  const { error } = await createAdminClient().rpc("record_email_event", {
    p_provider_message_id: messageId,
    p_status: status,
    p_error: event.data?.bounce?.message ?? null,
  });
  if (error) return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
