import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Customer quote links.
 *
 * token = base64url(HMAC-SHA256(QUOTE_LINK_SECRET, "quote-link:" + link_id))
 *
 * The database stores link_id and SHA-256(token) only, so a database leak
 * alone does not reveal working links, while staff can still re-copy a link.
 * Tokens carry 256 bits of entropy and expire with the quote.
 */
export function deriveQuoteToken(linkId: string, secret: string): string {
  return createHmac("sha256", secret).update(`quote-link:${linkId}`).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newQuoteLink(secret: string) {
  const linkId = randomUUID();
  const token = deriveQuoteToken(linkId, secret);
  return { linkId, token, tokenHash: hashToken(token) };
}

/** Rebuild a link for an existing quote; null if it was issued with another secret. */
export function recoverQuoteToken(linkId: string, storedHash: string, secret: string): string | null {
  const token = deriveQuoteToken(linkId, secret);
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? token : null;
}

/** Tokens are 43 base64url chars; reject anything else before touching the DB. */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
