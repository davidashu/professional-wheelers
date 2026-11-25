-- Customer portal and customer <-> staff messages.
--
-- Customers sign in without a password: a one-time link sent to the email on
-- their customer record, a sign-in link a staff member copies for them, or the
-- secure quote link they already have. Each of these starts a portal session.
--
-- Security model (same as the quote link):
--   * Customers are NOT Supabase Auth users. They never get a JWT and the anon
--     role still has no table or function access.
--   * The Next.js server keeps a random session token in an httpOnly cookie and
--     calls the security-definer functions below with its SHA-256 hash, using
--     the service-role key. Every function resolves the customer from a live
--     session first, so one customer can never read another customer's data,
--     and the functions select only customer-safe columns (never carrier pay,
--     broker fee, internal notes, lost reasons or staff notes).
--   * Staff read and write messages through RLS like every other table.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.portal_login_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('email', 'staff_invite')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index portal_login_tokens_customer_idx on public.portal_login_tokens (customer_id, created_at desc);

create table public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  method text not null check (method in ('email', 'staff_invite', 'quote_link')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index portal_sessions_customer_idx on public.portal_sessions (customer_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  sender_type text not null check (sender_type in ('customer', 'staff')),
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  -- when the other side read it (staff for customer messages, customer for staff messages)
  read_at timestamptz,
  -- "new message" email to the customer for staff messages
  email_status text check (email_status is null or email_status in ('sent', 'failed', 'not_configured')),
  email_error text check (email_error is null or length(email_error) <= 500),
  constraint messages_staff_sender check (sender_type = 'customer' or sender_id is not null)
);
create index messages_customer_idx on public.messages (customer_id, created_at desc);
create index messages_lead_idx on public.messages (lead_id, created_at desc);
create index messages_unread_from_customer_idx on public.messages (customer_id)
  where sender_type = 'customer' and read_at is null;

-- A message can only be tied to one of the same customer's shipments, and only
-- the read/email fields can change after it is written.
create or replace function public.guard_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.customer_id, new.lead_id, new.sender_type, new.sender_id, new.body, new.created_at)
       is distinct from (old.customer_id, old.lead_id, old.sender_type, old.sender_id, old.body, old.created_at) then
      -- lead_id may only be cleared by the FK (lead deleted)
      if not (new.lead_id is null and old.lead_id is not null
              and (new.customer_id, new.sender_type, new.sender_id, new.body, new.created_at)
                  is not distinct from (old.customer_id, old.sender_type, old.sender_id, old.body, old.created_at)) then
        raise exception 'Messages cannot be edited after they are sent.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.lead_id is not null and not exists (
    select 1 from public.leads l where l.id = new.lead_id and l.customer_id = new.customer_id
  ) then
    raise exception 'That shipment belongs to a different customer.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger messages_guard before insert or update on public.messages
  for each row execute function public.guard_message();

-- ---------------------------------------------------------------------------
-- Access: staff use RLS on messages; portal tables are service-role only.
-- ---------------------------------------------------------------------------
alter table public.portal_login_tokens enable row level security;
alter table public.portal_sessions enable row level security;
alter table public.messages enable row level security;

revoke all on public.portal_login_tokens, public.portal_sessions, public.messages from anon, authenticated;
grant select, insert, update on public.messages to authenticated;
grant all on public.portal_login_tokens, public.portal_sessions, public.messages to service_role;

create policy "staff read messages" on public.messages
  for select to authenticated using (public.is_staff());
create policy "staff send messages as themselves" on public.messages
  for insert to authenticated
  with check (public.is_staff() and sender_type = 'staff' and sender_id = auth.uid() and read_at is null);
-- Updates are limited to read_at / email_status by the guard trigger.
create policy "staff update message status" on public.messages
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public.portal_session_customer(p_session_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.portal_sessions;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_session from public.portal_sessions
   where token_hash = p_session_hash and revoked_at is null and expires_at > now();
  if not found then
    return null;
  end if;
  if v_session.last_seen_at < now() - interval '5 minutes' then
    update public.portal_sessions set last_seen_at = now() where id = v_session.id;
  end if;
  return v_session.customer_id;
end;
$$;

-- Hourly counter shared with the quote form's limiter (keys are namespaced).
create or replace function public.portal_rate_limit(p_key text, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_key is null then
    return true;
  end if;
  insert into public.submission_rate_limits (ip_hash, window_start, attempts)
  values (p_key, date_trunc('hour', now()), 1)
  on conflict (ip_hash, window_start) do update set attempts = public.submission_rate_limits.attempts + 1
  returning attempts into v_attempts;
  return v_attempts <= p_max;
end;
$$;

create or replace function public.portal_start_session(p_customer_id uuid, p_session_hash text, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_session_token' using errcode = '22023';
  end if;
  insert into public.portal_sessions (customer_id, token_hash, method, expires_at)
  values (p_customer_id, p_session_hash, p_method, now() + interval '30 days');
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign-in (service role only)
-- ---------------------------------------------------------------------------

-- Step 1 of email sign-in. The caller always shows the same "check your email"
-- message, whatever this returns, so it can't be used to find out who is a customer.
create or replace function public.portal_request_login(p_email text, p_token_hash text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_recent integer;
begin
  if not public.portal_rate_limit('portal-login:' || p_ip_hash, 10) then
    return jsonb_build_object('result', 'rate_limited');
  end if;
  select * into v_customer from public.customers where lower(email) = lower(trim(p_email));
  if not found then
    return jsonb_build_object('result', 'unknown');
  end if;
  select count(*) into v_recent from public.portal_login_tokens
   where customer_id = v_customer.id and purpose = 'email' and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('result', 'rate_limited');
  end if;
  insert into public.portal_login_tokens (customer_id, token_hash, purpose, expires_at)
  values (v_customer.id, p_token_hash, 'email', now() + interval '30 minutes');
  return jsonb_build_object('result', 'ok', 'name', v_customer.name, 'email', v_customer.email);
end;
$$;

-- Step 2: exchange a sign-in link for a session. Email links work once;
-- staff-copied links can be reused until they expire (7 days), so a customer
-- can open the portal on a second device without email being set up.
create or replace function public.portal_redeem_login(p_token_hash text, p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.portal_login_tokens;
begin
  select * into v_token from public.portal_login_tokens where token_hash = p_token_hash for update;
  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;
  if v_token.expires_at <= now() then
    return jsonb_build_object('result', 'expired');
  end if;
  if v_token.purpose = 'email' and v_token.used_at is not null then
    return jsonb_build_object('result', 'used');
  end if;
  update public.portal_login_tokens set used_at = coalesce(used_at, now()) where id = v_token.id;
  perform public.portal_start_session(v_token.customer_id, p_session_hash, v_token.purpose);
  return jsonb_build_object('result', 'ok');
end;
$$;

-- Open the portal from a quote link the customer already has.
create or replace function public.portal_session_from_quote(p_quote_token_hash text, p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_customer_id uuid;
begin
  select * into v_quote from public.quotes where token_hash = p_quote_token_hash and status <> 'draft';
  if not found or public.quote_public_state(v_quote) in ('superseded', 'withdrawn') then
    return jsonb_build_object('result', 'invalid');
  end if;
  select customer_id into v_customer_id from public.leads where id = v_quote.lead_id;
  perform public.portal_start_session(v_customer_id, p_session_hash, 'quote_link');
  return jsonb_build_object('result', 'ok');
end;
$$;

create or replace function public.portal_sign_out(p_session_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.portal_sessions set revoked_at = now()
   where token_hash = p_session_hash and revoked_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Portal data (service role only). Customer-safe fields only.
-- ---------------------------------------------------------------------------
create or replace function public.portal_overview(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := public.portal_session_customer(p_session_hash);
  v_customer public.customers;
  v_company text;
begin
  if v_customer_id is null then
    return null;
  end if;
  select * into v_customer from public.customers where id = v_customer_id;
  select company_name into v_company from public.app_settings where id = 1;

  return jsonb_build_object(
    'company_name', v_company,
    'customer', jsonb_build_object(
      'name', v_customer.name, 'email', v_customer.email, 'phone', v_customer.phone, 'company', v_customer.company),
    'unread_messages', (
      select count(*) from public.messages m
       where m.customer_id = v_customer_id and m.sender_type = 'staff' and m.read_at is null),
    'shipments', coalesce((
      select jsonb_agg(s order by s ->> 'created_at' desc)
        from (
          select jsonb_build_object(
            'reference', l.reference,
            'created_at', l.created_at,
            'status', l.status,
            'pickup', jsonb_build_object('city', l.pickup_city, 'state', l.pickup_state, 'zip', l.pickup_zip),
            'delivery', jsonb_build_object('city', l.delivery_city, 'state', l.delivery_state, 'zip', l.delivery_zip),
            'earliest_pickup_date', l.earliest_pickup_date,
            'pickup_date_flexible', l.pickup_date_flexible,
            'transport_type', l.transport_type,
            'vehicles', coalesce((
              select jsonb_agg(jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'operable', v.operable)
                               order by v.position)
                from public.lead_vehicles v where v.lead_id = l.id), '[]'::jsonb),
            'quote', (
              select jsonb_build_object(
                'version', q.version,
                'state', public.quote_public_state(q),
                'total', q.total,
                'pickup_window_start', q.pickup_window_start,
                'pickup_window_end', q.pickup_window_end,
                'expires_at', q.expires_at,
                'sent_at', q.sent_at,
                'responded_at', q.responded_at,
                -- used by the server to rebuild the customer's quote link; never sent to the browser
                'link_id', q.link_id,
                'token_hash', q.token_hash)
                from public.quotes q
               where q.lead_id = l.id and q.status not in ('draft', 'superseded', 'withdrawn')
               order by q.version desc
               limit 1),
            'booking', (
              select jsonb_build_object(
                'reference', b.reference,
                'status', b.status,
                'total_price', b.total_price,
                'carrier_assigned_at', b.carrier_assigned_at,
                'picked_up_at', b.picked_up_at,
                'delivered_at', b.delivered_at,
                'details_submitted', b.customer_details_submitted_at is not null,
                'signed_name', b.agreement_signed_name,
                'signed_at', b.agreement_signed_at,
                'pickup_address', b.pickup_address,
                'delivery_address', b.delivery_address)
                from public.bookings b where b.lead_id = l.id)
          ) as s
            from public.leads l
           where l.customer_id = v_customer_id
        ) shipments), '[]'::jsonb)
  );
end;
$$;

create or replace function public.portal_messages(p_session_hash text, p_mark_read boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := public.portal_session_customer(p_session_hash);
  v_result jsonb;
begin
  if v_customer_id is null then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'body', m.body,
           'from', m.sender_type,
           'staff_name', case when m.sender_type = 'staff'
                              then coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Our team') end,
           'reference', l.reference,
           'created_at', m.created_at,
           'read_at', m.read_at) order by m.created_at), '[]'::jsonb)
    into v_result
    from (select * from public.messages where customer_id = v_customer_id order by created_at desc limit 300) m
    left join public.profiles p on p.id = m.sender_id
    left join public.leads l on l.id = m.lead_id;

  if p_mark_read then
    update public.messages set read_at = now()
     where customer_id = v_customer_id and sender_type = 'staff' and read_at is null;
  end if;
  return v_result;
end;
$$;

create or replace function public.portal_send_message(p_session_hash text, p_body text, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := public.portal_session_customer(p_session_hash);
  v_lead_id uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_customer_id is null then
    return jsonb_build_object('result', 'signed_out');
  end if;
  if length(v_body) = 0 or length(v_body) > 4000 then
    return jsonb_build_object('result', 'invalid');
  end if;
  if not public.portal_rate_limit('portal-msg:' || v_customer_id::text, 60) then
    return jsonb_build_object('result', 'rate_limited');
  end if;
  if nullif(trim(p_reference), '') is not null then
    select id into v_lead_id from public.leads where reference = trim(p_reference) and customer_id = v_customer_id;
  end if;
  insert into public.messages (customer_id, lead_id, sender_type, body)
  values (v_customer_id, v_lead_id, 'customer', v_body)
  returning id into v_id;
  return jsonb_build_object('result', 'sent', 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff functions (authenticated, staff only)
-- ---------------------------------------------------------------------------
create or replace function public.create_portal_invite(p_customer_id uuid, p_token_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + interval '7 days';
begin
  if not public.is_staff() then
    raise exception 'Only staff can create portal sign-in links.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;
  insert into public.portal_login_tokens (customer_id, token_hash, purpose, expires_at, created_by)
  values (p_customer_id, p_token_hash, 'staff_invite', v_expires, auth.uid());
  return v_expires;
end;
$$;

create or replace function public.mark_customer_messages_read(p_customer_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.messages set read_at = now()
   where customer_id = p_customer_id and sender_type = 'customer' and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- One row per customer conversation, newest first. Runs as the caller, so RLS applies.
create or replace function public.message_inbox(p_limit integer default 100)
returns table (
  customer_id uuid,
  customer_name text,
  customer_email text,
  last_body text,
  last_sender_type text,
  last_at timestamptz,
  unread bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.email, last.body, last.sender_type, last.created_at,
         (select count(*) from public.messages u
           where u.customer_id = c.id and u.sender_type = 'customer' and u.read_at is null)
    from (select distinct on (m.customer_id) m.customer_id, m.body, m.sender_type, m.created_at
            from public.messages m
           order by m.customer_id, m.created_at desc) last
    join public.customers c on c.id = last.customer_id
   order by last.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.guard_message(),
  public.portal_session_customer(text),
  public.portal_rate_limit(text, integer),
  public.portal_start_session(uuid, text, text),
  public.portal_request_login(text, text, text),
  public.portal_redeem_login(text, text),
  public.portal_session_from_quote(text, text),
  public.portal_sign_out(text),
  public.portal_overview(text),
  public.portal_messages(text, boolean),
  public.portal_send_message(text, text, text),
  public.create_portal_invite(uuid, text),
  public.mark_customer_messages_read(uuid),
  public.message_inbox(integer)
from public, anon, authenticated;

grant execute on function
  public.portal_request_login(text, text, text),
  public.portal_redeem_login(text, text),
  public.portal_session_from_quote(text, text),
  public.portal_sign_out(text),
  public.portal_overview(text),
  public.portal_messages(text, boolean),
  public.portal_send_message(text, text, text)
to service_role;

grant execute on function
  public.create_portal_invite(uuid, text),
  public.mark_customer_messages_read(uuid),
  public.message_inbox(integer)
to authenticated;
