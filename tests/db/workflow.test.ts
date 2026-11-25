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
const admin = user(STAFF.admin);

async function submit(payload: Record<string, unknown>, ip = "ip-" + Math.random()) {
  return as(pool, service, async (c) => {
    const { rows } = await c.query("select public.submit_quote_request($1, $2) as r", [payload, ip]);
    return rows[0].r as { reference: string; duplicate: boolean };
  });
}

async function leadIdFor(reference: string): Promise<string> {
  const { rows } = await pool.query("select id from leads where reference = $1", [reference]);
  return rows[0].id;
}

async function draftAndSend(leadId: string, carrierPay = 1000, brokerFee = 250, expiresInDays = 7) {
  const tokenHash = hex64();
  const quote = await as(pool, jordan, async (c) => {
    const { rows } = await c.query(
      `select public.save_quote_draft($1, $2, $3, current_date + 3, current_date + 7, 'Standard terms', now() + ($4 || ' days')::interval, 'internal secret note') as id`,
      [leadId, carrierPay, brokerFee, String(expiresInDays)],
    );
    const { rows: sent } = await c.query("select * from public.send_quote($1, gen_random_uuid(), $2)", [
      rows[0].id,
      tokenHash,
    ]);
    return sent[0];
  });
  return { quote, tokenHash };
}

async function publicQuote(tokenHash: string) {
  return as(pool, service, async (c) => {
    const { rows } = await c.query("select public.get_public_quote($1) as q", [tokenHash]);
    return rows[0].q;
  });
}

async function respond(tokenHash: string, action: "accept" | "decline", reason?: string) {
  return as(pool, service, async (c) => {
    const { rows } = await c.query("select public.respond_to_quote($1, $2, $3, 'iphash') as r", [
      tokenHash,
      action,
      reason ?? null,
    ]);
    return rows[0].r;
  });
}

describe("access control", () => {
  it("gives the public (anon) role no table or function access", async () => {
    await expect(as(pool, anon, (c) => c.query("select * from leads"))).rejects.toThrow(/permission denied/);
    await expect(as(pool, anon, (c) => c.query("select * from quotes"))).rejects.toThrow(/permission denied/);
    await expect(as(pool, anon, (c) => c.query("select * from customers"))).rejects.toThrow(/permission denied/);
    await expect(
      as(pool, anon, (c) => c.query("select public.submit_quote_request($1, 'x')", [webRequest()])),
    ).rejects.toThrow(/permission denied/);
    await expect(as(pool, anon, (c) => c.query("select public.get_public_quote('abc')"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("signed-in users are not staff unless an admin provisioned them", async () => {
    const { rows } = await pool.query(
      `insert into auth.users (email, raw_app_meta_data) values ('stranger@example.com', '{"provider":"email"}') returning id`,
    );
    const stranger = user(rows[0].id);
    const profile = await pool.query("select active from profiles where id = $1", [rows[0].id]);
    expect(profile.rows[0].active).toBe(false);

    const leads = await as(pool, stranger, (c) => c.query("select * from leads"));
    expect(leads.rowCount).toBe(0);
    const customers = await as(pool, stranger, (c) => c.query("select * from customers"));
    expect(customers.rowCount).toBe(0);
    await expect(
      as(pool, stranger, (c) => c.query("select public.create_staff_lead($1)", [webRequest()])),
    ).rejects.toThrow(/Staff access required/);
  });

  it("only admins change settings and team roles", async () => {
    const salesUpdate = await as(pool, jordan, (c) =>
      c.query("update app_settings set company_name = 'Hacked' where id = 1"),
    );
    expect(salesUpdate.rowCount).toBe(0);
    const salesRole = await as(pool, jordan, (c) =>
      c.query("update profiles set role = 'admin' where id = $1", [STAFF.jordan]),
    );
    expect(salesRole.rowCount).toBe(0);

    const adminUpdate = await as(pool, admin, (c) =>
      c.query("update app_settings set quote_validity_days = 10 where id = 1"),
    );
    expect(adminUpdate.rowCount).toBe(1);
    await expect(
      as(pool, admin, (c) => c.query("update profiles set role = 'sales' where id = $1", [STAFF.admin])),
    ).rejects.toThrow(/cannot change your own role/);
  });

  it("staff cannot insert bookings or edit sent quotes directly", async () => {
    await expect(
      as(pool, jordan, (c) =>
        c.query(
          `insert into bookings (lead_id, quote_id, customer_id, snapshot, total_price)
           select lead_id, id, (select customer_id from leads where id = lead_id), '{}'::jsonb, 1 from quotes limit 1`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    const res = await as(pool, jordan, (c) =>
      c.query("update quotes set broker_fee = 1 where status = 'sent'"),
    );
    expect(res.rowCount).toBe(0);
  });
});

describe("public quote request", () => {
  it("creates a lead, customer and vehicles and returns a reference", async () => {
    const payload = webRequest({
      vehicles: [
        { year: 2020, make: "Honda", model: "Pilot", operable: true },
        { year: 1985, make: "Jeep", model: "CJ-7", operable: false },
      ],
    });
    const r = await submit(payload);
    expect(r.duplicate).toBe(false);
    expect(r.reference).toMatch(/^Q-[2-9A-HJ-NP-Z]{6}$/);

    const { rows } = await pool.query(
      `select l.status, l.source, (select count(*) from lead_vehicles v where v.lead_id = l.id)::int as vehicles,
              (select actor_type from activities a where a.lead_id = l.id and kind = 'lead_created') as actor
       from leads l where reference = $1`,
      [r.reference],
    );
    expect(rows[0]).toMatchObject({ status: "new", source: "web_form", vehicles: 2, actor: "customer" });
  });

  it("returns the same reference when the same submission is retried", async () => {
    const payload = webRequest();
    const first = await submit(payload);
    const retry = await submit(payload);
    expect(retry).toEqual({ reference: first.reference, duplicate: true });
    const { rows } = await pool.query("select count(*)::int as n from leads where contact_email = $1", [
      payload.email,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it("treats the same request re-submitted within 24h (new form load) as a duplicate", async () => {
    const payload = webRequest();
    const first = await submit(payload);
    const again = await submit({ ...payload, submission_key: crypto.randomUUID(), name: "Different Name" });
    expect(again).toEqual({ reference: first.reference, duplicate: true });
  });

  it("handles concurrent double-submits of the same form without creating two leads", async () => {
    const payload = webRequest();
    const results = await Promise.all([submit(payload), submit(payload), submit(payload)]);
    const refs = new Set(results.map((r) => r.reference));
    expect(refs.size).toBe(1);
    const { rows } = await pool.query("select count(*)::int as n from leads where contact_email = $1", [
      payload.email,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it("rate limits a single IP to 5 new requests per hour", async () => {
    const ip = "rate-limit-ip";
    for (let i = 0; i < 5; i++) await submit(webRequest(), ip);
    await expect(submit(webRequest(), ip)).rejects.toThrow(/rate_limited/);
  });

  it("matches repeat customers by email without overwriting their record", async () => {
    const r = await submit(
      webRequest({ email: "TBECKER@example.com", name: "Impostor", phone: "000", pickup_zip: "85004" }),
    );
    const { rows } = await pool.query(
      `select c.name, c.phone, (select count(*)::int from leads where customer_id = c.id) as shipments
       from leads l join customers c on c.id = l.customer_id where l.reference = $1`,
      [r.reference],
    );
    expect(rows[0]).toMatchObject({ name: "Tom Becker", phone: "(602) 555-0163", shipments: 3 });
  });

  it("rejects bad data at the database level too", async () => {
    await expect(submit(webRequest({ pickup_zip: "ABCDE" }))).rejects.toThrow(/check constraint/);
    await expect(submit(webRequest({ vehicles: [] }))).rejects.toThrow(/invalid_vehicles/);
    await expect(submit(webRequest({ earliest_pickup_date: "2020-01-01" }))).rejects.toThrow(/invalid_pickup_date/);
  });
});

describe("pipeline rules", () => {
  it("only allows Booked via acceptance and Lost with a reason", async () => {
    const { reference } = await submit(webRequest());
    const id = await leadIdFor(reference);
    await expect(
      as(pool, jordan, (c) => c.query("update leads set status = 'booked' where id = $1", [id])),
    ).rejects.toThrow(/only when a quote is accepted/);
    await expect(
      as(pool, jordan, (c) => c.query("update leads set status = 'lost', lost_reason = 'x' where id = $1", [id])),
    ).rejects.toThrow(/Mark lost/);
    await expect(
      as(pool, jordan, (c) => c.query("select public.set_lead_stage($1, 'quote_sent')", [id])),
    ).rejects.toThrow(/Send a quote/);
    await expect(as(pool, jordan, (c) => c.query("select public.mark_lead_lost($1, '  ')", [id]))).rejects.toThrow(
      /reason is required/,
    );

    await as(pool, jordan, (c) => c.query("select public.set_lead_stage($1, 'contacted')", [id]));
    await as(pool, jordan, (c) => c.query("select public.mark_lead_lost($1, 'Price shopping')", [id]));
    const { rows } = await pool.query("select status, lost_reason, lost_at from leads where id = $1", [id]);
    expect(rows[0]).toMatchObject({ status: "lost", lost_reason: "Price shopping" });
    expect(rows[0].lost_at).not.toBeNull();

    await as(pool, jordan, (c) => c.query("select public.reopen_lead($1)", [id]));
    const reopened = await pool.query("select status, lost_reason from leads where id = $1", [id]);
    expect(reopened.rows[0]).toEqual({ status: "contacted", lost_reason: null });
  });
});

describe("quotes and acceptance", () => {
  it("full flow: draft, send, revise, accept once, booking created", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);

    const v1 = await draftAndSend(leadId, 1000, 250);
    expect(v1.quote).toMatchObject({ version: 1, status: "sent", total: "1250.00" });
    let lead = await pool.query("select status from leads where id = $1", [leadId]);
    expect(lead.rows[0].status).toBe("quote_sent");

    const v2 = await draftAndSend(leadId, 900, 260);
    expect(v2.quote.version).toBe(2);
    const v1Row = await pool.query("select status from quotes where id = $1", [v1.quote.id]);
    expect(v1Row.rows[0].status).toBe("superseded");

    // Old link no longer valid and reveals nothing about pricing
    const oldView = await publicQuote(v1.tokenHash);
    expect(oldView).toMatchObject({ state: "superseded" });
    expect(oldView.total).toBeUndefined();
    expect(await respond(v1.tokenHash, "accept")).toEqual({ result: "superseded" });

    const view = await publicQuote(v2.tokenHash);
    expect(view).toMatchObject({ state: "active", total: 1160, version: 2, reference });

    const first = await respond(v2.tokenHash, "accept");
    expect(first.result).toBe("accepted");
    expect(first.booking_reference).toMatch(/^B-/);

    const second = await respond(v2.tokenHash, "accept");
    expect(second.result).toBe("already_accepted");
    expect(second.booking_reference).toBe(first.booking_reference);

    const bookings = await pool.query("select count(*)::int as n, min(status::text) as status from bookings where lead_id = $1", [leadId]);
    expect(bookings.rows[0]).toEqual({ n: 1, status: "awaiting_carrier" });
    lead = await pool.query("select status from leads where id = $1", [leadId]);
    expect(lead.rows[0].status).toBe("booked");

    // can't decline after accepting
    expect((await respond(v2.tokenHash, "decline")).result).toBe("already_accepted");

    const kinds = await pool.query(
      "select kind, actor_type from activities where lead_id = $1 order by id",
      [leadId],
    );
    const entries = kinds.rows.map((r) => `${r.kind}:${r.actor_type}`);
    expect(entries).toEqual(
      expect.arrayContaining([
        "lead_created:customer",
        "quote_drafted:staff",
        "quote_sent:staff",
        "quote_superseded:staff",
        "quote_viewed:customer",
        "quote_accepted:customer",
        "stage_changed:customer",
        "booking_created:customer",
      ]),
    );
  });

  it("creates exactly one booking under concurrent acceptance", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { tokenHash } = await draftAndSend(leadId);
    const results = await Promise.all(Array.from({ length: 6 }, () => respond(tokenHash, "accept")));
    const outcomes = results.map((r) => r.result).sort();
    expect(outcomes.filter((o) => o === "accepted")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "already_accepted")).toHaveLength(5);
    expect(new Set(results.map((r) => r.booking_reference)).size).toBe(1);
    const { rows } = await pool.query("select count(*)::int as n from bookings where lead_id = $1", [leadId]);
    expect(rows[0].n).toBe(1);
  });

  it("refuses to accept or decline an expired quote", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { quote, tokenHash } = await draftAndSend(leadId);
    await pool.query("update quotes set expires_at = now() - interval '1 minute' where id = $1", [quote.id]);

    expect((await publicQuote(tokenHash)).state).toBe("expired");
    expect(await respond(tokenHash, "accept")).toEqual({ result: "expired" });
    expect(await respond(tokenHash, "decline")).toEqual({ result: "expired" });
    const { rows } = await pool.query("select count(*)::int as n from bookings where lead_id = $1", [leadId]);
    expect(rows[0].n).toBe(0);
  });

  it("will not send a draft whose expiration has passed", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    await expect(
      as(pool, jordan, (c) =>
        c.query(
          `select public.save_quote_draft($1, 100, 50, current_date, current_date + 1, 'T', now() - interval '1 hour')`,
          [leadId],
        ),
      ),
    ).rejects.toThrow(/Expiration must be in the future/);
  });

  it("records a decline with reason, after which acceptance is refused", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { tokenHash } = await draftAndSend(leadId);
    expect((await respond(tokenHash, "decline", "Found a cheaper option")).result).toBe("declined");
    expect((await respond(tokenHash, "decline")).result).toBe("already_declined");
    expect(await respond(tokenHash, "accept")).toEqual({ result: "declined" });
    const { rows } = await pool.query("select decline_reason, responded_at from quotes where token_hash = $1", [tokenHash]);
    expect(rows[0].decline_reason).toBe("Found a cheaper option");
    expect(rows[0].responded_at).not.toBeNull();
  });

  it("withdraws the customer link when a lead is marked lost", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { tokenHash } = await draftAndSend(leadId);
    await as(pool, jordan, (c) => c.query("select public.mark_lead_lost($1, 'Went with another broker')", [leadId]));
    expect((await publicQuote(tokenHash)).state).toBe("withdrawn");
    expect(await respond(tokenHash, "accept")).toEqual({ result: "withdrawn" });
  });

  it("rotating a link invalidates the old one", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { quote, tokenHash } = await draftAndSend(leadId);
    const newHash = hex64();
    await as(pool, jordan, (c) =>
      c.query("select public.rotate_quote_link($1, gen_random_uuid(), $2)", [quote.id, newHash]),
    );
    expect(await publicQuote(tokenHash)).toBeNull();
    expect((await publicQuote(newHash)).state).toBe("active");
  });

  it("never exposes carrier pay, broker fee or internal notes on the public quote", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { tokenHash } = await draftAndSend(leadId, 1234.56, 432.1);
    const view = await publicQuote(tokenHash);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/carrier|broker|internal|margin|profit/i);
    expect(json).not.toContain("1234.56");
    expect(json).not.toContain("432.1");
    expect(json).not.toContain("internal secret note");
    expect(Object.keys(view).sort()).toEqual(
      [
        "booking", "booking_reference", "company_name", "customer_name", "delivery", "expires_at", "pickup",
        "pickup_window_end", "pickup_window_start", "reference", "responded_at", "sent_at", "state",
        "terms", "total", "transport_type", "vehicles", "version",
      ].sort(),
    );
    const accepted = await respond(tokenHash, "accept");
    expect(JSON.stringify(accepted)).not.toMatch(/carrier|broker|1234|432/);
  });

  it("staff can record a phone acceptance with the same one-booking guarantee", async () => {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { quote } = await draftAndSend(leadId);
    const a = await as(pool, jordan, (c) => c.query("select public.staff_record_acceptance($1) as r", [quote.id]));
    const b = await as(pool, jordan, (c) => c.query("select public.staff_record_acceptance($1) as r", [quote.id]));
    expect(a.rows[0].r.result).toBe("accepted");
    expect(b.rows[0].r.result).toBe("already_accepted");
  });
});

describe("bookings", () => {
  it("keeps accepted terms immutable and requires a carrier before Carrier Assigned", async () => {
    const id = "d0000000-0000-4000-8000-000000000010";
    await expect(
      as(pool, jordan, (c) => c.query("update bookings set total_price = 1 where id = $1", [id])),
    ).rejects.toThrow(/cannot be edited/);
    await expect(
      as(pool, jordan, (c) => c.query("update bookings set status = 'carrier_assigned' where id = $1", [id])),
    ).rejects.toThrow(/carrier name/);

    await as(pool, jordan, (c) =>
      c.query(
        "update bookings set status = 'carrier_assigned', carrier_name = 'Acme Hauling', pickup_address = '1 Main St' where id = $1",
        [id],
      ),
    );
    const { rows } = await pool.query("select status, carrier_assigned_at from bookings where id = $1", [id]);
    expect(rows[0].status).toBe("carrier_assigned");
    expect(rows[0].carrier_assigned_at).not.toBeNull();
    const log = await pool.query(
      "select message from activities where booking_id = $1 and created_at > now() - interval '1 minute' order by id",
      [id],
    );
    expect(log.rows.map((r) => r.message)).toEqual([
      "Shipment status changed from Awaiting Carrier to Carrier Assigned",
      "Booking B-4TFW8Y updated: carrier, pickup details",
    ]);
  });
});

describe("email delivery status", () => {
  it("records provider events and never moves status backwards", async () => {
    const ev = (status: string) =>
      as(pool, service, (c) => c.query("select public.record_email_event('demo-msg-0082', $1)", [status]));
    await ev("delivered");
    await ev("delayed");
    const { rows } = await pool.query("select status from email_deliveries where provider_message_id = 'demo-msg-0082'");
    expect(rows[0].status).toBe("delivered");
    await ev("bounced");
    const after = await pool.query("select status from email_deliveries where provider_message_id = 'demo-msg-0082'");
    expect(after.rows[0].status).toBe("bounced");
  });
});

describe("customer booking portal", () => {
  async function bookedQuote() {
    const { reference } = await submit(webRequest());
    const leadId = await leadIdFor(reference);
    const { tokenHash } = await draftAndSend(leadId, 1111.11, 222.22);
    await respond(tokenHash, "accept");
    return { leadId, tokenHash };
  }
  const details = {
    pickup_address: "12 Oak St, Reno, NV 89501", pickup_contact_name: "Ana", pickup_contact_phone: "(555) 555-0101",
    delivery_address: "9 Bay Rd, Tampa, FL 33602", delivery_contact_name: "Ben", delivery_contact_phone: "(555) 555-0102",
    signed_name: "Ana Diaz", agree: true,
  };
  const submitDetails = (tokenHash: string, p: Record<string, unknown>) =>
    as(pool, service, async (c) => (await c.query("select public.submit_booking_details($1, $2, 'ip') as r", [tokenHash, p])).rows[0].r);

  it("shows the agreement after acceptance and records a one-time signature", async () => {
    const { leadId, tokenHash } = await bookedQuote();
    const before = await publicQuote(tokenHash);
    expect(before.booking).toMatchObject({ details_submitted: false, signed_name: null });
    expect(before.booking.agreement_text).toMatch(/Replace this text/);

    expect(await submitDetails(tokenHash, details)).toMatchObject({ result: "submitted" });
    expect(await submitDetails(tokenHash, { ...details, signed_name: "Someone Else" })).toMatchObject({ result: "already_submitted" });

    const { rows } = await pool.query("select * from bookings where lead_id = $1", [leadId]);
    expect(rows[0]).toMatchObject({ pickup_address: details.pickup_address, agreement_signed_name: "Ana Diaz", agreement_ip_hash: "ip" });
    expect(rows[0].agreement_text).toMatch(/Replace this text/);

    // Later edits to the template don't change what was signed
    await pool.query("update app_settings set booking_agreement_text = 'New v2 agreement' where id = 1");
    const after = await publicQuote(tokenHash);
    expect(after.booking.agreement_text).toMatch(/Replace this text/);
    expect(JSON.stringify(after)).not.toMatch(/carrier_pay|broker_fee|1111\.11|222\.22|ip_hash/);
    await pool.query("update app_settings set booking_agreement_text = default where id = 1");

    const log = await pool.query("select kind, actor_type from activities where lead_id = $1 and kind = 'agreement_signed'", [leadId]);
    expect(log.rows).toEqual([{ kind: "agreement_signed", actor_type: "customer" }]);
  });

  it("rejects incomplete submissions and quotes that aren't booked", async () => {
    const { tokenHash } = await bookedQuote();
    await expect(submitDetails(tokenHash, { ...details, agree: false })).rejects.toThrow(/agreement_not_accepted/);
    await expect(submitDetails(tokenHash, { ...details, pickup_address: " " })).rejects.toThrow(/missing_pickup_address/);
    await expect(submitDetails(tokenHash, { ...details, signed_name: "" })).rejects.toThrow(/missing_signature/);

    const { reference } = await submit(webRequest());
    const { tokenHash: active } = await draftAndSend(await leadIdFor(reference));
    expect(await submitDetails(active, details)).toEqual({ result: "not_booked" });
    expect(await submitDetails(hex64(), details)).toEqual({ result: "not_found" });
  });

  it("staff cannot forge or alter a signature", async () => {
    const id = "d0000000-0000-4000-8000-000000000011";
    await expect(
      as(pool, jordan, (c) => c.query("update bookings set agreement_signed_name = 'x', agreement_signed_at = now(), agreement_text = 'x' where id = $1", [id])),
    ).rejects.toThrow(/only be submitted by the customer/);
    await expect(
      as(pool, anon, (c) => c.query("select public.submit_booking_details('x', '{}'::jsonb)")),
    ).rejects.toThrow(/permission denied/);
  });
});
