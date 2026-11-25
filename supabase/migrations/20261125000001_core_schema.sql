-- Auto transport brokerage CRM: core schema
-- Tables, enums, indexes and helper functions. Security policies live in the
-- next migration; business logic functions in the one after that.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'sales');

create type public.lead_status as enum (
  'new', 'contacted', 'pricing', 'quote_sent', 'booked', 'lost'
);

create type public.lead_source as enum (
  'web_form', 'phone', 'email', 'referral', 'repeat_customer', 'other'
);

create type public.transport_type as enum ('open', 'enclosed');

-- 'expired' is derived from expires_at, never stored, so a quote can never be
-- "active" in one place and "expired" in another.
create type public.quote_status as enum (
  'draft', 'sent', 'accepted', 'declined', 'superseded', 'withdrawn'
);

create type public.shipment_status as enum (
  'awaiting_carrier', 'carrier_assigned', 'picked_up', 'delivered'
);

create type public.email_status as enum (
  'pending', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed'
);

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Human-friendly reference: prefix + 6 chars from an unambiguous alphabet
-- (no 0/O, 1/I/L). 31^6 ≈ 887M combinations; uniqueness enforced by indexes.
create or replace function public.generate_reference(prefix text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  bytes bytea := extensions.gen_random_bytes(6);
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return prefix || '-' || result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role not null default 'sales',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- New auth users get a profile. Only users created by an admin (who set
-- app_metadata.role through the service-role API) are active staff; anyone who
-- signs up some other way gets an inactive profile and no data access.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when meta_role = 'admin' then 'admin'::public.app_role else 'sales'::public.app_role end,
    coalesce(meta_role in ('admin', 'sales'), false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Role helpers used by RLS policies and functions
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'Your Auto Transport Co.',
  default_quote_terms text not null default
    'Price includes door-to-door transport, carrier insurance and all fees. '
    || 'Pickup dates are estimates; a carrier is assigned after booking. '
    || 'Vehicles must be empty of personal items. Payment terms are confirmed at booking.',
  quote_validity_days integer not null default 7 check (quote_validity_days between 1 and 90),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or length(phone) <= 30),
  company text check (company is null or length(company) <= 120),
  notes text check (notes is null or length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One customer record per email so repeat customers are matched, not duplicated.
create unique index customers_email_unique on public.customers (lower(email)) where email is not null;
create index customers_phone_idx on public.customers (phone);
create index customers_search_idx on public.customers
  using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(company, '') || ' ' || coalesce(phone, '')));

create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leads (one per shipment request)
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.generate_reference('Q'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  status public.lead_status not null default 'new',
  source public.lead_source not null default 'web_form',
  assigned_to uuid references public.profiles (id) on delete set null,

  -- contact details as submitted for this request (customer record is canonical)
  contact_name text not null check (length(trim(contact_name)) between 1 and 120),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 30),
  contact_company text check (contact_company is null or length(contact_company) <= 120),

  pickup_city text not null check (length(trim(pickup_city)) between 1 and 80),
  pickup_state char(2) not null check (pickup_state ~ '^[A-Z]{2}$'),
  pickup_zip text not null check (pickup_zip ~ '^\d{5}$'),
  delivery_city text not null check (length(trim(delivery_city)) between 1 and 80),
  delivery_state char(2) not null check (delivery_state ~ '^[A-Z]{2}$'),
  delivery_zip text not null check (delivery_zip ~ '^\d{5}$'),

  earliest_pickup_date date not null,
  pickup_date_flexible boolean not null default false,
  transport_type public.transport_type not null default 'open',
  special_instructions text check (special_instructions is null or length(special_instructions) <= 2000),

  lost_reason text check (lost_reason is null or length(lost_reason) <= 500),
  lost_at timestamptz,

  -- duplicate-submission protection for the public form
  submission_key uuid unique,
  fingerprint text,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_lost_reason_required check (status <> 'lost' or (lost_reason is not null and length(trim(lost_reason)) > 0))
);

create index leads_status_idx on public.leads (status, created_at desc);
create index leads_customer_idx on public.leads (customer_id);
create index leads_assigned_idx on public.leads (assigned_to);
create index leads_fingerprint_idx on public.leads (fingerprint, created_at desc);
create index leads_search_idx on public.leads
  using gin (to_tsvector('simple',
    reference || ' ' || contact_name || ' ' || coalesce(contact_email, '') || ' ' || coalesce(contact_phone, '') || ' '
    || coalesce(contact_company, '') || ' ' || pickup_city || ' ' || delivery_city || ' ' || pickup_zip || ' ' || delivery_zip));

create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

create table public.lead_vehicles (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  position smallint not null default 0,
  year smallint not null check (year between 1900 and 2100),
  make text not null check (length(trim(make)) between 1 and 40),
  model text not null check (length(trim(model)) between 1 and 60),
  operable boolean not null default true,
  notes text check (notes is null or length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index lead_vehicles_lead_idx on public.lead_vehicles (lead_id, position);

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index lead_notes_lead_idx on public.lead_notes (lead_id, created_at desc);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  assigned_to uuid not null references public.profiles (id) on delete restrict,
  due_at timestamptz not null,
  note text check (note is null or length(note) <= 1000),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index follow_ups_open_idx on public.follow_ups (due_at) where completed_at is null;
create index follow_ups_lead_idx on public.follow_ups (lead_id);

-- ---------------------------------------------------------------------------
-- Quotes (versioned per lead)
-- ---------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  version integer not null check (version >= 1),
  status public.quote_status not null default 'draft',

  carrier_pay numeric(10, 2) not null check (carrier_pay >= 0 and carrier_pay <= 1000000),
  broker_fee numeric(10, 2) not null check (broker_fee >= 0 and broker_fee <= 1000000),
  total numeric(10, 2) generated always as (carrier_pay + broker_fee) stored,

  pickup_window_start date not null,
  pickup_window_end date not null,
  terms text not null check (length(trim(terms)) between 1 and 5000),
  internal_note text check (internal_note is null or length(internal_note) <= 2000),
  expires_at timestamptz not null,

  -- Customer link: the raw token is never stored. The app derives it from
  -- link_id with a server secret (HMAC) and stores only its SHA-256 hash.
  link_id uuid unique,
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),

  -- What the customer saw at send time (route, vehicles, contact name).
  snapshot jsonb,

  sent_at timestamptz,
  sent_by uuid references public.profiles (id) on delete set null,
  first_viewed_at timestamptz,
  responded_at timestamptz,
  decline_reason text check (decline_reason is null or length(decline_reason) <= 1000),
  response_ip_hash text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (lead_id, version),
  constraint quotes_window_valid check (pickup_window_end >= pickup_window_start),
  constraint quotes_sent_has_link check (status = 'draft' or (token_hash is not null and sent_at is not null and snapshot is not null))
);

-- At most one draft and at most one live (sent) quote per lead.
create unique index quotes_one_draft_per_lead on public.quotes (lead_id) where status = 'draft';
create unique index quotes_one_sent_per_lead on public.quotes (lead_id) where status = 'sent';
create index quotes_status_idx on public.quotes (status, expires_at);

create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Email deliveries
-- ---------------------------------------------------------------------------
create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes (id) on delete set null,
  lead_id uuid not null references public.leads (id) on delete cascade,
  to_email text not null,
  subject text not null,
  provider text not null default 'resend',
  provider_message_id text unique,
  status public.email_status not null default 'pending',
  error text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_deliveries_lead_idx on public.email_deliveries (lead_id, created_at desc);

create trigger email_deliveries_updated_at before update on public.email_deliveries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.generate_reference('B'),
  lead_id uuid not null unique references public.leads (id) on delete restrict,
  quote_id uuid not null unique references public.quotes (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  status public.shipment_status not null default 'awaiting_carrier',

  -- snapshot of the accepted quote and customer contact at acceptance time
  snapshot jsonb not null,
  total_price numeric(10, 2) not null,

  pickup_address text check (pickup_address is null or length(pickup_address) <= 300),
  pickup_contact_name text check (pickup_contact_name is null or length(pickup_contact_name) <= 120),
  pickup_contact_phone text check (pickup_contact_phone is null or length(pickup_contact_phone) <= 30),
  delivery_address text check (delivery_address is null or length(delivery_address) <= 300),
  delivery_contact_name text check (delivery_contact_name is null or length(delivery_contact_name) <= 120),
  delivery_contact_phone text check (delivery_contact_phone is null or length(delivery_contact_phone) <= 30),

  -- carrier assignment is tracked separately from "Booked"
  carrier_name text check (carrier_name is null or length(carrier_name) <= 120),
  carrier_phone text check (carrier_phone is null or length(carrier_phone) <= 30),
  carrier_assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,

  notes text check (notes is null or length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_status_idx on public.bookings (status, created_at desc);
create index bookings_customer_idx on public.bookings (customer_id);

create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity timeline (append-only)
-- ---------------------------------------------------------------------------
create table public.activities (
  id bigint generated always as identity primary key,
  lead_id uuid references public.leads (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_type text not null default 'staff' check (actor_type in ('staff', 'customer', 'system')),
  kind text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activities_lead_idx on public.activities (lead_id, created_at desc);
create index activities_booking_idx on public.activities (booking_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Public form rate limiting
-- ---------------------------------------------------------------------------
create table public.submission_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 0,
  primary key (ip_hash, window_start)
);
