import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { STAFF, as, createTestDatabase, hex64, service, user, webRequest } from "./harness";

let pool: pg.Pool;
let drop: () => Promise<void>;

const admin = user(STAFF.admin);
const jordan = user(STAFF.jordan);
const casey = user(STAFF.casey);

let dispatchId: string;
let dispatch2Id: string;
let customerA: string; // owned by jordan
let customerB: string; // owned by casey
let portalUserA: string;
let carrierOk: string;
let carrierBad: string;

async function makeUser(email: string, meta: Record<string, unknown>) {
  const { rows } = await pool.query(
    `insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, '{"full_name":"T"}') returning id`,
    [email, JSON.stringify({ provider: "email", ...meta })],
  );
  return rows[0].id as string;
}

async function makeCustomer(name: string, rep: string | null) {
  const { rows } = await pool.query(
    "insert into customers (name, company, sales_rep_id, notes) values ($1, $1, $2, 'internal note') returning id",
    [name, rep],
  );
  return rows[0].id as string;
}

/** Insert a load as superuser (no RLS) with a given profit month. */
async function seedLoad(customerId: string, month: string, customerRate: number, carrierRate: number, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    customer_id: customerId, customer_rate: customerRate, carrier_rate: carrierRate,
    pickup_date: `${month}-15`, customer_status: "confirmed", ...extra,
  };
  const cols = Object.keys(row);
  const vals = Object.values(row);
  const { rows } = await pool.query(
    `insert into loads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id, load_number, profit`,
    vals,
  );
  return rows[0] as { id: string; load_number: string; profit: string };
}

beforeAll(async () => {
  ({ pool, drop } = await createTestDatabase());
  dispatchId = await makeUser("dispatch@example.com", { role: "dispatch" });
  dispatch2Id = await makeUser("dispatch2@example.com", { role: "dispatch" });
  customerA = await makeCustomer("Garff Group", STAFF.jordan);
  customerB = await makeCustomer("Other Dealer", STAFF.casey);
  portalUserA = await makeUser("store@garff.example.com", { role: "customer", customer_id: customerA });
  const c1 = await pool.query("insert into carriers (name, mc_number, standing) values ('Good Carrier', '111111', 'active') returning id");
  const c2 = await pool.query("insert into carriers (name, mc_number, standing, standing_reason) values ('Bad Carrier', '222222', 'do_not_use', 'claims') returning id");
  carrierOk = c1.rows[0].id;
  carrierBad = c2.rows[0].id;
});
afterAll(async () => {
  await drop?.();
});

describe("roles", () => {
  it("provisions dispatch and customer logins from app_metadata", async () => {
    const { rows } = await pool.query("select id, role, active, customer_id from profiles where id = any($1)", [
      [dispatchId, portalUserA],
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[dispatchId]).toMatchObject({ role: "dispatch", active: true, customer_id: null });
    expect(byId[portalUserA]).toMatchObject({ role: "customer", active: true, customer_id: customerA });
  });

  it("a customer login without a company gets no access", async () => {
    const id = await makeUser("nocompany@example.com", { role: "customer" });
    const { rows } = await pool.query("select role, active from profiles where id = $1", [id]);
    expect(rows[0].active).toBe(false);
  });

  it("dispatch and customers can't see CRM leads or customers", async () => {
    for (const actor of [user(dispatchId), user(portalUserA)]) {
      const leads = await as(pool, actor, (c) => c.query("select id from leads"));
      expect(leads.rowCount).toBe(0);
    }
    const custs = await as(pool, user(portalUserA), (c) => c.query("select id from customers"));
    expect(custs.rowCount).toBe(0);
    const portal = await as(pool, user(portalUserA), (c) => c.query("select * from portal_customer()"));
    expect(portal.rows).toHaveLength(1);
    expect(portal.rows[0]).not.toHaveProperty("notes");
  });

  it("sales see only their own customers (plus unassigned ones)", async () => {
    const unassigned = await makeCustomer("Walk-in", null);
    const seen = await as(pool, jordan, (c) => c.query("select id from customers where id = any($1)", [[customerA, customerB, unassigned]]));
    const ids = seen.rows.map((r) => r.id);
    expect(ids).toContain(customerA);
    expect(ids).toContain(unassigned);
    expect(ids).not.toContain(customerB);
  });

  it("sales can claim an unassigned customer but only admins reassign", async () => {
    const walkin = await makeCustomer("Claim Me", null);
    const claimed = await as(pool, jordan, (c) => c.query("update customers set sales_rep_id = $1 where id = $2", [STAFF.jordan, walkin]));
    expect(claimed.rowCount).toBe(1);
    await expect(
      as(pool, jordan, (c) => c.query("update customers set sales_rep_id = $1 where id = $2", [STAFF.casey, walkin])),
    ).rejects.toThrow(/Only an admin/);
    const byAdmin = await as(pool, admin, (c) => c.query("update customers set sales_rep_id = $1 where id = $2", [STAFF.casey, walkin]));
    expect(byAdmin.rowCount).toBe(1);
  });
});

describe("loads and the two status bars", () => {
  it("sales create loads for their customers; profit includes quick-pay fee and adjustments", async () => {
    const load = await as(pool, jordan, async (c) => {
      const { rows } = await c.query(
        `insert into loads (customer_id, customer_rate, carrier_rate, quick_pay_pct, adjustments, origin_city, origin_state, dest_city, dest_state)
         values ($1, 800, 650, 5, -100, 'Longmont', 'CO', 'Orem', 'UT') returning *`,
        [customerA],
      );
      return rows[0];
    });
    expect(load.load_number).toMatch(/^PW6001\d\d$/);
    expect(Number(load.quick_pay_fee)).toBe(32.5);
    expect(Number(load.profit)).toBe(800 - 650 + 32.5 - 100);
    expect(load.customer_status).toBe("confirmed");
    expect(load.carrier_status).toBe("not_assigned");

    await expect(
      as(pool, jordan, (c) => c.query("insert into loads (customer_id, customer_rate) values ($1, 100)", [customerB])),
    ).rejects.toThrow(/row-level security/);
  });

  it("requires a carrier before dispatching and refuses Do-not-use carriers", async () => {
    const load = await seedLoad(customerA, "2026-10", 1000, 800);
    await expect(
      as(pool, admin, (c) => c.query("update loads set customer_status = 'dispatched' where id = $1", [load.id])),
    ).rejects.toThrow(/Assign a carrier/);
    await expect(
      as(pool, admin, (c) => c.query("update loads set carrier_id = $1 where id = $2", [carrierBad, load.id])),
    ).rejects.toThrow(/Do not use/);

    const { rows } = await as(pool, admin, (c) =>
      c.query("update loads set carrier_id = $1 where id = $2 returning carrier_status", [carrierOk, load.id]),
    );
    expect(rows[0].carrier_status).toBe("assigned");

    const moved = await as(pool, admin, (c) =>
      c.query(
        "update loads set customer_status = 'delivered', carrier_status = 'delivered' where id = $1 returning picked_up_at, delivered_at",
        [load.id],
      ),
    );
    expect(moved.rows[0].picked_up_at).not.toBeNull();
    expect(moved.rows[0].delivered_at).not.toBeNull();

    await expect(
      as(pool, admin, (c) => c.query("update loads set carrier_status = 'issue' where id = $1", [load.id])),
    ).rejects.toThrow(/loads_issue_note/);
    await expect(
      as(pool, admin, (c) => c.query("update loads set customer_status = 'cancelled' where id = $1", [load.id])),
    ).rejects.toThrow(/loads_cancel_reason/);

    const log = await pool.query("select kind, message from activities where load_id = $1 order by id", [load.id]);
    const kinds = log.rows.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["load_created", "carrier_changed", "customer_status", "carrier_status"]));
  });

  it("dispatch sees and works only loads assigned to them, without touching customer money", async () => {
    const mine = await seedLoad(customerA, "2026-10", 1200, 900, { dispatcher_id: dispatchId });
    const theirs = await seedLoad(customerB, "2026-10", 1200, 900, { dispatcher_id: dispatch2Id });
    const d = user(dispatchId);
    const seen = await as(pool, d, (c) => c.query("select id from loads"));
    expect(seen.rows.map((r) => r.id)).toEqual([mine.id]);

    const upd = await as(pool, d, (c) =>
      c.query("update loads set carrier_id = $1, carrier_rate = 850 where id = $2", [carrierOk, mine.id]),
    );
    expect(upd.rowCount).toBe(1);
    const other = await as(pool, d, (c) => c.query("update loads set carrier_rate = 1 where id = $1", [theirs.id]));
    expect(other.rowCount).toBe(0);
    await expect(
      as(pool, d, (c) => c.query("update loads set customer_rate = 5000 where id = $1", [mine.id])),
    ).rejects.toThrow(/Dispatch can't change/);

    const custs = await as(pool, d, (c) => c.query("select id from customers"));
    expect(custs.rows.map((r) => r.id)).toEqual([customerA]);
    const carriers = await as(pool, d, (c) => c.query("select id from carriers"));
    expect(carriers.rowCount).toBeGreaterThanOrEqual(2);
  });

  it("sales don't see other reps' loads", async () => {
    const other = await seedLoad(customerB, "2026-10", 500, 400);
    const seen = await as(pool, jordan, (c) => c.query("select id from loads where id = $1", [other.id]));
    expect(seen.rowCount).toBe(0);
    const seenByCasey = await as(pool, casey, (c) => c.query("select id from loads where id = $1", [other.id]));
    expect(seenByCasey.rowCount).toBe(1);
  });
});

describe("quote orders posted by staff", () => {
  it("sales post a quote order for a phone customer and record a Too low answer", async () => {
    const order = await as(pool, jordan, async (c) => {
      const { rows } = await c.query(
        `insert into lane_requests (customer_id, origin_city, origin_state, dest_city, dest_state, description)
         values ($1, 'Phoenix', 'AZ', 'Orem', 'UT', '2 sedans') returning *`,
        [customerA],
      );
      return rows[0];
    });
    await as(pool, jordan, (c) => c.query("select quote_lane_request($1, 600)", [order.id]));
    const r = await as(pool, jordan, async (c) =>
      (await c.query("select * from staff_respond_quote_order($1, 'too_low', 'Customer surprised, expected ~$900')", [order.id])).rows[0],
    );
    expect(r.status).toBe("too_low");
    await expect(
      as(pool, casey, (c) => c.query("select staff_respond_quote_order($1, 'cancelled')", [order.id])),
    ).rejects.toThrow(/Not allowed/);
  });
});

describe("customer status bar", () => {
  it("issue statuses need a note and in-transit statuses need a carrier", async () => {
    const load = await seedLoad(customerA, "2026-10", 900, 700);
    await expect(
      as(pool, admin, (c) => c.query("update loads set customer_status = 'running_late' where id = $1", [load.id])),
    ).rejects.toThrow(/Assign a carrier/);
    await as(pool, admin, (c) => c.query("update loads set carrier_id = $1, customer_status = 'running_late' where id = $2", [carrierOk, load.id]));
    await expect(
      as(pool, admin, (c) => c.query("update loads set customer_status = 'pod_issue' where id = $1", [load.id])),
    ).rejects.toThrow(/loads_issue_note/);
    const { rows } = await as(pool, admin, (c) =>
      c.query("update loads set customer_status = 'pod_issue', issue_note = 'POD unsigned' where id = $1 returning picked_up_at, delivered_at", [load.id]),
    );
    expect(rows[0].picked_up_at).not.toBeNull();
    expect(rows[0].delivered_at).not.toBeNull();
  });
});

describe("invoices", () => {
  it("issuing and paying an invoice moves the customer status bar", async () => {
    const load = await seedLoad(customerA, "2026-10", 1500, 1200, { carrier_id: carrierOk, customer_status: "delivered" });
    const inv = await as(pool, jordan, async (c) => {
      const { rows } = await c.query(
        "insert into invoices (load_id, customer_id, amount, due_on) values ($1, $2, 1500, current_date + 15) returning *",
        [load.id, customerA],
      );
      return rows[0];
    });
    expect(inv.invoice_number).toMatch(/^INV-\d+$/);
    let st = await pool.query("select customer_status from loads where id = $1", [load.id]);
    expect(st.rows[0].customer_status).toBe("invoiced");

    await expect(
      as(pool, jordan, (c) =>
        c.query("insert into invoices (load_id, customer_id, amount) values ($1, $2, 1)", [load.id, customerA]),
      ),
    ).rejects.toThrow(/invoices_one_live_per_load|already exists/);

    await as(pool, jordan, (c) => c.query("update invoices set status = 'paid', paid_on = current_date where id = $1", [inv.id]));
    st = await pool.query("select customer_status from loads where id = $1", [load.id]);
    expect(st.rows[0].customer_status).toBe("customer_paid");

    const portal = await as(pool, user(portalUserA), (c) => c.query("select invoice_number from invoices"));
    expect(portal.rows.map((r) => r.invoice_number)).toContain(inv.invoice_number);
  });
});

describe("customer portal", () => {
  it("shows the customer's loads without carrier pay or profit, and nothing from other customers", async () => {
    await seedLoad(customerB, "2026-10", 999, 100);
    const rows = await as(pool, user(portalUserA), async (c) => (await c.query("select * from portal_loads()")).rows);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r).not.toHaveProperty("carrier_rate");
      expect(r).not.toHaveProperty("profit");
      expect(r).not.toHaveProperty("internal_notes");
      expect(Number(r.customer_rate)).not.toBe(999);
    }
    const direct = await as(pool, user(portalUserA), (c) => c.query("select * from loads"));
    expect(direct.rowCount).toBe(0);
    await expect(as(pool, jordan, (c) => c.query("select * from portal_loads()"))).resolves.toMatchObject({ rowCount: 0 });
  });

  it("quote order → quoted → too high → re-quoted → approved creates a confirmed load", async () => {
    const req = await as(pool, user(portalUserA), async (c) => {
      const { rows } = await c.query("select * from portal_request_lane($1)", [
        { origin_city: "Seattle", origin_state: "wa", dest_city: "American Fork", dest_state: "UT", description: "2024 Kia EV6", equipment: "open_car" },
      ]);
      return rows[0];
    });
    expect(req.status).toBe("new");
    expect(req.origin_state).toBe("WA");

    const respond = (r: string, target?: number) =>
      as(pool, user(portalUserA), async (c) =>
        (await c.query("select * from portal_respond_lane($1, $2, 'note', $3)", [req.id, r, target ?? null])).rows[0],
      );
    await expect(respond("approved")).rejects.toThrow(/no open price/);

    await as(pool, jordan, (c) => c.query("select * from quote_lane_request($1, 1250, 'Open carrier, 3-5 days')", [req.id]));
    const tooHigh = await respond("too_high", 800);
    expect(tooHigh).toMatchObject({ status: "too_high" });
    expect(Number(tooHigh.target_rate)).toBe(800);
    const noLoad = await pool.query("select count(*) from loads where lane_request_id = $1", [req.id]);
    expect(Number(noLoad.rows[0].count)).toBe(0);

    await as(pool, jordan, (c) => c.query("select * from quote_lane_request($1, 1100, null)", [req.id]));
    const accepted = await respond("approved");
    expect(accepted.status).toBe("approved");
    const again = await respond("approved");
    expect(again.load_id).toBe(accepted.load_id);

    const load = await pool.query("select customer_id, sales_rep_id, customer_rate, customer_status from loads where id = $1", [accepted.load_id]);
    expect(load.rows[0]).toMatchObject({ customer_id: customerA, sales_rep_id: STAFF.jordan, customer_status: "confirmed" });
    expect(Number(load.rows[0].customer_rate)).toBe(1100);

    const otherCustomerUser = await makeUser("store@other.example.com", { role: "customer", customer_id: customerB });
    await expect(
      as(pool, user(otherCustomerUser), (c) => c.query("select * from portal_respond_lane($1, 'cancelled')", [req.id])),
    ).rejects.toThrow(/not found/);
  });
});

describe("tasks", () => {
  it("can be assigned to a person or a position, and claimed", async () => {
    const t = await as(pool, admin, async (c) => {
      const { rows } = await c.query(
        "insert into tasks (title, assigned_role, customer_id, created_by) values ('Call about December lanes', 'sales', $1, $2) returning id",
        [customerA, STAFF.admin],
      );
      return rows[0].id as string;
    });
    // Both sales reps see an unclaimed sales-position task.
    for (const rep of [jordan, casey]) {
      const seen = await as(pool, rep, (c) => c.query("select id from tasks where id = $1", [t]));
      expect(seen.rowCount).toBe(1);
    }
    const d = await as(pool, user(dispatchId), (c) => c.query("select id from tasks where id = $1", [t]));
    expect(d.rowCount).toBe(0);

    await as(pool, casey, (c) => c.query("update tasks set assigned_user_id = $1 where id = $2", [STAFF.casey, t]));
    // jordan still sees it because customer A is theirs; casey owns it now.
    await expect(
      as(pool, jordan, (c) => c.query("update tasks set assigned_user_id = $1 where id = $2", [STAFF.jordan, t])),
    ).rejects.toThrow(/Only an admin/);

    const done = await as(pool, casey, (c) =>
      c.query("update tasks set status = 'done', outcome = 'They have 4 cars next week' where id = $1 returning completed_at, completed_by", [t]),
    );
    expect(done.rows[0].completed_by).toBe(STAFF.casey);
    expect(done.rows[0].completed_at).not.toBeNull();
  });

  it("customers have no task access", async () => {
    const r = await as(pool, user(portalUserA), (c) => c.query("select id from tasks"));
    expect(r.rowCount).toBe(0);
    await expect(
      as(pool, user(portalUserA), (c) =>
        c.query("insert into tasks (title, assigned_role, created_by) values ('x', 'sales', $1)", [portalUserA]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("profit-drop sequences", () => {
  /** Build a customer whose monthly profits (oldest first) end in October 2026. */
  async function customerWithProfits(name: string, profits: number[], rep: string | null = STAFF.jordan) {
    const id = await makeCustomer(name, rep);
    const end = new Date(Date.UTC(2026, 9, 1)); // Oct 2026
    for (let i = 0; i < profits.length; i++) {
      const d = new Date(end);
      d.setUTCMonth(end.getUTCMonth() - (profits.length - 1 - i));
      const month = d.toISOString().slice(0, 7);
      if (profits[i] > 0) await seedLoad(id, month, 1000 + profits[i], 1000);
    }
    return id;
  }

  async function run() {
    return as(pool, service, async (c) => (await c.query("select public.run_profit_sequences('2026-11-05') as r")).rows[0].r);
  }

  async function taskFor(customerId: string) {
    const { rows } = await pool.query("select * from tasks where customer_id = $1 and source = 'sequence'", [customerId]);
    return rows;
  }

  it("matches each rule and leaves steady customers alone", async () => {
    const steady = await customerWithProfits("Steady", [1000, 1000, 1000, 1000]);
    const slow = await customerWithProfits("Slow", [1000, 850, 722, 614]); // −15% ×3
    const twoMonth = await customerWithProfits("TwoMonth", [1000, 1000, 700, 490]); // −30% ×2
    const sharp = await customerWithProfits("Sharp", [1000, 1000, 1000, 400]); // −60%
    const gone = await customerWithProfits("Gone", [1000, 1000, 1000, 0]); // no loads = −100%
    const steep = await customerWithProfits("Steep", [1000, 1000, 1000, 550]); // −45%
    const mixed = await customerWithProfits("Mixed", [1000, 1000, 850, 595]); // −15% then −30%
    const growing = await customerWithProfits("Growing", [500, 600, 700, 800]);

    const r = await run();
    expect(r.month).toBe("2026-10-01");

    expect(await taskFor(steady)).toHaveLength(0);
    expect(await taskFor(growing)).toHaveLength(0);
    expect((await taskFor(slow))[0]).toMatchObject({ sequence_rule_key: "slow_decline", assigned_user_id: STAFF.jordan });
    expect((await taskFor(twoMonth))[0].sequence_rule_key).toBe("two_month_drop");
    expect((await taskFor(sharp))[0].sequence_rule_key).toBe("sharp_drop");
    expect((await taskFor(gone))[0].sequence_rule_key).toBe("sharp_drop");
    expect((await taskFor(steep))[0].sequence_rule_key).toBe("steep_drop");
    expect((await taskFor(mixed))[0].sequence_rule_key).toBe("mixed_decline");

    const task = (await taskFor(sharp))[0];
    expect(task.title).toContain("Sharp");
    expect(task.title).toContain("60%");
    expect(task.body).toContain("Oct 2026");
    expect(task.body).toMatch(/why/i);
  });

  it("is idempotent and assigns to Admin when the customer has no rep", async () => {
    const noRep = await customerWithProfits("NoRep", [1000, 1000, 1000, 300], null);
    await run();
    await run();
    const tasks = await taskFor(noRep);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigned_user_id: null, assigned_role: "admin" });
  });

  it("only admins (or the server cron) can run it, and admins can tune rules", async () => {
    await expect(as(pool, jordan, (c) => c.query("select public.run_profit_sequences()"))).rejects.toThrow(/Only an admin/);
    const tuned = await as(pool, admin, (c) => c.query("update sequence_rules set min_drop = 0.45 where key = 'sharp_drop'"));
    expect(tuned.rowCount).toBe(1);
    const bySales = await as(pool, jordan, (c) => c.query("update sequence_rules set active = false"));
    expect(bySales.rowCount).toBe(0);
  });

  it("monthly profit view respects visibility", async () => {
    const own = await as(pool, jordan, (c) => c.query("select distinct customer_id from customer_monthly_profit"));
    expect(own.rows.map((r) => r.customer_id)).not.toContain(customerB);
  });
});

describe("booking bridge", () => {
  it("accepting a web quote creates a TMS load with the vehicles", async () => {
    const payload = webRequest();
    const ref = await as(pool, service, async (c) =>
      (await c.query("select public.submit_quote_request($1, 'ip-bridge') as r", [payload])).rows[0].r.reference,
    );
    const leadId = (await pool.query("select id from leads where reference = $1", [ref])).rows[0].id;
    const quoteId = await as(pool, jordan, async (c) => {
      const { rows } = await c.query(
        `select public.save_quote_draft($1, 900, 300, current_date + 3, current_date + 7, 'Terms', now() + interval '7 days', null) as id`,
        [leadId],
      );
      await c.query("select * from public.send_quote($1, gen_random_uuid(), $2)", [rows[0].id, hex64()]);
      await c.query("select public.staff_record_acceptance($1)", [rows[0].id]);
      return rows[0].id;
    });
    const { rows } = await pool.query(
      `select l.customer_rate, l.carrier_rate, l.customer_status, l.origin_city,
              (select count(*) from load_vehicles v where v.load_id = l.id) as vehicles
       from loads l join bookings b on b.id = l.booking_id where b.quote_id = $1`,
      [quoteId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customer_status: "confirmed", origin_city: "Reno" });
    expect(Number(rows[0].customer_rate)).toBe(1200);
    expect(Number(rows[0].carrier_rate)).toBe(900);
    expect(Number(rows[0].vehicles)).toBe(1);
  });
});
