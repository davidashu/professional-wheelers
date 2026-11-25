#!/usr/bin/env node
/** Recreate a local test database: auth stub + migrations + seed. TESTING ONLY. */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres@localhost:54329/crm_e2e");
const dbName = url.pathname.slice(1);
const root = path.resolve(import.meta.dirname, "../..");
const admin = new pg.Client({ connectionString: url.toString().replace(/\/[^/]*$/, "/postgres") });
await admin.connect();
await admin.query(`drop database if exists "${dbName}" with (force)`);
await admin.query(`create database "${dbName}"`);
await admin.end();

const files = [
  "supabase/tests/local_auth_stub.sql",
  ...readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => `supabase/migrations/${f}`),
  "supabase/seed.sql",
];
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
for (const f of files) await c.query(readFileSync(path.join(root, f), "utf8"));
await c.end();
console.log(`reset ${dbName}: ${files.length} files applied`);
