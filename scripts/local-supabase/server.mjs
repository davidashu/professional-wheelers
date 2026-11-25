#!/usr/bin/env node
/**
 * Local Supabase stand-in for TESTING ONLY.
 *
 * Implements the small slice of the Supabase Auth (GoTrue) and PostgREST HTTP
 * APIs that this app uses, on top of a plain PostgreSQL database that has the
 * auth stub + migrations + seed applied. Every request runs in a transaction
 * as the Supabase role from the caller's JWT (anon / authenticated /
 * service_role) with request.jwt.claims set, exactly like PostgREST, so
 * row-level security, grants and security-definer functions are exercised for
 * real.
 *
 * Use it when Docker (and therefore `supabase start`) is unavailable, e.g. in
 * CI or sandboxes. It is NOT a production server and supports no embeds.
 *
 *   DATABASE_URL=postgres://postgres@localhost:54329/crm_e2e node scripts/local-supabase/server.mjs
 */
import http from "node:http";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.LOCAL_SUPABASE_PORT ?? 54321);
const JWT_SECRET = process.env.LOCAL_JWT_SECRET ?? "local-test-jwt-secret-not-for-production-use";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
// Serialize like PostgREST: dates stay "YYYY-MM-DD", timestamps become ISO 8601 strings.
pg.types.setTypeParser(1082, (v) => v);
const iso = (v) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
pg.types.setTypeParser(1184, iso);
pg.types.setTypeParser(1114, (v) => v.replace(" ", "T"));

// ---------------------------------------------------------------- JWT ----
const b64u = (b) => Buffer.from(b).toString("base64url");
export function signJwt(payload, secret = JWT_SECRET) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = String(token ?? "").split(".");
  if (!h || !b || !s) return null;
  const expected = Buffer.from(createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest("base64url"));
  const given = Buffer.from(s);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const payload = JSON.parse(Buffer.from(b, "base64url").toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}

export const ANON_KEY = signJwt({ role: "anon", iss: "local", iat: 1700000000, exp: 4102444800 });
export const SERVICE_KEY = signJwt({ role: "service_role", iss: "local", iat: 1700000000, exp: 4102444800 });

// --------------------------------------------------------------- helpers ----
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(e); }
    });
  });
const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Object.assign(new Error(`bad identifier ${name}`), { status: 400, code: "PGRST100" });
  return `"${name}"`;
};

function claimsFor(req) {
  const apikey = req.headers.apikey;
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const claims = verifyJwt(auth || apikey);
  if (!claims) return null;
  return claims;
}

async function asRole(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const role = claims.role === "service_role" ? "service_role" : claims.role === "authenticated" ? "authenticated" : "anon";
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function pgError(res, e) {
  const status = e.status ?? (e.code === "42501" ? 403 : e.code === "P0002" ? 404 : e.code?.startsWith("23") ? 409 : 400);
  send(res, status, { code: e.code ?? "PGRST000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
}

// ---------------------------------------------------------------- auth ----
const userJson = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
  email_confirmed_at: u.email_confirmed_at, app_metadata: u.raw_app_meta_data ?? {},
  user_metadata: u.raw_user_meta_data ?? {}, created_at: u.created_at, updated_at: u.updated_at,
  identities: [], is_anonymous: false,
});
const refreshTokens = new Map();

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({
    sub: u.id, role: "authenticated", aud: "authenticated", email: u.email,
    app_metadata: u.raw_app_meta_data ?? {}, user_metadata: u.raw_user_meta_data ?? {},
    iat: now, exp: now + 3600, session_id: randomUUID(),
  });
  const refresh_token = randomBytes(24).toString("base64url");
  refreshTokens.set(refresh_token, u.id);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(u) };
}

async function handleAuth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  if (path === "/health") return send(res, 200, { name: "local-gotrue" });
  if (path === "/settings") return send(res, 200, { external: { email: true }, disable_signup: true });

  if (path === "/token" && req.method === "POST") {
    const body = (await readBody(req)) ?? {};
    const grant = url.searchParams.get("grant_type");
    let user = null;
    if (grant === "password") {
      const { rows } = await pool.query(
        `select * from auth.users where lower(email) = lower($1)
           and encrypted_password is not null and encrypted_password = extensions.crypt($2, encrypted_password)`,
        [body.email ?? "", body.password ?? ""],
      );
      user = rows[0];
    } else if (grant === "refresh_token") {
      const id = refreshTokens.get(body.refresh_token);
      if (id) {
        refreshTokens.delete(body.refresh_token);
        user = (await pool.query("select * from auth.users where id = $1", [id])).rows[0];
      }
    }
    if (!user) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    return send(res, 200, session(user));
  }

  if (path === "/user" && req.method === "GET") {
    const claims = verifyJwt(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
    if (!claims?.sub) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const { rows } = await pool.query("select * from auth.users where id = $1", [claims.sub]);
    if (!rows[0]) return send(res, 404, { code: 404, error_code: "user_not_found", msg: "User not found" });
    return send(res, 200, userJson(rows[0]));
  }

  if (path === "/logout") {
    res.writeHead(204);
    return res.end();
  }

  if (path === "/admin/users" && req.method === "POST") {
    const claims = claimsFor(req);
    if (claims?.role !== "service_role") return send(res, 403, { code: 403, msg: "service role required" });
    const b = (await readBody(req)) ?? {};
    try {
      const { rows } = await pool.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', lower($1),
                 extensions.crypt($2, extensions.gen_salt('bf')), case when $3 then now() end, $4, $5)
         returning *`,
        [b.email, b.password, Boolean(b.email_confirm), { provider: "email", providers: ["email"], ...(b.app_metadata ?? {}) }, b.user_metadata ?? {}],
      );
      return send(res, 200, userJson(rows[0]));
    } catch (e) {
      if (e.code === "23505") return send(res, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
      throw e;
    }
  }
  return send(res, 404, { msg: `auth route not implemented: ${req.method} ${path}` });
}

// ----------------------------------------------------------- PostgREST ----
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

function parseList(raw) {
  return raw.replace(/^\(/, "").replace(/\)$/, "").split(",").map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
}

function condition(col, expr, params) {
  let negate = false;
  if (expr.startsWith("not.")) { negate = true; expr = expr.slice(4); }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const value = expr.slice(dot + 1);
  const c = ident(col);
  let sql;
  if (OPS[op]) { params.push(value); sql = `${c} ${OPS[op]} $${params.length}`; }
  else if (op === "like" || op === "ilike") { params.push(value.replace(/\*/g, "%")); sql = `${c}::text ${op} $${params.length}`; }
  else if (op === "is") {
    const v = value.toLowerCase();
    if (!["null", "true", "false"].includes(v)) throw Object.assign(new Error("bad is value"), { status: 400 });
    sql = `${c} is ${v}`;
  } else if (op === "in") { params.push(parseList(value)); sql = `${c}::text = any($${params.length}::text[])`; }
  else throw Object.assign(new Error(`operator not supported: ${op}`), { status: 400, code: "PGRST100" });
  return negate ? `not (${sql})` : sql;
}

function whereClause(url, params) {
  const parts = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key)) continue;
    if (key === "or") {
      const inner = value.replace(/^\(/, "").replace(/\)$/, "").split(",");
      parts.push(`(${inner.map((p) => { const i = p.indexOf("."); return condition(p.slice(0, i), p.slice(i + 1), params); }).join(" or ")})`);
    } else {
      parts.push(condition(key, value, params));
    }
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

function selectList(raw) {
  if (!raw || raw.trim() === "*") return "*";
  return raw.split(",").map((c) => ident(c.trim())).join(", ");
}

async function handleRest(req, res, url) {
  const claims = claimsFor(req);
  if (!claims) return send(res, 401, { code: "PGRST301", message: "JWT invalid" });
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  const prefer = String(req.headers.prefer ?? "");
  const wantObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
  const wantCount = /count=exact/.test(prefer);

  const finish = (rows, total) => {
    const headers = {};
    if (wantCount) headers["Content-Range"] = rows.length ? `0-${rows.length - 1}/${total ?? rows.length}` : `*/${total ?? 0}`;
    if (req.method === "HEAD") { res.writeHead(200, headers); return res.end(); }
    if (wantObject) {
      if (rows.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null });
      return send(res, 200, rows[0], headers);
    }
    return send(res, 200, rows, headers);
  };

  try {
    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      const args = (await readBody(req)) ?? {};
      return await asRole(claims, async (c) => {
        const meta = await c.query(
          `select p.proretset, p.proargnames, p.pronargs, (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes) with ordinality as a(t, o)) as argtypes,
                  t.typtype as rettyptype, format_type(p.prorettype, null) as rettype
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
           where n.nspname = 'public' and p.proname = $1`,
          [fn],
        );
        if (!meta.rows[0]) throw Object.assign(new Error(`function ${fn} not found`), { status: 404, code: "PGRST202" });
        const m = meta.rows[0];
        const names = (m.proargnames ?? []).slice(0, m.pronargs);
        const params = [];
        const named = [];
        names.forEach((n, i) => {
          if (n in args) {
            const v = args[n];
            params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
            named.push(`${ident(n)} => $${params.length}::${m.argtypes[i]}`);
          }
        });
        const call = `public.${ident(fn)}(${named.join(", ")})`;
        if (m.proretset || m.rettyptype === "c") {
          const { rows } = await c.query(`select * from ${call}`, params);
          if (!m.proretset && !wantObject) return send(res, 200, rows[0] ?? null);
          return finish(rows);
        }
        const { rows } = await c.query(`select ${call} as r`, params);
        const r = rows[0].r;
        return send(res, 200, m.rettype === "void" ? null : r);
      });
    }

    const table = ident(path);
    if (req.method === "GET" || req.method === "HEAD") {
      return await asRole(claims, async (c) => {
        const params = [];
        const where = whereClause(url, params);
        let sql = `select ${selectList(url.searchParams.get("select"))} from public.${table}${where}`;
        const order = url.searchParams.get("order");
        if (order) {
          sql += " order by " + order.split(",").map((o) => {
            const [col, dir, nulls] = o.split(".");
            return `${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullslast" ? " nulls last" : nulls === "nullsfirst" ? " nulls first" : ""}`;
          }).join(", ");
        }
        let total;
        if (wantCount) total = Number((await c.query(`select count(*) from public.${table}${where}`, params)).rows[0].count);
        const limit = url.searchParams.get("limit");
        const offset = url.searchParams.get("offset");
        if (limit) sql += ` limit ${Number(limit)}`;
        if (offset) sql += ` offset ${Number(offset)}`;
        const { rows } = req.method === "HEAD" ? { rows: [] } : await c.query(sql, params);
        return finish(rows, total);
      });
    }

    const returning = /return=representation/.test(prefer) ? ` returning ${selectList(url.searchParams.get("select"))}` : "";
    if (req.method === "POST") {
      const body = await readBody(req);
      const rowsIn = Array.isArray(body) ? body : [body];
      return await asRole(claims, async (c) => {
        const out = [];
        for (const row of rowsIn) {
          const cols = Object.keys(row);
          const vals = cols.map((k) => (row[k] !== null && typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k]));
          const sql = `insert into public.${table} (${cols.map(ident).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})${returning}`;
          const r = await c.query(sql, vals);
          out.push(...r.rows);
        }
        if (!returning) { res.writeHead(201); return res.end(); }
        return finish(out);
      });
    }
    if (req.method === "PATCH") {
      const body = (await readBody(req)) ?? {};
      return await asRole(claims, async (c) => {
        const cols = Object.keys(body);
        const params = cols.map((k) => (body[k] !== null && typeof body[k] === "object" ? JSON.stringify(body[k]) : body[k]));
        const set = cols.map((k, i) => `${ident(k)} = $${i + 1}`).join(", ");
        const where = whereClause(url, params);
        const r = await c.query(`update public.${table} set ${set}${where}${returning || " returning 1"}`, params);
        if (!returning) {
          const headers = wantCount ? { "Content-Range": `*/${r.rowCount}` } : {};
          res.writeHead(204, headers); return res.end();
        }
        return finish(r.rows, r.rowCount);
      });
    }
    if (req.method === "DELETE") {
      return await asRole(claims, async (c) => {
        const params = [];
        const where = whereClause(url, params);
        const r = await c.query(`delete from public.${table}${where}${returning}`, params);
        if (!returning) { res.writeHead(204); return res.end(); }
        return finish(r.rows, r.rowCount);
      });
    }
    return send(res, 405, { message: "method not allowed" });
  } catch (e) {
    return pgError(res, e);
  }
}

// --------------------------------------------------------------- server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,HEAD,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  try {
    if (url.pathname.startsWith("/auth/v1")) return await handleAuth(req, res, url);
    if (url.pathname.startsWith("/rest/v1/")) return await handleRest(req, res, url);
    send(res, 404, { message: "not found" });
  } catch (e) {
    console.error(e);
    pgError(res, e);
  }
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  server.listen(PORT, () => {
    console.log(`local supabase stand-in on http://localhost:${PORT}`);
    console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`);
    console.log(`SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`);
  });
}
