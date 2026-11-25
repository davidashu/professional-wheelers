import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseMoney, quoteTotals } from "@/lib/pricing";
import { deriveQuoteToken, hashToken, isWellFormedToken, newQuoteLink, recoverQuoteToken } from "@/lib/tokens";
import { MIN_FILL_MS, checkFormToken, hashIp, issueFormToken } from "@/lib/spam";
import { formDataToObject, normalizePhone, quoteDraftSchema, quoteRequestSchema, todayIso } from "@/lib/validation";
import { quoteDisplayState } from "@/lib/labels";
import { addDaysIso, formatDate } from "@/lib/format";

const SECRET = "x".repeat(40);

describe("pricing", () => {
  it("adds carrier pay and broker fee without float drift", () => {
    expect(quoteTotals({ carrierPay: 1050.1, brokerFee: 249.2 })).toEqual({ total: 1299.3, grossProfit: 249.2, marginPercent: 19.2 });
    expect(quoteTotals({ carrierPay: 0.1, brokerFee: 0.2 }).total).toBe(0.3);
    expect(quoteTotals({ carrierPay: 0, brokerFee: 0 }).marginPercent).toBe(0);
  });
  it("parses money input", () => {
    expect(parseMoney("$1,250.50")).toBe(1250.5);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("quote link tokens", () => {
  it("creates unguessable 256-bit tokens and stores only a hash", () => {
    const a = newQuoteLink(SECRET);
    const b = newQuoteLink(SECRET);
    expect(a.token).not.toBe(b.token);
    expect(isWellFormedToken(a.token)).toBe(true);
    expect(Buffer.from(a.token, "base64url")).toHaveLength(32);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).not.toContain(a.token);
    expect(hashToken(a.token)).toBe(a.tokenHash);
  });
  it("lets staff re-copy a link only with the same secret", () => {
    const l = newQuoteLink(SECRET);
    expect(recoverQuoteToken(l.linkId, l.tokenHash, SECRET)).toBe(l.token);
    expect(recoverQuoteToken(l.linkId, l.tokenHash, "y".repeat(40))).toBeNull();
    expect(recoverQuoteToken(randomUUID(), l.tokenHash, SECRET)).toBeNull();
  });
  it("rejects malformed tokens before any lookup", () => {
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(deriveQuoteToken(randomUUID(), SECRET) + "x")).toBe(false);
    expect(isWellFormedToken("../../etc/passwd/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });
});

describe("spam protection", () => {
  it("accepts a form filled at human speed", () => {
    const t = issueFormToken(SECRET, 1_700_000_000_000);
    expect(checkFormToken(t, SECRET, 1_700_000_000_000 + MIN_FILL_MS + 1)).toBe("ok");
  });
  it("rejects bots that submit instantly, forge or reuse stale tokens", () => {
    const t = issueFormToken(SECRET, 1_700_000_000_000);
    expect(checkFormToken(t, SECRET, 1_700_000_000_500)).toBe("too_fast");
    expect(checkFormToken(t, SECRET, 1_700_000_000_000 + 25 * 3600 * 1000)).toBe("expired");
    expect(checkFormToken(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), SECRET, 1_700_000_100_000)).toBe("invalid");
    expect(checkFormToken(`${Date.now() - 60_000}.forged`, SECRET)).toBe("invalid");
    expect(checkFormToken(null, SECRET)).toBe("invalid");
  });
  it("never stores raw IPs", () => {
    const h = hashIp("203.0.113.9", SECRET)!;
    expect(h).not.toContain("203.0.113.9");
    expect(hashIp("203.0.113.9", SECRET)).toBe(h);
    expect(hashIp(null, SECRET)).toBeNull();
  });
});

describe("quote request validation", () => {
  const base = {
    submission_key: randomUUID(), name: "Ana Diaz", email: "Ana@Example.com ", phone: "(555) 123-4567", company: "",
    pickup_city: "Reno", pickup_state: "nv", pickup_zip: "89501", delivery_city: "Tampa", delivery_state: "FL",
    delivery_zip: "33602", earliest_pickup_date: addDaysIso(todayIso(), 3), pickup_date_flexible: "yes",
    transport_type: "open", special_instructions: "",
    vehicles: [{ year: "2020", make: "Honda", model: "Pilot", operable: "yes" }],
  };
  it("normalizes valid input", () => {
    const r = quoteRequestSchema.parse(base);
    expect(r.email).toBe("ana@example.com");
    expect(r.pickup_state).toBe("NV");
    expect(r.vehicles[0]).toEqual({ year: 2020, make: "Honda", model: "Pilot", operable: true });
    expect(r.pickup_date_flexible).toBe(true);
  });
  it("reports field-level errors", () => {
    const r = quoteRequestSchema.safeParse({
      ...base, email: "nope", phone: "123", pickup_zip: "1234", pickup_state: "ZZ",
      earliest_pickup_date: "2020-01-01", vehicles: [{ year: "1800", make: "", model: "X", operable: "yes" }],
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["email", "phone", "pickup_zip", "pickup_state", "earliest_pickup_date", "vehicles.0.year", "vehicles.0.make"]));
  });
  it("requires at least one vehicle and caps at ten", () => {
    expect(quoteRequestSchema.safeParse({ ...base, vehicles: [] }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...base, vehicles: Array(11).fill(base.vehicles[0]) }).success).toBe(false);
  });
  it("parses multi-vehicle form data", () => {
    const fd = new FormData();
    fd.set("name", "A");
    fd.set("vehicles.1.make", "Ford");
    fd.set("vehicles.0.make", "Kia");
    fd.set("vehicles.10.make", "BMW");
    const o = formDataToObject(fd) as { vehicles: Array<{ make: string }> };
    expect(o.vehicles.map((v) => v.make)).toEqual(["Kia", "Ford", "BMW"]);
  });
  it("formats phone numbers", () => {
    expect(normalizePhone("1-555-123-4567")).toBe("(555) 123-4567");
    expect(normalizePhone("555.123.4567")).toBe("(555) 123-4567");
  });
});

describe("quote drafts", () => {
  const draft = {
    lead_id: randomUUID(), carrier_pay: "1000", broker_fee: "250", pickup_window_start: "2030-01-05",
    pickup_window_end: "2030-01-08", expires_on: addDaysIso(todayIso(), 7), terms: "T", internal_note: "",
  };
  it("validates windows, expiry and totals", () => {
    expect(quoteDraftSchema.safeParse(draft).success).toBe(true);
    expect(quoteDraftSchema.safeParse({ ...draft, pickup_window_end: "2030-01-01" }).success).toBe(false);
    expect(quoteDraftSchema.safeParse({ ...draft, expires_on: "2020-01-01" }).success).toBe(false);
    expect(quoteDraftSchema.safeParse({ ...draft, carrier_pay: "0", broker_fee: "0" }).success).toBe(false);
    expect(quoteDraftSchema.safeParse({ ...draft, carrier_pay: "-1" }).success).toBe(false);
  });
});

describe("labels and formatting", () => {
  it("derives expired from expires_at", () => {
    expect(quoteDisplayState({ status: "sent", expires_at: new Date(Date.now() - 1000).toISOString() })).toBe("expired");
    expect(quoteDisplayState({ status: "sent", expires_at: new Date(Date.now() + 60000).toISOString() })).toBe("sent");
    expect(quoteDisplayState({ status: "accepted", expires_at: new Date(0).toISOString() })).toBe("accepted");
  });
  it("does not shift calendar dates across time zones", () => {
    expect(formatDate("2026-03-01")).toBe("Mar 1, 2026");
    expect(addDaysIso("2026-02-27", 2)).toBe("2026-03-01");
  });
});

describe("email webhook signatures", async () => {
  const { verifyWebhookSignature } = await import("@/lib/email");
  const secretBytes = Buffer.from("webhook-secret-bytes-123456");
  const secret = "whsec_" + secretBytes.toString("base64");
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secretBytes).update(`msg_1.${ts}.${body}`).digest("base64");

  it("accepts a valid signature and rejects tampering or replay", () => {
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret)).toBe(true);
    expect(verifyWebhookSignature(body + " ", { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret)).toBe(false);
    expect(verifyWebhookSignature(body, { id: "msg_2", timestamp: ts, signature: `v1,${sig}` }, secret)).toBe(false);
    const old = String(Number(ts) - 3600);
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: old, signature: `v1,${sig}` }, secret)).toBe(false);
    expect(verifyWebhookSignature(body, { id: null, timestamp: ts, signature: `v1,${sig}` }, secret)).toBe(false);
  });
});

describe("quote email sending", async () => {
  const { sendQuoteEmail, quoteEmailContent } = await import("@/lib/email");
  const input = {
    to: "a@example.com", customerName: "Ana Diaz", companyName: "Co", reference: "Q-ABCDEF", version: 2, total: 1500,
    routeText: "Reno, NV to Tampa, FL", pickupWindowStart: "2030-01-01", pickupWindowEnd: "2030-01-03",
    expiresAt: "2030-01-05T07:59:59.000Z", link: "https://x.test/q/token", idempotencyKey: "k1",
  };

  it("never includes internal pricing in the email", () => {
    const { subject, text, html } = quoteEmailContent(input);
    expect(subject).toBe("Your revised vehicle shipping quote Q-ABCDEF");
    expect(text + html).toContain("$1,500.00");
    expect(text + html).not.toMatch(/carrier pay|broker fee|profit/i);
  });

  it("reports provider success with the message id, and failures with the reason", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Quotes <quotes@example.com>";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }));
    expect(await sendQuoteEmail(input)).toEqual({ ok: true, id: "msg_123" });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init!.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 }));
    expect(await sendQuoteEmail(input)).toEqual({ ok: false, error: "Domain not verified" });

    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sendQuoteEmail(input)).toEqual({ ok: false, error: "ECONNRESET" });

    delete process.env.RESEND_API_KEY;
    expect(await sendQuoteEmail(input)).toEqual({ ok: false, error: "Email provider is not configured" });
    fetchMock.mockRestore();
  });
});
