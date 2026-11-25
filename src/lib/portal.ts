import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { hashToken, isWellFormedToken } from "@/lib/tokens";
import { linkForQuote } from "@/lib/quotes";
import type { PortalOverview, PortalShipment } from "@/lib/types";

/**
 * Customer portal sessions.
 *
 * Customers aren't Supabase Auth users. A random 256-bit token lives in an
 * httpOnly cookie; the database stores only its SHA-256 hash and resolves the
 * customer from it inside every portal function. Sign-in links work the same
 * way (random token, hash stored, short expiry).
 */
export const PORTAL_COOKIE = "pw_portal";
const SESSION_DAYS = 30;

/** 43-char base64url token (256 bits), same shape as quote tokens. */
export function newPortalToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function portalLoginUrl(token: string) {
  return `${serverEnv.siteUrl}/portal/auth?token=${encodeURIComponent(token)}`;
}

/** Only call from a server action or route handler (cookies are read-only in pages). */
export async function setPortalCookie(token: string) {
  const store = await cookies();
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearPortalCookie() {
  (await cookies()).delete(PORTAL_COOKIE);
}

/** Hash of the current visitor's session token, or null. */
export async function portalSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  return token && isWellFormedToken(token) ? hashToken(token) : null;
}

type RawShipment = Omit<PortalShipment, "quote"> & {
  quote: (NonNullable<PortalShipment["quote"]> & { link_id: string | null; token_hash: string | null }) | null;
};

/**
 * The signed-in customer's portal data, deduplicated per request. Quote link
 * internals (link id, token hash) are turned into a URL here and never reach
 * the browser.
 */
export const getPortal = cache(async (): Promise<PortalOverview | null> => {
  const hash = await portalSessionHash();
  if (!hash) return null;
  const { data, error } = await createAdminClient().rpc("portal_overview", { p_session_hash: hash });
  if (error) throw new Error("Couldn't load your portal. Please try again.");
  if (!data) return null;
  const raw = data as Omit<PortalOverview, "shipments"> & { shipments: RawShipment[] };
  return {
    ...raw,
    unread_messages: Number(raw.unread_messages) || 0,
    shipments: raw.shipments.map((s) => {
      if (!s.quote) return { ...s, quote: null };
      const { link_id, token_hash, ...quote } = s.quote;
      const url = quote.state === "active" || quote.state === "accepted" ? linkForQuote({ link_id, token_hash }) : null;
      return { ...s, quote: { ...quote, total: Number(quote.total), url } };
    }),
  };
});

export async function requirePortal(): Promise<PortalOverview> {
  const portal = await getPortal();
  if (!portal) redirect("/portal/login");
  return portal;
}

/** What the customer sees for each CRM stage. Internal stage names stay internal. */
export function customerStage(s: PortalShipment): { label: string; tone: "blue" | "teal" | "green" | "gray" | "amber" } {
  if (s.booking) {
    const b = { awaiting_carrier: "Booked · finding a carrier", carrier_assigned: "Carrier assigned", picked_up: "In transit", delivered: "Delivered" } as const;
    return { label: b[s.booking.status], tone: s.booking.status === "delivered" ? "gray" : "green" };
  }
  if (s.status === "lost") return { label: "Closed", tone: "gray" };
  if (s.quote?.state === "active") return { label: "Quote ready", tone: "teal" };
  if (s.quote?.state === "expired") return { label: "Quote expired", tone: "amber" };
  if (s.quote?.state === "declined") return { label: "Quote declined", tone: "gray" };
  return { label: "Preparing your quote", tone: "blue" };
}
