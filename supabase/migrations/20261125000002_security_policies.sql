-- Row-level security.
--
-- Access model:
--   * anon (public internet, holds the publishable key): NO table access and no
--     function access. Public pages go through the Next.js server, which
--     validates input and calls narrow security-definer functions using the
--     service-role key (server-only).
--   * authenticated: only active staff (profiles.active) see anything.
--     Sales and Admin share lead data; Admin alone manages team and settings.
--   * Sending, accepting, declining and withdrawing quotes, and marking leads
--     lost, happen only through functions so state transitions stay consistent.

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.lead_vehicles enable row level security;
alter table public.lead_notes enable row level security;
alter table public.follow_ups enable row level security;
alter table public.quotes enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.bookings enable row level security;
alter table public.activities enable row level security;
alter table public.submission_rate_limits enable row level security;

-- Table privileges (RLS still applies on top of these).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on public.submission_rate_limits from authenticated;

-- profiles ------------------------------------------------------------------
create policy "staff read team" on public.profiles
  for select to authenticated
  using (public.is_staff() or id = auth.uid());

create policy "admin manages team" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- app_settings --------------------------------------------------------------
create policy "staff read settings" on public.app_settings
  for select to authenticated using (public.is_staff());

create policy "admin updates settings" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- customers -----------------------------------------------------------------
create policy "staff read customers" on public.customers
  for select to authenticated using (public.is_staff());
create policy "staff create customers" on public.customers
  for insert to authenticated with check (public.is_staff());
create policy "staff update customers" on public.customers
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete customers" on public.customers
  for delete to authenticated using (public.is_admin());

-- leads ---------------------------------------------------------------------
create policy "staff read leads" on public.leads
  for select to authenticated using (public.is_staff());
create policy "staff create leads" on public.leads
  for insert to authenticated with check (public.is_staff() and status in ('new', 'contacted', 'pricing'));
create policy "staff update leads" on public.leads
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete leads" on public.leads
  for delete to authenticated using (public.is_admin());

-- lead_vehicles -------------------------------------------------------------
create policy "staff manage vehicles" on public.lead_vehicles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- lead_notes (append-only for staff) ----------------------------------------
create policy "staff read notes" on public.lead_notes
  for select to authenticated using (public.is_staff());
create policy "staff add notes as themselves" on public.lead_notes
  for insert to authenticated with check (public.is_staff() and author_id = auth.uid());
create policy "admin delete notes" on public.lead_notes
  for delete to authenticated using (public.is_admin());

-- follow_ups ----------------------------------------------------------------
create policy "staff read follow-ups" on public.follow_ups
  for select to authenticated using (public.is_staff());
create policy "staff create follow-ups" on public.follow_ups
  for insert to authenticated with check (public.is_staff());
create policy "staff update follow-ups" on public.follow_ups
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete open follow-ups" on public.follow_ups
  for delete to authenticated using (public.is_staff() and completed_at is null);

-- quotes: staff may create and edit DRAFTS directly; everything else goes
-- through functions (send_quote, withdraw_quote, record acceptance, ...).
create policy "staff read quotes" on public.quotes
  for select to authenticated using (public.is_staff());
create policy "staff create draft quotes" on public.quotes
  for insert to authenticated
  with check (public.is_staff() and status = 'draft' and token_hash is null and link_id is null);
create policy "staff edit draft quotes" on public.quotes
  for update to authenticated
  using (public.is_staff() and status = 'draft')
  with check (public.is_staff() and status = 'draft' and token_hash is null and link_id is null);
create policy "staff delete draft quotes" on public.quotes
  for delete to authenticated using (public.is_staff() and status = 'draft');

-- email_deliveries ----------------------------------------------------------
create policy "staff read email log" on public.email_deliveries
  for select to authenticated using (public.is_staff());
create policy "staff record emails" on public.email_deliveries
  for insert to authenticated with check (public.is_staff());
create policy "staff update email status" on public.email_deliveries
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- bookings: created only by acceptance functions -----------------------------
create policy "staff read bookings" on public.bookings
  for select to authenticated using (public.is_staff());
create policy "staff update bookings" on public.bookings
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- activities: read by staff; staff may only append entries as themselves ----
create policy "staff read activity" on public.activities
  for select to authenticated using (public.is_staff());
create policy "staff append activity" on public.activities
  for insert to authenticated
  with check (public.is_staff() and actor_id = auth.uid() and actor_type = 'staff');

-- submission_rate_limits: no policies -> service role only.
