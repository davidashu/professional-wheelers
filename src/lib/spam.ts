import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Spam protection for the public form:
 *  - a signed "form issued at" token, so bots can't skip loading the form or
 *    submit faster than a human could fill it in
 *  - a honeypot field (checked in the action)
 *  - per-IP rate limiting in the database (IP stored only as a keyed hash)
 */
export const MIN_FILL_MS = 3000;
export const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(`form:${value}`).digest("base64url");
}

export function issueFormToken(secret: string, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(ts, secret)}`;
}

export type FormTokenCheck = "ok" | "invalid" | "too_fast" | "expired";

export function checkFormToken(token: string | null | undefined, secret: string, now = Date.now()): FormTokenCheck {
  if (!token) return "invalid";
  const [ts, sig] = token.split(".");
  if (!ts || !sig || !/^\d{10,16}$/.test(ts)) return "invalid";
  const expected = Buffer.from(sign(ts, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const age = now - Number(ts);
  if (age < MIN_FILL_MS) return "too_fast";
  if (age > MAX_FORM_AGE_MS) return "expired";
  return "ok";
}

export function hashIp(ip: string | null, secret: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`ip:${secret}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim() || null;
  return headers.get("x-real-ip");
}
