-- TMS + expanded CRM: roles, customer ownership, carriers, loads with two
-- status bars, invoices, customer portal lane requests.
--
-- Access model after this migration:
--   admin     everything
--   sales     CRM (leads are shared as before); customers assigned to them or
--             not yet assigned; loads for those customers or assigned to them
--   dispatch  TMS only: loads assigned to them, carriers, their tasks
--   customer  portal only, through security-definer portal_* functions and
--             read policies on their own invoices / lane requests

-- ---------------------------------------------------------------------------
-- Profiles: customer users belong to a customer company
-- ---------------------------------------------------------------------------
alter table public.profiles add column customer_id uuid references public.customers (id) on delete cascade;
alter table public.profiles add constraint profiles_customer_link
  check ((role = 'customer') = (customer_id is not null));
create index profiles_customer_idx on public.profiles (customer_id) where customer_id is not null;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_role text := new.raw_app_meta_data ->> 'role';
  meta_customer uuid;
  v_role public.app_role;
begin
  begin
    meta_customer := nullif(new.raw_app_meta_data ->> 'customer_id', '')::uuid;
  exception when invalid_text_representation then
    meta_customer := null;
  end;

  if meta_role = 'customer' and meta_customer is null then
    meta_role := null; -- a customer login without a company gets no access
  end if;

  v_role := case
    when meta_role in ('admin', 'sales', 'dispatch', 'customer') then meta_role::public.app_role
    else 'sales'::public.app_role
  end;

  insert into public.profiles (id, email, full_name, role, active, customer_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_role,
    coalesce(meta_role in ('admin', 'sales', 'dispatch', 'customer'), false),
    case when v_role = 'customer' then meta_customer end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active;
$$;

-- CRM staff (admin + sales). Kept under the old name so every existing policy
-- keeps meaning "people who work the CRM"; dispatch and customers are excluded.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'sales'), false);
$$;

create or replace function public.is_sales()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'sales', false);
$$;

create or replace function public.is_dispatch()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'dispatch', false);
$$;

-- Anyone who works for the brokerage (admin, sales, dispatch).
create or replace function public.is_internal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'sales', 'dispatch'), false);
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.customer_id from public.profiles p
  where p.id = auth.uid() and p.active and p.role = 'customer';
$$;

drop policy "staff read team" on public.profiles;
create policy "internal read team" on public.profiles
  for select to authenticated
  using (public.is_internal() or id = auth.uid());

-- ---------------------------------------------------------------------------
-- Customers: owner (sales rep), billing details, locations
-- ---------------------------------------------------------------------------
alter table public.customers
  add column sales_rep_id uuid references public.profiles (id) on delete set null,
  add column billing_email text check (billing_email is null or billing_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 120),
  add column customer_type text check (customer_type is null or length(customer_type) <= 60);
create index customers_sales_rep_idx on public.customers (sales_rep_id);

create table public.customer_locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  address text check (address is null or length(address) <= 300),
  city text check (city is null or length(city) <= 80),
  state char(2) check (state is null or state ~ '^[A-Z]{2}$'),
  zip text check (zip is null or zip ~ '^\d{5}$'),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 30),
  hours text check (hours is null or length(hours) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_locations_customer_idx on public.customer_locations (customer_id, name);
create trigger customer_locations_updated_at before update on public.customer_locations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Carriers
-- ---------------------------------------------------------------------------
create type public.carrier_standing as enum ('active', 'pending', 'do_not_use');

create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  mc_number text check (mc_number is null or mc_number ~ '^[0-9]{1,8}$'),
  dot_number text check (dot_number is null or dot_number ~ '^[0-9]{1,8}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or length(phone) <= 30),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  standing public.carrier_standing not null default 'pending',
  standing_reason text check (standing_reason is null or length(standing_reason) <= 500),
  auto_liability_amount numeric(12, 2) check (auto_liability_amount is null or auto_liability_amount >= 0),
  cargo_amount numeric(12, 2) check (cargo_amount is null or cargo_amount >= 0),
  insurance_expires_on date,
  agreement_signed_on date,
  lanes text check (lanes is null or length(lanes) <= 1000),
  notes text check (notes is null or length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index carriers_mc_unique on public.carriers (mc_number) where mc_number is not null;
create index carriers_name_idx on public.carriers (lower(name));
create trigger carriers_updated_at before update on public.carriers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Loads (the TMS). A load exists once a quote order is approved. Two
-- independent status bars:
--   customer_status - what the customer sees (Confirmed -> ... -> Customer paid)
--   carrier_status  - carrier side (assigned -> ... -> paid to carrier)
-- ---------------------------------------------------------------------------
create type public.load_customer_status as enum (
  'confirmed', 'dispatched', 'pickup_delayed', 'picked_up', 'running_late', 'pod_received', 'pod_issue',
  'delivered', 'invoiced', 'payment_due', 'paid', 'customer_paid', 'load_issue', 'cancelled'
);
create type public.load_carrier_status as enum (
  'not_assigned', 'assigned', 'rate_con_signed', 'picked_up', 'delivered', 'invoice_received', 'issue', 'paid'
);
create type public.equipment_type as enum (
  'open_car', 'enclosed_car', 'dry_van', 'reefer', 'flatbed', 'ltl', 'heavy_haul', 'drayage', 'air', 'other'
);
create type public.carrier_pay_terms as enum ('quick_pay', 'net_15', 'net_30', 'other');

create sequence public.load_number_seq start 600100;

create table public.loads (
  id uuid primary key default gen_random_uuid(),
  load_number text not null unique default ('PW' || nextval('public.load_number_seq')::text)
    check (length(load_number) between 2 and 30),
  customer_id uuid not null references public.customers (id) on delete restrict,
  customer_ref text check (customer_ref is null or length(customer_ref) <= 80),
  sales_rep_id uuid references public.profiles (id) on delete set null,
  dispatcher_id uuid references public.profiles (id) on delete set null,
  carrier_id uuid references public.carriers (id) on delete restrict,
  equipment public.equipment_type not null default 'open_car',

  origin_location_id uuid references public.customer_locations (id) on delete set null,
  origin_name text check (origin_name is null or length(origin_name) <= 120),
  origin_address text check (origin_address is null or length(origin_address) <= 300),
  origin_city text check (origin_city is null or length(origin_city) <= 80),
  origin_state char(2) check (origin_state is null or origin_state ~ '^[A-Z]{2}$'),
  origin_zip text check (origin_zip is null or origin_zip ~ '^\d{5}$'),
  origin_contact text check (origin_contact is null or length(origin_contact) <= 120),
  origin_phone text check (origin_phone is null or length(origin_phone) <= 30),

  dest_location_id uuid references public.customer_locations (id) on delete set null,
  dest_name text check (dest_name is null or length(dest_name) <= 120),
  dest_address text check (dest_address is null or length(dest_address) <= 300),
  dest_city text check (dest_city is null or length(dest_city) <= 80),
  dest_state char(2) check (dest_state is null or dest_state ~ '^[A-Z]{2}$'),
  dest_zip text check (dest_zip is null or dest_zip ~ '^\d{5}$'),
  dest_contact text check (dest_contact is null or length(dest_contact) <= 120),
  dest_phone text check (dest_phone is null or length(dest_phone) <= 30),

  pickup_date date,
  pickup_window text check (pickup_window is null or length(pickup_window) <= 200),
  delivery_date date,
  delivery_window text check (delivery_window is null or length(delivery_window) <= 200),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  service_date date, -- month a load counts toward for profitability (set by trigger)

  commodity text check (commodity is null or length(commodity) <= 300),
  weight_lbs integer check (weight_lbs is null or weight_lbs between 0 and 200000),
  miles integer check (miles is null or miles between 0 and 10000),

  customer_rate numeric(10, 2) not null default 0 check (customer_rate between 0 and 1000000),
  carrier_rate numeric(10, 2) not null default 0 check (carrier_rate between 0 and 1000000),
  quick_pay_pct numeric(5, 2) not null default 0 check (quick_pay_pct between 0 and 20),
  carrier_pay_terms public.carrier_pay_terms not null default 'quick_pay',
  adjustments numeric(10, 2) not null default 0 check (adjustments between -1000000 and 1000000),
  adjustments_note text check (adjustments_note is null or length(adjustments_note) <= 500),
  quick_pay_fee numeric(10, 2) generated always as (round(carrier_rate * quick_pay_pct / 100, 2)) stored,
  profit numeric(10, 2) generated always as
    (customer_rate - carrier_rate + round(carrier_rate * quick_pay_pct / 100, 2) + adjustments) stored,

  customer_status public.load_customer_status not null default 'confirmed',
  carrier_status public.load_carrier_status not null default 'not_assigned',
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  competitor_price numeric(10, 2) check (competitor_price is null or competitor_price >= 0),
  issue_note text check (issue_note is null or length(issue_note) <= 2000),
  carrier_invoice_number text check (carrier_invoice_number is null or length(carrier_invoice_number) <= 60),
  carrier_paid_at timestamptz,

  special_instructions text check (special_instructions is null or length(special_instructions) <= 2000),
  internal_notes text check (internal_notes is null or length(internal_notes) <= 5000),

  booking_id uuid unique references public.bookings (id) on delete set null,
  lane_request_id uuid unique,

  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint loads_cancel_reason check (customer_status <> 'cancelled' or (cancel_reason is not null and length(trim(cancel_reason)) > 0)),
  constraint loads_issue_note check (
    (carrier_status <> 'issue' and customer_status not in ('pod_issue', 'load_issue'))
    or (issue_note is not null and length(trim(issue_note)) > 0))
);
create index loads_customer_idx on public.loads (customer_id, service_date desc);
create index loads_sales_rep_idx on public.loads (sales_rep_id);
create index loads_dispatcher_idx on public.loads (dispatcher_id);
create index loads_carrier_idx on public.loads (carrier_id);
create index loads_status_idx on public.loads (customer_status, carrier_status);
create index loads_search_idx on public.loads
  using gin (to_tsvector('simple',
    load_number || ' ' || coalesce(customer_ref, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(origin_city, '')
    || ' ' || coalesce(dest_name, '') || ' ' || coalesce(dest_city, '')));
create trigger loads_updated_at before update on public.loads
  for each row execute function public.set_updated_at();

create table public.load_vehicles (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads (id) on delete cascade,
  position smallint not null default 0,
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year smallint check (year is null or year between 1900 and 2100),
  make text check (make is null or length(make) <= 40),
  model text check (model is null or length(model) <= 60),
  operable boolean not null default true,
  notes text check (notes is null or length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index load_vehicles_load_idx on public.load_vehicles (load_id, position);
create index load_vehicles_vin_idx on public.load_vehicles (vin) where vin is not null;

alter table public.activities add column load_id uuid references public.loads (id) on delete cascade;
alter table public.activities add column customer_id uuid references public.customers (id) on delete cascade;
create index activities_load_idx on public.activities (load_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Invoices (one live invoice per load; void and re-issue to correct)
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('open', 'paid', 'void');
create sequence public.invoice_number_seq start 1001;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('INV-' || nextval('public.invoice_number_seq')::text),
  load_id uuid not null references public.loads (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  amount numeric(10, 2) not null check (amount between 0 and 1000000),
  issued_on date not null default current_date,
  due_on date not null default current_date,
  status public.invoice_status not null default 'open',
  paid_on date,
  sent_at timestamptz,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_due_after_issue check (due_on >= issued_on),
  constraint invoices_paid_on check ((status = 'paid') = (paid_on is not null))
);
create unique index invoices_one_live_per_load on public.invoices (load_id) where status <> 'void';
create index invoices_customer_idx on public.invoices (customer_id, issued_on desc);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Quote orders: a lane the customer (portal) or staff (phone/email) posts for
-- pricing. Statuses: new (posted) -> quoted -> approved | too_high | too_low |
-- cancelled. Too high / too low can be re-quoted. Approved creates the load.
-- ---------------------------------------------------------------------------
create type public.lane_request_status as enum ('new', 'quoted', 'approved', 'too_high', 'too_low', 'cancelled');

create table public.lane_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.generate_reference('L'),
  customer_id uuid not null references public.customers (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  origin_city text not null check (length(trim(origin_city)) between 1 and 80),
  origin_state char(2) not null check (origin_state ~ '^[A-Z]{2}$'),
  origin_zip text check (origin_zip is null or origin_zip ~ '^\d{5}$'),
  dest_city text not null check (length(trim(dest_city)) between 1 and 80),
  dest_state char(2) not null check (dest_state ~ '^[A-Z]{2}$'),
  dest_zip text check (dest_zip is null or dest_zip ~ '^\d{5}$'),
  equipment public.equipment_type not null default 'open_car',
  description text not null check (length(trim(description)) between 1 and 1000),
  pickup_date date,
  notes text check (notes is null or length(notes) <= 2000),
  status public.lane_request_status not null default 'new',
  quoted_rate numeric(10, 2) check (quoted_rate is null or quoted_rate between 0 and 1000000),
  quote_note text check (quote_note is null or length(quote_note) <= 2000),
  quoted_by uuid references public.profiles (id) on delete set null,
  quoted_at timestamptz,
  responded_at timestamptz,
  response_note text check (response_note is null or length(response_note) <= 500),
  target_rate numeric(10, 2) check (target_rate is null or target_rate between 0 and 1000000),
  load_id uuid references public.loads (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lane_requests_quoted_has_rate check (status in ('new', 'cancelled') or quoted_rate is not null)
);
create index lane_requests_customer_idx on public.lane_requests (customer_id, created_at desc);
create index lane_requests_status_idx on public.lane_requests (status, created_at desc);
create trigger lane_requests_updated_at before update on public.lane_requests
  for each row execute function public.set_updated_at();
alter table public.loads add constraint loads_lane_request_fk
  foreign key (lane_request_id) references public.lane_requests (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Visibility helpers (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.can_see_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'sales' then exists (
      select 1 from public.customers c
      where c.id = p_customer_id
        and (c.sales_rep_id = auth.uid() or c.sales_rep_id is null
             or exists (select 1 from public.leads l where l.customer_id = c.id and l.assigned_to = auth.uid())
             or exists (select 1 from public.loads ld where ld.customer_id = c.id and ld.sales_rep_id = auth.uid()))
    )
    when 'dispatch' then exists (
      select 1 from public.loads ld where ld.customer_id = p_customer_id and ld.dispatcher_id = auth.uid()
    )
    when 'customer' then p_customer_id = public.current_customer_id()
    else false
  end;
$$;

-- Customer is owned by the signed-in sales rep.
create or replace function public.is_my_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.customers c where c.id = p_customer_id and c.sales_rep_id = auth.uid());
$$;

create or replace function public.can_see_load(p_load_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.current_app_role()
    when 'admin' then true
    when 'sales' then exists (
      select 1 from public.loads ld join public.customers c on c.id = ld.customer_id
      where ld.id = p_load_id and (ld.sales_rep_id = auth.uid() or c.sales_rep_id = auth.uid())
    )
    when 'dispatch' then exists (
      select 1 from public.loads ld where ld.id = p_load_id and ld.dispatcher_id = auth.uid()
    )
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Guards and bookkeeping triggers
-- ---------------------------------------------------------------------------

-- Sales may claim an unassigned customer for themselves; only admins reassign.
create or replace function public.guard_customer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sales_rep_id is distinct from old.sales_rep_id and not coalesce(public.current_app_role() = 'admin', false)
     and auth.uid() is not null then
    if not (old.sales_rep_id is null and new.sales_rep_id = auth.uid()) then
      raise exception 'Only an admin can reassign a customer''s sales rep.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger customers_guard before update on public.customers
  for each row execute function public.guard_customer_update();

create or replace function public.customer_status_rank(s public.load_customer_status)
returns integer
language sql
immutable
set search_path = ''
as $$
  select array_position(array['confirmed','dispatched','pickup_delayed','picked_up','running_late','pod_received',
    'pod_issue','delivered','invoiced','payment_due','paid','customer_paid','load_issue','cancelled']::text[], s::text);
$$;

create or replace function public.customer_status_label(s public.load_customer_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'confirmed' then 'Confirmed' when 'dispatched' then 'Dispatched' when 'pickup_delayed' then 'Pick up delayed'
    when 'picked_up' then 'Picked up' when 'running_late' then 'Running late' when 'pod_received' then 'POD received'
    when 'pod_issue' then 'POD issue' when 'delivered' then 'Delivered' when 'invoiced' then 'Invoiced to customer'
    when 'payment_due' then 'Payment due' when 'paid' then 'Paid (carrier)' when 'customer_paid' then 'Customer paid'
    when 'load_issue' then 'Load issue' when 'cancelled' then 'Cancelled'
  end;
$$;

create or replace function public.carrier_status_label(s public.load_carrier_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'not_assigned' then 'No carrier' when 'assigned' then 'Carrier assigned'
    when 'rate_con_signed' then 'Rate con signed' when 'picked_up' then 'Picked up'
    when 'delivered' then 'Delivered' when 'invoice_received' then 'Carrier invoice received'
    when 'issue' then 'Issue / claim' when 'paid' then 'Paid to carrier'
  end;
$$;

create or replace function public.guard_load_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
  v_standing public.carrier_standing;
begin
  -- Dispatch runs operations; money on the customer side and ownership are not theirs to change.
  if tg_op = 'UPDATE' and v_role = 'dispatch' then
    if new.customer_id is distinct from old.customer_id
       or new.customer_rate is distinct from old.customer_rate
       or new.sales_rep_id is distinct from old.sales_rep_id
       or new.dispatcher_id is distinct from old.dispatcher_id
       or new.adjustments is distinct from old.adjustments then
      raise exception 'Dispatch can''t change the customer, customer rate, adjustments or assignments.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and v_role = 'sales' and new.dispatcher_id is distinct from old.dispatcher_id then
    null; -- sales may hand a load to a dispatcher
  end if;

  -- A sales rep creating a load owns it unless they name someone else.
  if tg_op = 'INSERT' and v_role = 'sales' and new.sales_rep_id is null then
    new.sales_rep_id := auth.uid();
  end if;

  -- A carrier must be on the load before either bar moves past booking.
  if new.carrier_id is null then
    if new.carrier_status <> 'not_assigned' then
      raise exception 'Assign a carrier before changing the carrier status.' using errcode = 'P0001';
    end if;
    if new.customer_status in ('dispatched', 'pickup_delayed', 'picked_up', 'running_late', 'pod_received', 'pod_issue', 'delivered') then
      raise exception 'Assign a carrier before marking the load %.', public.customer_status_label(new.customer_status)
        using errcode = 'P0001';
    end if;
  elsif new.carrier_id is distinct from (case when tg_op = 'UPDATE' then old.carrier_id end) then
    select standing into v_standing from public.carriers where id = new.carrier_id;
    if v_standing = 'do_not_use' then
      raise exception 'This carrier is marked Do not use.' using errcode = 'P0001';
    end if;
    if new.carrier_status = 'not_assigned' then
      new.carrier_status := 'assigned';
    end if;
  end if;

  -- Timestamps follow the status bars.
  if new.customer_status in ('picked_up', 'running_late', 'pod_received', 'pod_issue', 'delivered', 'invoiced', 'payment_due', 'paid', 'customer_paid')
     or new.carrier_status in ('picked_up', 'delivered', 'invoice_received', 'paid') then
    new.picked_up_at := coalesce(new.picked_up_at, now());
  end if;
  if new.customer_status in ('pod_received', 'pod_issue', 'delivered', 'invoiced', 'payment_due', 'paid', 'customer_paid')
     or new.carrier_status in ('delivered', 'invoice_received', 'paid') then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  if new.carrier_status = 'paid' then
    new.carrier_paid_at := coalesce(new.carrier_paid_at, now());
    -- "Paid" on the customer bar means we paid the carrier; "Customer paid"
    -- means the customer paid us. Paying the carrier first moves the bar to
    -- Paid; it never moves a load back from Customer paid.
    if new.customer_status in ('pod_received', 'delivered', 'invoiced', 'payment_due') then
      new.customer_status := 'paid';
    end if;
  end if;
  if new.customer_status = 'paid' and new.carrier_status <> 'paid' then
    raise exception 'Paid means the carrier has been paid. Mark the carrier bar Paid first.' using errcode = 'P0001';
  end if;

  new.service_date := coalesce((new.delivered_at at time zone 'America/Denver')::date, new.pickup_date,
                               (coalesce(new.created_at, now()) at time zone 'America/Denver')::date);
  return new;
end;
$$;
create trigger loads_guard before insert or update on public.loads
  for each row execute function public.guard_load_write();

create or replace function public.log_load_activity(p_load_id uuid, p_customer_id uuid, p_kind text, p_message text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (load_id, customer_id, actor_id, actor_type, kind, message, metadata)
  values (
    p_load_id, p_customer_id,
    case when exists (select 1 from public.profiles where id = auth.uid()) then auth.uid() end,
    case
      when public.current_app_role() = 'customer' then 'customer'
      else public.current_actor_type()
    end,
    p_kind, p_message, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.log_load_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carrier text;
begin
  if tg_op = 'INSERT' then
    perform public.log_load_activity(new.id, new.customer_id, 'load_created', 'Load ' || new.load_number || ' created');
    return new;
  end if;
  if new.customer_status is distinct from old.customer_status then
    perform public.log_load_activity(new.id, new.customer_id, 'customer_status',
      'Customer status: ' || public.customer_status_label(old.customer_status) || ' → ' || public.customer_status_label(new.customer_status)
      || case when new.customer_status = 'cancelled' then ' (' || new.cancel_reason || ')'
              when new.customer_status in ('pod_issue', 'load_issue') then ' (' || new.issue_note || ')' else '' end,
      jsonb_build_object('from', old.customer_status, 'to', new.customer_status));
  end if;
  if new.carrier_status is distinct from old.carrier_status then
    perform public.log_load_activity(new.id, new.customer_id, 'carrier_status',
      'Carrier status: ' || public.carrier_status_label(old.carrier_status) || ' → ' || public.carrier_status_label(new.carrier_status)
      || case when new.carrier_status = 'issue' then ' (' || new.issue_note || ')' else '' end,
      jsonb_build_object('from', old.carrier_status, 'to', new.carrier_status));
  end if;
  if new.carrier_id is distinct from old.carrier_id then
    select name into v_carrier from public.carriers where id = new.carrier_id;
    perform public.log_load_activity(new.id, new.customer_id, 'carrier_changed',
      coalesce('Carrier set to ' || v_carrier, 'Carrier removed'));
  end if;
  if new.customer_rate is distinct from old.customer_rate or new.carrier_rate is distinct from old.carrier_rate
     or new.adjustments is distinct from old.adjustments or new.quick_pay_pct is distinct from old.quick_pay_pct then
    perform public.log_load_activity(new.id, new.customer_id, 'rates_changed',
      'Rates: customer ' || public.money(new.customer_rate) || ', carrier ' || public.money(new.carrier_rate)
      || ', profit ' || public.money(new.profit));
  end if;
  return new;
end;
$$;
create trigger loads_activity after insert or update on public.loads
  for each row execute function public.log_load_change();

-- Invoices drive the customer status bar.
create or replace function public.sync_invoice_to_load()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    update public.loads set customer_status = 'invoiced'
    where id = new.load_id and customer_status in ('pod_received', 'delivered');
    perform public.log_load_activity(new.load_id, new.customer_id, 'invoice_issued',
      'Invoice ' || new.invoice_number || ' issued for ' || public.money(new.amount));
  elsif new.status = 'paid' and tg_op = 'UPDATE' and old.status <> 'paid' then
    update public.loads set customer_status = 'customer_paid'
    where id = new.load_id and customer_status in ('invoiced', 'payment_due', 'paid');
    perform public.log_load_activity(new.load_id, new.customer_id, 'invoice_paid',
      'Invoice ' || new.invoice_number || ' marked paid');
  elsif new.status = 'void' and tg_op = 'UPDATE' and old.status <> 'void' then
    update public.loads set customer_status = case when carrier_status = 'paid' then 'paid'::public.load_customer_status else 'delivered' end
    where id = new.load_id and customer_status in ('invoiced', 'payment_due', 'paid', 'customer_paid');
    perform public.log_load_activity(new.load_id, new.customer_id, 'invoice_void',
      'Invoice ' || new.invoice_number || ' voided');
  end if;
  return new;
end;
$$;
create trigger invoices_sync after insert or update on public.invoices
  for each row execute function public.sync_invoice_to_load();

create or replace function public.guard_invoice_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_load public.loads;
begin
  select * into v_load from public.loads where id = new.load_id;
  if v_load.customer_status = 'cancelled' then
    raise exception 'A cancelled load can''t be invoiced.' using errcode = 'P0001';
  end if;
  new.customer_id := v_load.customer_id;
  if tg_op = 'UPDATE' and old.status = 'void' and new.status <> 'void' then
    raise exception 'A voided invoice can''t be reopened. Issue a new one.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.amount <> old.amount or new.invoice_number <> old.invoice_number) and old.status <> 'open' then
    raise exception 'Paid or voided invoices can''t be edited.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger invoices_guard before insert or update on public.invoices
  for each row execute function public.guard_invoice_write();

-- Accepted web quotes (existing bookings flow) become TMS loads automatically.
create or replace function public.create_load_from_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_quote public.quotes;
  v_load_id uuid;
begin
  select * into v_lead from public.leads where id = new.lead_id;
  select * into v_quote from public.quotes where id = new.quote_id;
  insert into public.loads (
    customer_id, sales_rep_id, equipment, origin_city, origin_state, origin_zip,
    dest_city, dest_state, dest_zip, pickup_date, customer_rate, carrier_rate,
    customer_status, booking_id, special_instructions, created_by
  ) values (
    new.customer_id, v_lead.assigned_to,
    case when v_lead.transport_type = 'enclosed' then 'enclosed_car'::public.equipment_type else 'open_car'::public.equipment_type end,
    v_lead.pickup_city, v_lead.pickup_state, v_lead.pickup_zip,
    v_lead.delivery_city, v_lead.delivery_state, v_lead.delivery_zip,
    v_quote.pickup_window_start, new.total_price, v_quote.carrier_pay,
    'confirmed', new.id, v_lead.special_instructions, null
  )
  returning id into v_load_id;

  insert into public.load_vehicles (load_id, position, year, make, model, operable, notes)
  select v_load_id, lv.position, lv.year, lv.make, lv.model, lv.operable, lv.notes
  from public.lead_vehicles lv where lv.lead_id = new.lead_id;
  return new;
end;
$$;
create trigger bookings_create_load after insert on public.bookings
  for each row execute function public.create_load_from_booking();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.customer_locations enable row level security;
alter table public.carriers enable row level security;
alter table public.loads enable row level security;
alter table public.load_vehicles enable row level security;
alter table public.invoices enable row level security;
alter table public.lane_requests enable row level security;

grant select, insert, update, delete on public.customer_locations, public.carriers, public.loads,
  public.load_vehicles, public.invoices, public.lane_requests to authenticated;
grant all on public.customer_locations, public.carriers, public.loads,
  public.load_vehicles, public.invoices, public.lane_requests to service_role;
grant usage, select on public.load_number_seq, public.invoice_number_seq to authenticated, service_role;

-- customers: replace "every staff member sees every customer"
drop policy "staff read customers" on public.customers;
drop policy "staff update customers" on public.customers;
-- Customer logins read their company through portal functions (customers.notes is internal).
create policy "read visible customers" on public.customers
  for select to authenticated using (public.is_internal() and public.can_see_customer(id));
create policy "crm staff update visible customers" on public.customers
  for update to authenticated
  using (public.is_staff() and public.can_see_customer(id))
  with check (public.is_staff());

-- customer locations
create policy "read locations of visible customers" on public.customer_locations
  for select to authenticated using (public.can_see_customer(customer_id));
create policy "crm staff manage locations" on public.customer_locations
  for all to authenticated
  using (public.is_staff() and public.can_see_customer(customer_id))
  with check (public.is_staff() and public.can_see_customer(customer_id));

-- carriers: whole brokerage reads; admin and dispatch maintain
create policy "internal read carriers" on public.carriers
  for select to authenticated using (public.is_internal());
create policy "admin and dispatch add carriers" on public.carriers
  for insert to authenticated with check (public.current_app_role() in ('admin', 'dispatch'));
create policy "admin and dispatch edit carriers" on public.carriers
  for update to authenticated
  using (public.current_app_role() in ('admin', 'dispatch'))
  with check (public.current_app_role() in ('admin', 'dispatch'));
create policy "admin delete carriers" on public.carriers
  for delete to authenticated using (public.is_admin());

-- loads: customers never read this table directly (portal functions hide carrier pay)
-- Policies on loads use the row's own columns (a lookup by id can't see a row
-- that is being inserted); child tables use can_see_load().
create policy "read visible loads" on public.loads
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_sales() and (sales_rep_id = auth.uid() or public.is_my_customer(customer_id)))
    or (public.is_dispatch() and dispatcher_id = auth.uid())
  );
create policy "crm staff create loads" on public.loads
  for insert to authenticated
  with check (public.is_admin() or (public.is_sales() and public.can_see_customer(customer_id)
                                   and sales_rep_id = auth.uid()));
create policy "update visible loads" on public.loads
  for update to authenticated
  using (
    public.is_admin()
    or (public.is_sales() and (sales_rep_id = auth.uid() or public.is_my_customer(customer_id)))
    or (public.is_dispatch() and dispatcher_id = auth.uid())
  )
  with check (public.is_admin() or (public.is_sales() and public.can_see_customer(customer_id))
              or (public.is_dispatch() and dispatcher_id = auth.uid()));
create policy "admin delete loads" on public.loads
  for delete to authenticated using (public.is_admin());

create policy "read vehicles of visible loads" on public.load_vehicles
  for select to authenticated using (public.can_see_load(load_id));
create policy "manage vehicles of visible loads" on public.load_vehicles
  for all to authenticated using (public.can_see_load(load_id)) with check (public.can_see_load(load_id));

-- invoices: admin and sales manage; customers read their own
create policy "read invoices" on public.invoices
  for select to authenticated
  using ((public.is_staff() and public.can_see_load(load_id)) or customer_id = public.current_customer_id());
create policy "crm staff issue invoices" on public.invoices
  for insert to authenticated with check (public.is_staff() and public.can_see_load(load_id));
create policy "crm staff update invoices" on public.invoices
  for update to authenticated
  using (public.is_staff() and public.can_see_load(load_id))
  with check (public.is_staff() and public.can_see_load(load_id));

-- lane requests: customers read their own; staff quote them
create policy "read lane requests" on public.lane_requests
  for select to authenticated
  using ((public.is_staff() and public.can_see_customer(customer_id)) or customer_id = public.current_customer_id());
create policy "crm staff post quote orders" on public.lane_requests
  for insert to authenticated
  with check (public.is_staff() and public.can_see_customer(customer_id) and status = 'new');
create policy "crm staff quote lane requests" on public.lane_requests
  for update to authenticated
  using (public.is_staff() and public.can_see_customer(customer_id))
  with check (public.is_staff() and public.can_see_customer(customer_id));

-- activities: load/customer entries readable by whoever can see the load
drop policy "staff read activity" on public.activities;
create policy "read activity" on public.activities
  for select to authenticated
  using (
    (public.is_staff() and load_id is null)
    or (load_id is not null and public.can_see_load(load_id))
  );

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------

-- Price a quote order (staff). Re-quoting is allowed after Too high / Too low.
create or replace function public.quote_lane_request(p_id uuid, p_rate numeric, p_note text default null)
returns public.lane_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.lane_requests;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'Enter a rate above zero.' using errcode = '22023';
  end if;
  update public.lane_requests
     set status = 'quoted', quoted_rate = p_rate, quote_note = nullif(trim(p_note), ''),
         quoted_by = auth.uid(), quoted_at = now(), responded_at = null, response_note = null
   where id = p_id and status in ('new', 'quoted', 'too_high', 'too_low')
  returning * into v;
  if v.id is null then
    raise exception 'This quote order can no longer be quoted.' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Records the customer's answer to a quote: approved, too_high, too_low or
-- cancelled. Approved creates the load (customer status Confirmed). Used by the
-- portal and by staff recording a phone/email answer.
create or replace function public.respond_quote_order_core(p_id uuid, p_response text, p_note text, p_target numeric)
returns public.lane_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.lane_requests;
  v_rep uuid;
  v_load uuid;
begin
  if p_response not in ('approved', 'too_high', 'too_low', 'cancelled') then
    raise exception 'Unknown response.' using errcode = '22023';
  end if;
  select * into v from public.lane_requests where id = p_id for update;
  if v.id is null then
    raise exception 'Quote order not found.' using errcode = 'P0002';
  end if;
  if v.status = 'approved' and p_response = 'approved' then
    return v; -- idempotent double click
  end if;
  if p_response = 'cancelled' then
    if v.status in ('approved', 'cancelled') then
      raise exception 'This quote order is already %.', v.status using errcode = 'P0001';
    end if;
  elsif v.status <> 'quoted' then
    raise exception 'This quote order has no open price to answer.' using errcode = 'P0001';
  end if;

  if p_response <> 'approved' then
    update public.lane_requests set status = p_response::public.lane_request_status, responded_at = now(),
      response_note = nullif(trim(p_note), ''), target_rate = coalesce(p_target, target_rate)
    where id = v.id returning * into v;
    return v;
  end if;

  select sales_rep_id into v_rep from public.customers where id = v.customer_id;
  insert into public.loads (customer_id, sales_rep_id, equipment, origin_city, origin_state, origin_zip,
    dest_city, dest_state, dest_zip, pickup_date, commodity, customer_rate, customer_status,
    lane_request_id, special_instructions, created_by)
  values (v.customer_id, v_rep, v.equipment, v.origin_city, v.origin_state, v.origin_zip,
    v.dest_city, v.dest_state, v.dest_zip, v.pickup_date, left(v.description, 300), v.quoted_rate, 'confirmed',
    v.id, v.notes, null)
  returning id into v_load;

  update public.lane_requests set status = 'approved', responded_at = now(), load_id = v_load,
    response_note = nullif(trim(p_note), '')
  where id = v.id returning * into v;
  return v;
end;
$$;

create or replace function public.staff_respond_quote_order(p_id uuid, p_response text, p_note text default null, p_target numeric default null)
returns public.lane_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
begin
  select customer_id into v_customer from public.lane_requests where id = p_id;
  if not (public.is_staff() and public.can_see_customer(v_customer)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return public.respond_quote_order_core(p_id, p_response, p_note, p_target);
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer portal functions (safe columns only; no carrier pay or profit)
-- ---------------------------------------------------------------------------
create or replace function public.portal_loads()
returns table (
  id uuid, load_number text, customer_ref text, equipment public.equipment_type,
  origin_name text, origin_city text, origin_state char(2),
  dest_name text, dest_city text, dest_state char(2),
  pickup_date date, delivery_date date, picked_up_at timestamptz, delivered_at timestamptz,
  customer_status public.load_customer_status, customer_rate numeric, vehicles jsonb, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.load_number, l.customer_ref, l.equipment,
         l.origin_name, l.origin_city, l.origin_state, l.dest_name, l.dest_city, l.dest_state,
         l.pickup_date, l.delivery_date, l.picked_up_at, l.delivered_at,
         case when l.customer_status = 'paid'
              then case when exists (select 1 from public.invoices i where i.load_id = l.id and i.status = 'open')
                        then 'payment_due'::public.load_customer_status else 'delivered'::public.load_customer_status end
              else l.customer_status end,
         l.customer_rate,
         coalesce((select jsonb_agg(jsonb_build_object('vin', v.vin, 'year', v.year, 'make', v.make, 'model', v.model) order by v.position)
                   from public.load_vehicles v where v.load_id = l.id), '[]'::jsonb),
         l.created_at
  from public.loads l
  where l.customer_id = public.current_customer_id()
  order by l.created_at desc;
$$;

create or replace function public.portal_load_history(p_load_id uuid)
returns table (created_at timestamptz, message text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.created_at, a.message
  from public.activities a
  join public.loads l on l.id = a.load_id
  where a.load_id = p_load_id
    and l.customer_id = public.current_customer_id()
    and a.kind in ('load_created', 'customer_status', 'invoice_issued', 'invoice_paid')
    -- moves into or out of "Paid (carrier)" are internal
    and not (a.kind = 'customer_status' and 'paid' in (a.metadata ->> 'from', a.metadata ->> 'to'))
  order by a.created_at;
$$;

create or replace function public.portal_request_lane(p jsonb)
returns public.lane_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := public.current_customer_id();
  v public.lane_requests;
begin
  if v_customer is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.lane_requests
      where customer_id = v_customer and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many requests in the last hour. Please call us.' using errcode = 'P0001';
  end if;
  insert into public.lane_requests (customer_id, requested_by, origin_city, origin_state, origin_zip,
    dest_city, dest_state, dest_zip, equipment, description, pickup_date, notes)
  values (v_customer, auth.uid(), trim(p ->> 'origin_city'), upper(p ->> 'origin_state'), nullif(p ->> 'origin_zip', ''),
    trim(p ->> 'dest_city'), upper(p ->> 'dest_state'), nullif(p ->> 'dest_zip', ''),
    coalesce(nullif(p ->> 'equipment', ''), 'open_car')::public.equipment_type,
    trim(p ->> 'description'), nullif(p ->> 'pickup_date', '')::date, nullif(trim(p ->> 'notes'), ''))
  returning * into v;
  return v;
end;
$$;

create or replace function public.portal_respond_lane(p_id uuid, p_response text, p_note text default null, p_target numeric default null)
returns public.lane_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_customer_id() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lane_requests where id = p_id and customer_id = public.current_customer_id()) then
    raise exception 'Quote order not found.' using errcode = 'P0002';
  end if;
  return public.respond_quote_order_core(p_id, p_response, p_note, p_target);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.is_sales() to authenticated, service_role;
grant execute on function public.is_dispatch() to authenticated, service_role;
grant execute on function public.is_internal() to authenticated, service_role;
grant execute on function public.current_customer_id() to authenticated, service_role;
grant execute on function public.can_see_customer(uuid) to authenticated, service_role;
grant execute on function public.can_see_load(uuid) to authenticated, service_role;
grant execute on function public.is_my_customer(uuid) to authenticated, service_role;
grant execute on function public.customer_status_rank(public.load_customer_status) to authenticated, service_role;
grant execute on function public.customer_status_label(public.load_customer_status) to authenticated, service_role;
grant execute on function public.carrier_status_label(public.load_carrier_status) to authenticated, service_role;
grant execute on function public.quote_lane_request(uuid, numeric, text) to authenticated;
grant execute on function public.portal_loads() to authenticated;
grant execute on function public.portal_load_history(uuid) to authenticated;
grant execute on function public.portal_request_lane(jsonb) to authenticated;
grant execute on function public.portal_respond_lane(uuid, text, text, numeric) to authenticated;
grant execute on function public.staff_respond_quote_order(uuid, text, text, numeric) to authenticated;
-- money() is used inside triggers that run as the invoking user
grant execute on function public.money(numeric) to authenticated, service_role;
grant execute on function public.current_actor_type() to authenticated, service_role;
