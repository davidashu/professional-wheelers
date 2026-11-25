# Professional Wheelers CRM + TMS

A CRM and TMS on one platform for a freight and auto transport brokerage. Customers request a quote on a public form, staff price it, the customer accepts through a secure link and fills in booking details, and staff hand the booking off to a carrier.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4 and Supabase (Postgres, Auth, Row Level Security).

## What's included

| Area | What it does |
| --- | --- |
| **Public quote form** (`/get-a-quote`) | Mobile-friendly form with several vehicles per request. Validated on the server, protected against spam (honeypot, signed form timer, per-IP rate limit) and duplicates (idempotent submit key plus a 24-hour fingerprint check). Shows a reference number such as `Q-7KD2MX`. It never shows a price. |
| **Dashboard** | New requests, quotes awaiting a reply, overdue follow-ups, recent bookings. |
| **Leads and pipeline** | Searchable list plus a board: New Request → Contacted → Pricing → Quote Sent → Booked, and Lost with a reason. Leads can be reopened. |
| **Lead detail** | Customer, vehicles, route, pickup window, sales rep, source, notes, follow-ups, quote history and a full timeline. |
| **Phone leads and customers** | Staff enter leads taken by phone. Repeat customers are matched by email, and each customer page lists every shipment. |
| **Quote builder** | Carrier pay + broker fee = customer total, with profit shown to staff only. Expiry date, terms, revisions and version history. Only the latest valid version can be accepted. |
| **Customer quote link** (`/q/<token>`) | Secure link that expires and shows no internal pricing (no carrier pay, no fee). Staff can copy it, or email it when Resend is set up, and the delivery status is tracked. Accept and decline are idempotent, and acceptance creates exactly one booking, even with two tabs open. |
| **Customer booking portal** | After accepting, the customer uses the same link to enter full pickup and delivery addresses and contacts, then signs the booking agreement. The signed text, name and time are frozen. The agreement text is placeholder wording; admins replace it under **Settings**. |
| **Bookings** | Addresses, contacts, notes, carrier, and status Awaiting Carrier → Carrier Assigned → Picked Up → Delivered. Terms copied from the accepted quote can't be edited. |
| **Roles** | **Admin** sees everything. **Sales** sees only the customers and loads assigned to them. **Dispatch** uses only the TMS (loads, carriers) for loads assigned to them, and can't change customer rates or assignments. **Customer** logins only see their own portal. Roles are checked on the server and enforced again by Postgres RLS. |
| **Loads (TMS)** | Every load has two status bars. The customer bar: Confirmed → Dispatched → Picked up → POD received → Delivered → Invoiced → Payment due → Paid (we paid the carrier; set automatically when the carrier bar reaches Paid, and hidden from the customer) → Customer paid (the customer paid us; set when the invoice is marked paid), plus Pick up delayed, Running late, POD issue, Load issue and Cancelled. The carrier/billing bar: Not assigned → Assigned → Rate con signed → Picked up → Delivered → Invoice received → Paid, plus Issue. Customer rate, carrier rate, quick pay fee, adjustments and profit. Vehicles with VINs. Do-not-use carriers can't be assigned. |
| **Quote orders** | Lanes posted for pricing by staff or by the customer in the portal. Posted → Quoted → Approved, Too high, Too low or Cancelled. Approving creates the load. |
| **Carriers** | MC/DOT, standing (active, pending, do not use), insurance amounts and expiry, agreement date, lanes, load and profit history. |
| **Invoices** | One live invoice per load, printable. Issuing and paying an invoice moves the customer bar automatically. |
| **Tasks** | Assign to a person or to a position (Admin, Sales, Dispatch). A combined Tasks page in the left bar, plus a Tasks section on each customer and load. |
| **Profit-drop sequences** | On the 1st of each month, each customer's gross profit is compared month over month. Rules: down 10–20% three months in a row; 20–40% two months in a row; 50%+ in one month (a month with no loads counts as −100%); 40–50% in one month; or 10%+ two months in a row with 30%+ combined. The most serious match creates one call task for the customer's sales rep (or the Admin position). Admins edit thresholds and task text under **Sequences**. |
| **Customer portal** (`/portal`) | Customers track loads on their status bar, post lanes for quotes and answer them, and view and print invoices. It never shows carrier pay or profit. Admins add portal logins from the customer page. |
| **Timeline** | Database triggers log every significant change: stage moves, quotes, emails, acceptance, bookings and agreement signatures. |

## Security model

- The browser only gets the Supabase anon key, and the `anon` role has **no** table or function access.
- Public pages (quote form, customer link) call Next.js server actions, which use the service-role key on the server to call a few `security definer` functions. Those functions return only customer-safe fields.
- Staff use Supabase Auth. RLS policies check `is_staff()` / `is_admin()`, which read the `profiles` table. A user is only active if an admin created them with a role in `app_metadata`. Public sign-up is disabled.
- Customer links are `HMAC-SHA256(QUOTE_LINK_SECRET, link id)`. The database stores only a SHA-256 hash of the token, so a database leak doesn't expose working links.
- Workflow rules live in the database: Booked only through acceptance, Lost only with a reason, one booking per quote, immutable booking terms and signatures.
- Visitor IP addresses are stored only as keyed hashes.

## Setup

### 1. Requirements

- Node.js 20.9 or newer
- A Supabase project (the free plan is enough)

### 2. Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Generate `QUOTE_LINK_SECRET` and `APP_SECRET` with `openssl rand -base64 48`. Never commit `.env.local`.

### 3. Database

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push                 # applies supabase/migrations
```

Without the CLI, run the four files in `supabase/migrations/` in order in the Supabase SQL editor.

**Demo data (test projects only):** run `supabase/seed.sql` in the SQL editor. It creates 13 leads across every stage, quotes, 3 bookings and three demo staff users, all with the password `DemoPassw0rd!`:

| Email | Role |
| --- | --- |
| admin@demo.autotransport.test | Admin |
| jordan@demo.autotransport.test | Sales |
| casey@demo.autotransport.test | Sales |

Don't load the seed into production, and delete or re-password these users before going live.

### 4. Staff accounts

Sign-up is closed. The first admin is created in the Supabase dashboard under **Authentication → Users → Add user**. Then run:

```sql
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
 where email = 'you@yourcompany.com';
update public.profiles set role = 'admin', active = true
 where id = (select id from auth.users where email = 'you@yourcompany.com');
```

After that, admins add and deactivate staff (Admin, Sales or Dispatch) from **Settings → Team** in the app, and customer portal logins from each customer's page.

### Monthly sequences

`vercel.json` schedules `/api/cron/sequences` for 09:00 UTC on the 1st of each month. Set `CRON_SECRET` (32+ characters) in Vercel and Vercel Cron sends it as a bearer token. Admins can also run it by hand from **Sequences**; a customer never gets two tasks for the same month.

### 5. Email (optional)

Without email settings, staff copy the customer link and send it themselves. To send quotes by email:

1. Create a [Resend](https://resend.com) account and verify your sending domain.
2. Set `RESEND_API_KEY`, `EMAIL_FROM` and optionally `EMAIL_REPLY_TO`.
3. Add a webhook pointing to `https://<your-site>/api/webhooks/resend` for the `email.sent`, `email.delivered`, `email.bounced`, `email.complained` and `email.delivery_delayed` events, and set `RESEND_WEBHOOK_SECRET` to its signing secret.

The quote page shows each email as Pending, Sent, Delivered, Bounced or Failed, based on what Resend reports.

### 6. Run

```bash
npm run dev        # http://localhost:3000
npm run build && npm start
```

`/get-a-quote` is the public form. Staff sign in at `/login`.

### 7. Booking agreement

Before customers sign anything, an admin should replace the placeholder text under **Settings → Booking agreement**. Each booking keeps a copy of the exact text that was signed.

## Tests

| Command | What it runs |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run test:unit` | Pricing, tokens, spam checks, validation, email sending and webhook signatures |
| `npm run test:db` | Database tests: RLS for each role, the workflow, quote acceptance under concurrency, expiry, link rotation, no price leaks, bookings, agreement signing |
| `npm run test:e2e:local` | Builds the app and drives a browser through the whole flow |

The database and browser tests need a plain PostgreSQL 15+ server, not Docker. They create throwaway databases, add a small stand-in for Supabase's `auth` schema (`supabase/tests/local_auth_stub.sql`), then apply the real migrations and seed. Point them at your server with `TEST_PG_URL` (default `postgres://postgres@localhost:54329`).

`test:e2e:local` also starts `scripts/local-supabase/server.mjs`, a **test-only** stand-in for the parts of Supabase Auth and PostgREST the app uses. It is never used in production. With Docker available you can use `supabase start` instead and run `npm run test:e2e` against it.

## Project layout

```
src/app/get-a-quote      public quote form
src/app/q/[token]        customer quote link and booking portal
src/app/(crm)            staff app: dashboard, leads, pipeline, follow-ups,
                         customers, bookings, settings
src/app/api/webhooks     Resend delivery webhook
src/lib                  env, auth, validation, pricing, tokens, email, data access
supabase/migrations      schema, RLS policies, workflow functions, booking portal
supabase/seed.sql        demo data
tests/                   unit, database and Playwright tests
```
