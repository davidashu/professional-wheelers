import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { STAFF, anon, as, createTestDatabase, hex64, service, user, webRequest } from "./harness";

let pool: pg.Pool;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ pool, drop } = await createTestDatabase());
});
afterAll(async () => {
  await drop?.();
});

const jordan = user(STAFF.jordan);

async function svc<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  return as(pool, service, async (c) => (await c.query(sql, params)).rows[0]?.r as T);
}

/** Creates a web lead for a fresh customer, prices and sends a quote. */
async function customerWithQuote(carrierPay = 987.65, brokerFee = 312.34) {
  const req = webRequest();
  const sub = await svc<{ reference: string }>("select public.submit_quote_request($1, $2) as r", [req, "ip-" + Math.random()]);
  const { rows } = await pool.query("select id, customer_id from leads where reference = $1", [sub.reference]);
  const leadId: string = rows[0].id;
  const customerId: string = rows[0].customer_id;
  const quoteTokenHash = hex64();
  const quoteId = await as(pool, jordan, async (c) => {
    const { rows: d } = await c.query(
      `select public.save_quote_draft($1, $2, $3, current_date + 3, current_date + 7, 'Standard terms', now() + interval '7 days', 'INTERNAL-NOTE-XYZ') as id`,
      [leadId, carrierPay, brokerFee],
    );
    await c.query("select public.send_quote($1, gen_random_uuid(), $2)", [d[0].id, quoteTokenHash]);
    return d[0].id as string;
  });
  return { email: req.email as string, reference: sub.reference, leadId, customerId, quoteTokenHash, quoteId };
}

async function emailSession(email: string) {
  const login = hex64();
  const session = hex64();
  const req = await svc<{ result: string }>("select public.portal_request_login($1, $2, $3) as r", [email, login, "ip-" + Math.random()]);
  expect(req.result).toBe("ok");
  const red = await svc<{ result: string }>("select public.portal_redeem_login($1, $2) as r", [login, session]);
  expect(red.result).toBe("ok");
  return { login, session };
}

describe("portal access control", () => {
  it("anon and signed-in users can't call portal functions or read portal tables", async () => {
    for (const actor of [anon, jordan]) {
      await expect(as(pool, actor, (c) => c.query("select public.portal_overview($1)", [hex64()]))).rejects.toThrow(/permission denied/);
      await expect(as(pool, actor, (c) => c.query("select public.portal_request_login('a@b.co', $1, 'x')", [hex64()]))).rejects.toThrow(/permission denied/);
      await expect(as(pool, actor, (c) => c.query("select * from portal_sessions"))).rejects.toThrow(/permission denied/);
      await expect(as(pool, actor, (c) => c.query("select * from portal_login_tokens"))).rejects.toThrow(/permission denied/);
    }
    await expect(as(pool, anon, (c) => c.query("select * from messages"))).rejects.toThrow(/permission denied/);
  });

  it("only active staff can create a staff sign-in link", async () => {
    const { customerId } = await customerWithQuote();
    const { rows } = await pool.query(
      `insert into auth.users (email, raw_app_meta_data) values ('outsider@example.com', '{"provider":"email"}') returning id`,
    );
    await expect(
      as(pool, user(rows[0].id), (c) => c.query("select public.create_portal_invite($1, $2)", [customerId, hex64()])),
    ).rejects.toThrow(/Only staff/);
    const expires = await as(pool, jordan, async (c) => (await c.query("select public.create_portal_invite($1, $2) as e", [customerId, hex64()])).rows[0].e);
    expect(new Date(expires).getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
  });
});

describe("portal sign-in", () => {
  it("does not issue a link for an unknown email", async () => {
    const r = await svc<{ result: string }>("select public.portal_request_login('nobody@example.com', $1, 'ip-u') as r", [hex64()]);
    expect(r.result).toBe("unknown");
  });

  it("email links work once, are case-insensitive and expire", async () => {
    const { email } = await customerWithQuote();
    const { login } = await emailSession(email.toUpperCase());
    const again = await svc<{ result: string }>("select public.portal_redeem_login($1, $2) as r", [login, hex64()]);
    expect(again.result).toBe("used");

    const late = hex64();
    await svc("select public.portal_request_login($1, $2, 'ip-late') as r", [email, late]);
    await pool.query("update portal_login_tokens set expires_at = now() - interval '1 minute' where token_hash = $1", [late]);
    expect((await svc<{ result: string }>("select public.portal_redeem_login($1, $2) as r", [late, hex64()])).result).toBe("expired");
    expect((await svc<{ result: string }>("select public.portal_redeem_login($1, $2) as r", [hex64(), hex64()])).result).toBe("invalid");
  });

  it("rate-limits sign-in emails per customer", async () => {
    const { email } = await customerWithQuote();
    const results: string[] = [];
    for (let i = 0; i < 7; i++) {
      results.push((await svc<{ result: string }>("select public.portal_request_login($1, $2, $3) as r", [email, hex64(), `ip-rl-${i}`])).result);
    }
    expect(results.slice(0, 5).every((r) => r === "ok")).toBe(true);
    expect(results[6]).toBe("rate_limited");
  });

  it("staff sign-in links can be reused until they expire", async () => {
    const { customerId } = await customerWithQuote();
    const invite = hex64();
    await as(pool, jordan, (c) => c.query("select public.create_portal_invite($1, $2)", [customerId, invite]));
    expect((await svc<{ result: string }>("select public.portal_redeem_login($1, $2) as r", [invite, hex64()])).result).toBe("ok");
    expect((await svc<{ result: string }>("select public.portal_redeem_login($1, $2) as r", [invite, hex64()])).result).toBe("ok");
  });

  it("opens the portal from a live quote link but not a replaced one", async () => {
    const c = await customerWithQuote();
    const s = hex64();
    expect((await svc<{ result: string }>("select public.portal_session_from_quote($1, $2) as r", [c.quoteTokenHash, s])).result).toBe("ok");
    expect(await svc("select public.portal_overview($1) as r", [s])).not.toBeNull();

    await as(pool, jordan, (cl) => cl.query("select public.withdraw_quote($1)", [c.quoteId]));
    expect((await svc<{ result: string }>("select public.portal_session_from_quote($1, $2) as r", [c.quoteTokenHash, hex64()])).result).toBe("invalid");
  });

  it("sign-out ends the session", async () => {
    const { email } = await customerWithQuote();
    const { session } = await emailSession(email);
    await svc("select public.portal_sign_out($1) as r", [session]);
    expect(await svc("select public.portal_overview($1) as r", [session])).toBeNull();
    expect((await svc<{ result: string }>("select public.portal_send_message($1, 'hi') as r", [session])).result).toBe("signed_out");
  });

  it("rejects malformed and unknown session tokens", async () => {
    expect(await svc("select public.portal_overview('nope') as r")).toBeNull();
    expect(await svc("select public.portal_overview($1) as r", [hex64()])).toBeNull();
    expect(await svc("select public.portal_messages($1) as r", [hex64()])).toBeNull();
  });
});

describe("portal data", () => {
  it("shows a customer only their own shipments, without internal pricing", async () => {
    const a = await customerWithQuote(987.65, 312.34);
    const b = await customerWithQuote();
    const { session } = await emailSession(a.email);
    const overview = await svc<{ shipments: Array<{ reference: string; quote: { total: number; state: string } }> }>(
      "select public.portal_overview($1) as r",
      [session],
    );
    expect(overview.shipments.map((s) => s.reference)).toEqual([a.reference]);
    expect(overview.shipments[0]!.quote.state).toBe("active");
    expect(Number(overview.shipments[0]!.quote.total)).toBeCloseTo(1299.99);

    const raw = JSON.stringify(overview);
    expect(raw).not.toContain(b.reference);
    expect(raw).not.toMatch(/987\.65|312\.34|carrier_pay|broker_fee|INTERNAL-NOTE-XYZ|internal_note|lost_reason/);
  });

  it("shows the booking after the customer accepts", async () => {
    const c = await customerWithQuote();
    await svc("select public.respond_to_quote($1, 'accept', null, 'ip') as r", [c.quoteTokenHash]);
    const { session } = await emailSession(c.email);
    const overview = await svc<{ shipments: Array<{ status: string; booking: { status: string; reference: string } }> }>(
      "select public.portal_overview($1) as r",
      [session],
    );
    expect(overview.shipments[0]!.status).toBe("booked");
    expect(overview.shipments[0]!.booking.status).toBe("awaiting_carrier");
    expect(overview.shipments[0]!.booking.reference).toMatch(/^B-/);
  });
});

describe("messages", () => {
  it("customer and staff can message each other, with read tracking", async () => {
    const c = await customerWithQuote();
    const { session } = await emailSession(c.email);

    const sent = await svc<{ result: string }>("select public.portal_send_message($1, $2, $3) as r", [session, "When will a carrier pick up?", c.reference]);
    expect(sent.result).toBe("sent");

    // staff see it, tagged to the shipment, unread
    const inbox = await as(pool, jordan, async (cl) => (await cl.query("select * from public.message_inbox(50) where customer_id = $1", [c.customerId])).rows);
    expect(inbox[0].unread).toBe("1");
    const msg = await as(pool, jordan, async (cl) => (await cl.query("select * from messages where customer_id = $1", [c.customerId])).rows[0]);
    expect(msg.lead_id).toBe(c.leadId);
    expect(msg.sender_type).toBe("customer");

    await as(pool, jordan, (cl) => cl.query("select public.mark_customer_messages_read($1)", [c.customerId]));
    await as(pool, jordan, (cl) =>
      cl.query("insert into messages (customer_id, lead_id, sender_type, sender_id, body) values ($1, $2, 'staff', $3, 'Tomorrow morning.')", [
        c.customerId,
        c.leadId,
        STAFF.jordan,
      ]),
    );

    const overview = await svc<{ unread_messages: number }>("select public.portal_overview($1) as r", [session]);
    expect(Number(overview.unread_messages)).toBe(1);
    const thread = await svc<Array<{ from: string; body: string; staff_name: string | null; read_at: string | null }>>(
      "select public.portal_messages($1) as r",
      [session],
    );
    expect(thread.map((m) => m.from)).toEqual(["customer", "staff"]);
    expect(thread[0]!.read_at).not.toBeNull(); // staff read it
    expect(thread[1]!.staff_name).toBe("Jordan");
    expect(Number((await svc<{ unread_messages: number }>("select public.portal_overview($1) as r", [session])).unread_messages)).toBe(0);
  });

  it("keeps each customer's conversation private", async () => {
    const a = await customerWithQuote();
    const b = await customerWithQuote();
    const sa = (await emailSession(a.email)).session;
    const sb = (await emailSession(b.email)).session;
    await svc("select public.portal_send_message($1, 'secret from A') as r", [sa]);
    // B can't tag A's shipment: the reference is ignored
    await svc("select public.portal_send_message($1, 'from B', $2) as r", [sb, a.reference]);
    const bThread = await svc<Array<{ body: string; reference: string | null }>>("select public.portal_messages($1) as r", [sb]);
    expect(bThread.map((m) => m.body)).toEqual(["from B"]);
    expect(bThread[0]!.reference).toBeNull();
  });

  it("staff can't impersonate customers, other staff, or edit messages", async () => {
    const c = await customerWithQuote();
    const other = await customerWithQuote();
    await expect(
      as(pool, jordan, (cl) => cl.query("insert into messages (customer_id, sender_type, body) values ($1, 'customer', 'fake')", [c.customerId])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(pool, jordan, (cl) =>
        cl.query("insert into messages (customer_id, sender_type, sender_id, body) values ($1, 'staff', $2, 'x')", [c.customerId, STAFF.casey]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(pool, jordan, (cl) =>
        cl.query("insert into messages (customer_id, lead_id, sender_type, sender_id, body) values ($1, $2, 'staff', $3, 'x')", [
          c.customerId,
          other.leadId,
          STAFF.jordan,
        ]),
      ),
    ).rejects.toThrow(/different customer/);

    const { session } = await emailSession(c.email);
    await svc("select public.portal_send_message($1, 'original') as r", [session]);
    await expect(
      as(pool, jordan, (cl) => cl.query("update messages set body = 'changed' where customer_id = $1", [c.customerId])),
    ).rejects.toThrow(/cannot be edited/);
  });

  it("rejects empty and oversized messages", async () => {
    const c = await customerWithQuote();
    const { session } = await emailSession(c.email);
    expect((await svc<{ result: string }>("select public.portal_send_message($1, '   ') as r", [session])).result).toBe("invalid");
    expect((await svc<{ result: string }>("select public.portal_send_message($1, $2) as r", [session, "x".repeat(4001)])).result).toBe("invalid");
  });
});
