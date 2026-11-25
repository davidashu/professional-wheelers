import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Database test harness. Creates a throwaway database on a local PostgreSQL
 * server (TEST_DATABASE_URL, default postgres://postgres@localhost:54329/postgres),
 * applies the Supabase auth stub, every migration, and the seed.
 */
const ROOT = path.resolve(__dirname, "../..");
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres";

export const STAFF = {
  admin: "11111111-1111-4111-8111-111111111111",
  jordan: "22222222-2222-4222-8222-222222222222",
  casey: "33333333-3333-4333-8333-333333333333",
} as const;

export function sqlFiles(): string[] {
  const migrations = readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(ROOT, "supabase/migrations", f));
  return [path.join(ROOT, "supabase/tests/local_auth_stub.sql"), ...migrations, path.join(ROOT, "supabase/seed.sql")];
}

export async function createTestDatabase(): Promise<{ pool: pg.Pool; url: string; drop: () => Promise<void> }> {
  const name = `crm_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  const setup = new pg.Client({ connectionString: url });
  await setup.connect();
  for (const file of sqlFiles()) {
    await setup.query(readFileSync(file, "utf8"));
  }
  await setup.end();

  const pool = new pg.Pool({ connectionString: url, max: 6 });
  return {
    pool,
    url,
    drop: async () => {
      await pool.end();
      const c = new pg.Client({ connectionString: ADMIN_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

export type Actor = { kind: "anon" } | { kind: "service" } | { kind: "user"; id: string };
export const anon: Actor = { kind: "anon" };
export const service: Actor = { kind: "service" };
export const user = (id: string): Actor => ({ kind: "user", id });

/** Run queries inside one transaction as the given Supabase role (RLS applies). */
export async function as<T>(pool: pg.Pool, actor: Actor, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (actor.kind === "anon") {
      await client.query("set local role anon");
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (actor.kind === "service") {
      await client.query("set local role service_role");
      await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    } else {
      await client.query("set local role authenticated");
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: actor.id, role: "authenticated" }),
      ]);
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function webRequest(overrides: Record<string, unknown> = {}) {
  return {
    submission_key: randomUUID(),
    name: "Test Customer",
    email: `cust-${randomUUID().slice(0, 8)}@example.com`,
    phone: "(555) 555-0100",
    company: "",
    pickup_city: "Reno",
    pickup_state: "NV",
    pickup_zip: "89501",
    delivery_city: "Tampa",
    delivery_state: "FL",
    delivery_zip: "33602",
    earliest_pickup_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    pickup_date_flexible: true,
    transport_type: "open",
    special_instructions: "",
    vehicles: [{ year: 2020, make: "Honda", model: "Pilot", operable: true }],
    ...overrides,
  };
}

export const hex64 = () => (randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 64);
