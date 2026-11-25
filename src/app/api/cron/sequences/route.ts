import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Monthly profit-drop check (see vercel.json). Vercel Cron sends
 * "Authorization: Bearer $CRON_SECRET". Creates at most one call task per
 * customer for the last complete month, so repeat calls are harmless.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("run_profit_sequences");
  if (error) {
    console.error("run_profit_sequences failed", error);
    return NextResponse.json({ error: "Sequence run failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}
