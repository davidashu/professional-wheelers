-- Workflow functions and activity-timeline triggers.

-- ---------------------------------------------------------------------------
-- Activity logging
-- ---------------------------------------------------------------------------
create or replace function public.current_actor_type()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when auth.uid() is not null then 'staff'
    else coalesce(nullif(current_setting('app.actor_type', true), ''), 'system')
  end;
$$;

create or replace function public.log_activity(
  p_lead_id uuid,
  p_kind text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb,
  p_quote_id uuid default null,
  p_booking_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (lead_id, booking_id, quote_id, actor_id, actor_type, kind, message, metadata)
  values (
    p_lead_id, p_booking_id, p_quote_id,
    case when exists (select 1 from public.profiles where id = auth.uid()) then auth.uid() end,
    public.current_actor_type(),
    p_kind, p_message, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.stage_label(s public.lead_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'new' then 'New Request'
    when 'contacted' then 'Contacted'
    when 'pricing' then 'Pricing'
    when 'quote_sent' then 'Quote Sent'
    when 'booked' then 'Booked'
    when 'lost' then 'Lost'
  end;
$$;

create or replace function public.shipment_label(s public.shipment_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'awaiting_carrier' then 'Awaiting Carrier'
    when 'carrier_assigned' then 'Carrier Assigned'
    when 'picked_up' then 'Picked Up'
    when 'delivered' then 'Delivered'
  end;
$$;

create or replace function public.money(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$' || to_char(n, 'FM999,999,990.00');
$$;

-- ---------------------------------------------------------------------------
-- Profiles: admins can't lock themselves out
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = auth.uid() and (new.role <> old.role or new.active <> old.active) then
    raise exception 'You cannot change your own role or access.' using errcode = '42501';
  end if;
  if new.email <> old.email then
    raise exception 'Email is managed by authentication.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Leads: guard stage transitions and log changes
-- ---------------------------------------------------------------------------
create or replace function public.guard_lead_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'booked' then
      raise exception 'A booked lead cannot change stage.' using errcode = 'P0001';
    end if;
    if new.status = 'booked' and coalesce(current_setting('app.allow_booked', true), '') <> 'on' then
      raise exception 'A lead becomes Booked only when a quote is accepted.' using errcode = 'P0001';
    end if;
    if new.status = 'quote_sent' and not exists (
      select 1 from public.quotes q where q.lead_id = new.id and q.status = 'sent'
    ) then
      raise exception 'Send a quote before moving this lead to Quote Sent.' using errcode = 'P0001';
    end if;
    if new.status = 'lost' and coalesce(current_setting('app.allow_lost', true), '') <> 'on' then
      raise exception 'Use "Mark lost" to record a reason.' using errcode = 'P0001';
    end if;
    if old.status = 'lost' then
      new.lost_reason := null;
      new.lost_at := null;
    end if;
    if new.status = 'lost' then
      new.lost_at := now();
    end if;
  end if;
  if new.reference <> old.reference or new.submission_key is distinct from old.submission_key then
    raise exception 'Reference fields are read-only.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger leads_guard before update on public.leads
  for each row execute function public.guard_lead_update();

create or replace function public.log_lead_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignee text;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.id, 'lead_created',
      case new.source
        when 'web_form' then 'Quote request ' || new.reference || ' received from the website'
        else 'Lead ' || new.reference || ' created (' || replace(new.source::text, '_', ' ') || ')'
      end,
      jsonb_build_object('source', new.source)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_activity(
      new.id, 'stage_changed',
      case
        when new.status = 'lost' then 'Marked Lost: ' || coalesce(new.lost_reason, '')
        when old.status = 'lost' then 'Reopened as ' || public.stage_label(new.status)
        else 'Stage changed from ' || public.stage_label(old.status) || ' to ' || public.stage_label(new.status)
      end,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    select nullif(full_name, '') into assignee from public.profiles where id = new.assigned_to;
    perform public.log_activity(
      new.id, 'assigned',
      case when new.assigned_to is null then 'Lead unassigned' else 'Assigned to ' || coalesce(assignee, 'a teammate') end,
      jsonb_build_object('assigned_to', new.assigned_to)
    );
  end if;

  if (new.pickup_city, new.pickup_state, new.pickup_zip, new.delivery_city, new.delivery_state, new.delivery_zip,
      new.earliest_pickup_date, new.pickup_date_flexible, new.transport_type)
     is distinct from
     (old.pickup_city, old.pickup_state, old.pickup_zip, old.delivery_city, old.delivery_state, old.delivery_zip,
      old.earliest_pickup_date, old.pickup_date_flexible, old.transport_type) then
    perform public.log_activity(new.id, 'lead_updated', 'Route, pickup date or transport type updated');
  end if;

  return new;
end;
$$;

create trigger leads_activity after insert or update on public.leads
  for each row execute function public.log_lead_change();

-- ---------------------------------------------------------------------------
-- Notes / follow-ups / emails / quotes / bookings: timeline entries
-- ---------------------------------------------------------------------------
create or replace function public.log_note_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_activity(new.lead_id, 'note_added', 'Internal note added',
    jsonb_build_object('excerpt', left(new.body, 140)));
  return new;
end;
$$;

create trigger lead_notes_activity after insert on public.lead_notes
  for each row execute function public.log_note_added();

create or replace function public.log_follow_up_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignee text;
begin
  select coalesce(nullif(full_name, ''), email) into assignee from public.profiles where id = new.assigned_to;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.lead_id, 'follow_up_scheduled',
      'Follow-up scheduled for ' || to_char(new.due_at at time zone 'UTC', 'Mon DD, YYYY') || ' (' || coalesce(assignee, 'unassigned') || ')',
      jsonb_build_object('follow_up_id', new.id, 'due_at', new.due_at));
  elsif new.completed_at is not null and old.completed_at is null then
    perform public.log_activity(new.lead_id, 'follow_up_completed', 'Follow-up completed',
      jsonb_build_object('follow_up_id', new.id));
  elsif new.due_at <> old.due_at or new.assigned_to <> old.assigned_to then
    perform public.log_activity(new.lead_id, 'follow_up_updated',
      'Follow-up moved to ' || to_char(new.due_at at time zone 'UTC', 'Mon DD, YYYY') || ' (' || coalesce(assignee, 'unassigned') || ')',
      jsonb_build_object('follow_up_id', new.id));
  end if;
  return new;
end;
$$;

create trigger follow_ups_activity after insert or update on public.follow_ups
  for each row execute function public.log_follow_up_change();

create or replace function public.log_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'pending' then
      return new;
    end if;
    perform public.log_activity(new.lead_id, 'email_' || new.status::text,
      'Quote email to ' || new.to_email || ': ' || new.status::text
        || case when new.error is not null then ' (' || left(new.error, 200) || ')' else '' end,
      jsonb_build_object('email_delivery_id', new.id, 'status', new.status),
      new.quote_id);
  end if;
  return new;
end;
$$;

create trigger email_deliveries_activity after insert or update on public.email_deliveries
  for each row execute function public.log_email_change();

create or replace function public.log_quote_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.lead_id, 'quote_drafted',
      'Quote v' || new.version || ' drafted at ' || public.money(new.total),
      jsonb_build_object('version', new.version, 'total', new.total), new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_activity(new.lead_id, 'quote_' || new.status::text,
      case new.status
        when 'sent' then 'Quote v' || new.version || ' sent at ' || public.money(new.total)
          || ', valid until ' || to_char(new.expires_at at time zone 'UTC', 'Mon DD, YYYY')
        when 'accepted' then 'Quote v' || new.version || ' accepted'
        when 'declined' then 'Quote v' || new.version || ' declined'
          || case when new.decline_reason is not null then ': ' || new.decline_reason else '' end
        when 'superseded' then 'Quote v' || new.version || ' replaced by a revised quote'
        when 'withdrawn' then 'Quote v' || new.version || ' withdrawn'
        else 'Quote v' || new.version || ' is now ' || new.status::text
      end,
      jsonb_build_object('version', new.version, 'from', old.status, 'to', new.status, 'total', new.total),
      new.id);
  elsif new.status = 'draft' and (new.carrier_pay, new.broker_fee, new.expires_at, new.terms, new.pickup_window_start, new.pickup_window_end)
        is distinct from (old.carrier_pay, old.broker_fee, old.expires_at, old.terms, old.pickup_window_start, old.pickup_window_end) then
    perform public.log_activity(new.lead_id, 'quote_draft_updated',
      'Quote v' || new.version || ' draft updated to ' || public.money(new.total),
      jsonb_build_object('version', new.version, 'total', new.total), new.id);
  end if;

  if new.first_viewed_at is not null and old.first_viewed_at is null then
    perform public.log_activity(new.lead_id, 'quote_viewed',
      'Customer opened quote v' || new.version, jsonb_build_object('version', new.version), new.id);
  end if;
  return new;
end;
$$;

create trigger quotes_activity after insert or update on public.quotes
  for each row execute function public.log_quote_change();

create or replace function public.guard_booking_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lead_id <> old.lead_id or new.quote_id <> old.quote_id or new.customer_id <> old.customer_id
     or new.snapshot <> old.snapshot or new.total_price <> old.total_price or new.reference <> old.reference then
    raise exception 'Booking terms come from the accepted quote and cannot be edited.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'carrier_assigned' and old.carrier_assigned_at is null then
      new.carrier_assigned_at := now();
    elsif new.status = 'picked_up' and old.picked_up_at is null then
      new.picked_up_at := now();
    elsif new.status = 'delivered' and old.delivered_at is null then
      new.delivered_at := now();
    end if;
    if new.status in ('carrier_assigned', 'picked_up', 'delivered') and coalesce(trim(new.carrier_name), '') = '' then
      raise exception 'Enter the carrier name before moving past Awaiting Carrier.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_guard before update on public.bookings
  for each row execute function public.guard_booking_update();

create or replace function public.log_booking_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.lead_id, 'booking_created',
      'Booking ' || new.reference || ' created at ' || public.money(new.total_price) || ' (Awaiting Carrier)',
      jsonb_build_object('booking_reference', new.reference), new.quote_id, new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_activity(new.lead_id, 'shipment_status',
      'Shipment status changed from ' || public.shipment_label(old.status) || ' to ' || public.shipment_label(new.status),
      jsonb_build_object('from', old.status, 'to', new.status), null, new.id);
  end if;

  if new.carrier_name is distinct from old.carrier_name or new.carrier_phone is distinct from old.carrier_phone then
    changed := array_append(changed, 'carrier');
  end if;
  if (new.pickup_address, new.pickup_contact_name, new.pickup_contact_phone)
     is distinct from (old.pickup_address, old.pickup_contact_name, old.pickup_contact_phone) then
    changed := array_append(changed, 'pickup details');
  end if;
  if (new.delivery_address, new.delivery_contact_name, new.delivery_contact_phone)
     is distinct from (old.delivery_address, old.delivery_contact_name, old.delivery_contact_phone) then
    changed := array_append(changed, 'delivery details');
  end if;
  if new.notes is distinct from old.notes then
    changed := array_append(changed, 'notes');
  end if;
  if array_length(changed, 1) > 0 then
    perform public.log_activity(new.lead_id, 'booking_updated',
      'Booking ' || new.reference || ' updated: ' || array_to_string(changed, ', '),
      jsonb_build_object('fields', changed), null, new.id);
  end if;
  return new;
end;
$$;

create trigger bookings_activity after insert or update on public.bookings
  for each row execute function public.log_booking_change();

-- ---------------------------------------------------------------------------
-- Public: submit a quote request (called by the Next.js server, service role)
-- ---------------------------------------------------------------------------
create or replace function public.submit_quote_request(p jsonb, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key uuid := (p ->> 'submission_key')::uuid;
  v_email text := lower(trim(p ->> 'email'));
  v_vehicles jsonb := p -> 'vehicles';
  v_fingerprint text;
  v_existing record;
  v_customer_id uuid;
  v_lead public.leads;
  v_window timestamptz := date_trunc('hour', now());
  v_attempts integer;
  v_vehicle jsonb;
  v_pos integer := 0;
begin
  perform set_config('app.actor_type', 'customer', true);

  if v_key is null then
    raise exception 'missing_submission_key' using errcode = '22023';
  end if;
  if v_vehicles is null or jsonb_typeof(v_vehicles) <> 'array'
     or jsonb_array_length(v_vehicles) < 1 or jsonb_array_length(v_vehicles) > 10 then
    raise exception 'invalid_vehicles' using errcode = '22023';
  end if;
  if (p ->> 'earliest_pickup_date')::date < (now() at time zone 'America/Los_Angeles')::date
     or (p ->> 'earliest_pickup_date')::date > current_date + 365 then
    raise exception 'invalid_pickup_date' using errcode = '22023';
  end if;

  -- 1. Exact retry of the same form submission: return the original reference.
  select reference into v_existing from public.leads where submission_key = v_key;
  if found then
    return jsonb_build_object('reference', v_existing.reference, 'duplicate', true);
  end if;

  -- 2. Rate limit per hashed IP (5 new requests per hour).
  if p_ip_hash is not null then
    insert into public.submission_rate_limits as r (ip_hash, window_start, attempts)
    values (p_ip_hash, v_window, 1)
    on conflict (ip_hash, window_start) do update set attempts = r.attempts + 1
    returning attempts into v_attempts;
    if v_attempts > 5 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    delete from public.submission_rate_limits where window_start < now() - interval '1 day';
  end if;

  -- 3. Same person, same route, same vehicles within 24h: treat as duplicate.
  select md5(
    v_email || '|' || (p ->> 'pickup_zip') || '|' || (p ->> 'delivery_zip') || '|' ||
    coalesce((
      select string_agg(lower(trim(v ->> 'year') || ' ' || trim(v ->> 'make') || ' ' || trim(v ->> 'model')), ';' order by 1)
      from jsonb_array_elements(v_vehicles) v
    ), '')
  ) into v_fingerprint;

  select l.id, l.reference into v_existing
  from public.leads l
  where l.fingerprint = v_fingerprint
    and l.created_at > now() - interval '24 hours'
    and l.status <> 'lost'
  order by l.created_at desc
  limit 1;
  if found then
    perform public.log_activity(v_existing.id, 'duplicate_submission',
      'Customer submitted the same request again; no new lead was created');
    return jsonb_build_object('reference', v_existing.reference, 'duplicate', true);
  end if;

  -- 4. Match or create the customer (never overwrite existing details from a public form).
  select id into v_customer_id from public.customers where lower(email) = v_email;
  if v_customer_id is null then
    insert into public.customers (name, email, phone, company)
    values (trim(p ->> 'name'), v_email, nullif(trim(p ->> 'phone'), ''), nullif(trim(p ->> 'company'), ''))
    on conflict (lower(email)) where email is not null do nothing
    returning id into v_customer_id;
    if v_customer_id is null then
      select id into v_customer_id from public.customers where lower(email) = v_email;
    end if;
  else
    update public.customers
      set phone = coalesce(phone, nullif(trim(p ->> 'phone'), '')),
          company = coalesce(company, nullif(trim(p ->> 'company'), ''))
      where id = v_customer_id;
  end if;

  insert into public.leads (
    customer_id, status, source,
    contact_name, contact_email, contact_phone, contact_company,
    pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip,
    earliest_pickup_date, pickup_date_flexible, transport_type, special_instructions,
    submission_key, fingerprint
  ) values (
    v_customer_id, 'new', 'web_form',
    trim(p ->> 'name'), v_email, nullif(trim(p ->> 'phone'), ''), nullif(trim(p ->> 'company'), ''),
    trim(p ->> 'pickup_city'), upper(p ->> 'pickup_state'), p ->> 'pickup_zip',
    trim(p ->> 'delivery_city'), upper(p ->> 'delivery_state'), p ->> 'delivery_zip',
    (p ->> 'earliest_pickup_date')::date, coalesce((p ->> 'pickup_date_flexible')::boolean, false),
    (p ->> 'transport_type')::public.transport_type, nullif(trim(p ->> 'special_instructions'), ''),
    v_key, v_fingerprint
  )
  on conflict (submission_key) do nothing
  returning * into v_lead;

  if v_lead.id is null then
    -- A concurrent request with the same submission key won the race.
    select reference into v_existing from public.leads where submission_key = v_key;
    return jsonb_build_object('reference', v_existing.reference, 'duplicate', true);
  end if;

  for v_vehicle in select * from jsonb_array_elements(v_vehicles) loop
    insert into public.lead_vehicles (lead_id, position, year, make, model, operable)
    values (v_lead.id, v_pos, (v_vehicle ->> 'year')::smallint, trim(v_vehicle ->> 'make'),
            trim(v_vehicle ->> 'model'), coalesce((v_vehicle ->> 'operable')::boolean, true));
    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object('reference', v_lead.reference, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: create a lead manually (phone, email, referral...)
-- ---------------------------------------------------------------------------
create or replace function public.create_staff_lead(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_email text := nullif(lower(trim(p ->> 'email')), '');
  v_lead_id uuid;
  v_vehicle jsonb;
  v_pos integer := 0;
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p -> 'vehicles', '[]'::jsonb)) < 1 then
    raise exception 'Add at least one vehicle.' using errcode = '22023';
  end if;

  if v_customer_id is null and v_email is not null then
    select id into v_customer_id from public.customers where lower(email) = v_email;
  end if;
  if v_customer_id is null then
    insert into public.customers (name, email, phone, company)
    values (trim(p ->> 'name'), v_email, nullif(trim(p ->> 'phone'), ''), nullif(trim(p ->> 'company'), ''))
    returning id into v_customer_id;
  end if;

  insert into public.leads (
    customer_id, status, source, assigned_to, created_by,
    contact_name, contact_email, contact_phone, contact_company,
    pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip,
    earliest_pickup_date, pickup_date_flexible, transport_type, special_instructions
  )
  select
    v_customer_id, 'new', coalesce(nullif(p ->> 'source', ''), 'phone')::public.lead_source,
    coalesce(nullif(p ->> 'assigned_to', '')::uuid, auth.uid()), auth.uid(),
    coalesce(nullif(trim(p ->> 'name'), ''), c.name),
    coalesce(v_email, c.email),
    coalesce(nullif(trim(p ->> 'phone'), ''), c.phone),
    coalesce(nullif(trim(p ->> 'company'), ''), c.company),
    trim(p ->> 'pickup_city'), upper(p ->> 'pickup_state'), p ->> 'pickup_zip',
    trim(p ->> 'delivery_city'), upper(p ->> 'delivery_state'), p ->> 'delivery_zip',
    (p ->> 'earliest_pickup_date')::date, coalesce((p ->> 'pickup_date_flexible')::boolean, false),
    (p ->> 'transport_type')::public.transport_type, nullif(trim(p ->> 'special_instructions'), '')
  from public.customers c
  where c.id = v_customer_id
  returning id into v_lead_id;

  if v_lead_id is null then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  for v_vehicle in select * from jsonb_array_elements(p -> 'vehicles') loop
    insert into public.lead_vehicles (lead_id, position, year, make, model, operable)
    values (v_lead_id, v_pos, (v_vehicle ->> 'year')::smallint, trim(v_vehicle ->> 'make'),
            trim(v_vehicle ->> 'model'), coalesce((v_vehicle ->> 'operable')::boolean, true));
    v_pos := v_pos + 1;
  end loop;

  if nullif(trim(p ->> 'note'), '') is not null then
    insert into public.lead_notes (lead_id, author_id, body) values (v_lead_id, auth.uid(), trim(p ->> 'note'));
  end if;

  return v_lead_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: move a lead between the manual stages
-- ---------------------------------------------------------------------------
create or replace function public.set_lead_stage(p_lead_id uuid, p_status public.lead_status)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if p_status in ('booked', 'lost') then
    raise exception 'Use quote acceptance or "Mark lost" for this stage.' using errcode = 'P0001';
  end if;
  update public.leads set status = p_status where id = p_lead_id;
  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.mark_lead_lost(p_lead_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to mark a lead lost.' using errcode = '22023';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.status = 'booked' then
    raise exception 'This lead is already booked.' using errcode = 'P0001';
  end if;

  -- The customer link stops working once the lead is lost.
  update public.quotes set status = 'withdrawn' where lead_id = p_lead_id and status = 'sent';

  perform set_config('app.allow_lost', 'on', true);
  update public.leads set status = 'lost', lost_reason = left(trim(p_reason), 500) where id = p_lead_id;
  perform set_config('app.allow_lost', '', true);
end;
$$;

create or replace function public.reopen_lead(p_lead_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  update public.leads set status = 'contacted' where id = p_lead_id and status = 'lost';
  if not found then
    raise exception 'Only lost leads can be reopened.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: quote drafting, sending, withdrawing
-- ---------------------------------------------------------------------------
create or replace function public.save_quote_draft(
  p_lead_id uuid,
  p_carrier_pay numeric,
  p_broker_fee numeric,
  p_pickup_window_start date,
  p_pickup_window_end date,
  p_terms text,
  p_expires_at timestamptz,
  p_internal_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_quote_id uuid;
  v_version integer;
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.status in ('booked', 'lost') then
    raise exception 'Quotes can''t be changed on a % lead.', public.stage_label(v_lead.status) using errcode = 'P0001';
  end if;
  if p_expires_at <= now() then
    raise exception 'Expiration must be in the future.' using errcode = '22023';
  end if;

  select id into v_quote_id from public.quotes where lead_id = p_lead_id and status = 'draft';
  if v_quote_id is null then
    select coalesce(max(version), 0) + 1 into v_version from public.quotes where lead_id = p_lead_id;
    insert into public.quotes (lead_id, version, status, carrier_pay, broker_fee,
      pickup_window_start, pickup_window_end, terms, internal_note, expires_at)
    values (p_lead_id, v_version, 'draft', p_carrier_pay, p_broker_fee,
      p_pickup_window_start, p_pickup_window_end, p_terms, nullif(trim(p_internal_note), ''), p_expires_at)
    returning id into v_quote_id;
  else
    update public.quotes set
      carrier_pay = p_carrier_pay, broker_fee = p_broker_fee,
      pickup_window_start = p_pickup_window_start, pickup_window_end = p_pickup_window_end,
      terms = p_terms, internal_note = nullif(trim(p_internal_note), ''), expires_at = p_expires_at
    where id = v_quote_id;
  end if;

  if v_lead.status in ('new', 'contacted') then
    update public.leads set status = 'pricing' where id = p_lead_id;
  end if;
  return v_quote_id;
end;
$$;

-- Sends a draft: freezes a customer-facing snapshot, stores the link hash,
-- and supersedes the previously sent version so only the latest is valid.
create or replace function public.send_quote(p_quote_id uuid, p_link_id uuid, p_token_hash text)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_lead public.leads;
  v_snapshot jsonb;
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid link hash.' using errcode = '22023';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = v_quote.lead_id for update;
  -- re-read under the lead lock
  select * into v_quote from public.quotes where id = p_quote_id for update;

  if v_quote.status <> 'draft' then
    raise exception 'Only a draft can be sent. Create a revision instead.' using errcode = 'P0001';
  end if;
  if v_lead.status in ('booked', 'lost') then
    raise exception 'Quotes can''t be sent on a % lead.', public.stage_label(v_lead.status) using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= now() then
    raise exception 'This draft''s expiration date has passed. Update it before sending.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'reference', v_lead.reference,
    'customer_name', v_lead.contact_name,
    'pickup', jsonb_build_object('city', v_lead.pickup_city, 'state', v_lead.pickup_state, 'zip', v_lead.pickup_zip),
    'delivery', jsonb_build_object('city', v_lead.delivery_city, 'state', v_lead.delivery_state, 'zip', v_lead.delivery_zip),
    'transport_type', v_lead.transport_type,
    'earliest_pickup_date', v_lead.earliest_pickup_date,
    'pickup_date_flexible', v_lead.pickup_date_flexible,
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'operable', v.operable) order by v.position)
      from public.lead_vehicles v where v.lead_id = v_lead.id
    ), '[]'::jsonb)
  ) into v_snapshot;

  update public.quotes set status = 'superseded' where lead_id = v_lead.id and status = 'sent';

  update public.quotes set
    status = 'sent', sent_at = now(), sent_by = auth.uid(),
    link_id = p_link_id, token_hash = p_token_hash, snapshot = v_snapshot
  where id = p_quote_id
  returning * into v_quote;

  if v_lead.status <> 'quote_sent' then
    update public.leads set status = 'quote_sent' where id = v_lead.id;
  end if;
  return v_quote;
end;
$$;

create or replace function public.withdraw_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  update public.quotes set status = 'withdrawn' where id = p_quote_id and status = 'sent';
  if not found then
    raise exception 'Only an active sent quote can be withdrawn.' using errcode = 'P0001';
  end if;
end;
$$;

-- Issue a fresh customer link for an active quote (e.g. the link leaked or the
-- link secret was rotated). The previous link stops working immediately.
create or replace function public.rotate_quote_link(p_quote_id uuid, p_link_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid link hash.' using errcode = '22023';
  end if;
  update public.quotes set link_id = p_link_id, token_hash = p_token_hash
  where id = p_quote_id and status = 'sent'
  returning * into v_quote;
  if not found then
    raise exception 'Only an active sent quote can get a new link.' using errcode = 'P0001';
  end if;
  perform public.log_activity(v_quote.lead_id, 'quote_link_rotated',
    'New customer link issued for quote v' || v_quote.version || '; the previous link no longer works',
    '{}'::jsonb, v_quote.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Acceptance (shared by the customer link and staff "accepted by phone")
-- ---------------------------------------------------------------------------
create or replace function public.accept_quote_core(p_quote_id uuid, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_lead public.leads;
  v_booking public.bookings;
  v_draft record;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  -- Lock lead then quote (same order as send_quote) so concurrent clicks serialize.
  select * into v_lead from public.leads where id = v_quote.lead_id for update;
  select * into v_quote from public.quotes where id = p_quote_id for update;

  if v_quote.status = 'accepted' then
    select * into v_booking from public.bookings where quote_id = v_quote.id;
    return jsonb_build_object('result', 'already_accepted', 'booking_reference', v_booking.reference,
                              'booking_id', v_booking.id, 'responded_at', v_quote.responded_at);
  end if;
  if v_quote.status <> 'sent' then
    return jsonb_build_object('result', v_quote.status::text);
  end if;
  if v_quote.expires_at <= now() then
    return jsonb_build_object('result', 'expired');
  end if;
  if v_lead.status in ('booked', 'lost') then
    return jsonb_build_object('result', 'unavailable');
  end if;

  update public.quotes set status = 'accepted', responded_at = now(), response_ip_hash = p_ip_hash
  where id = v_quote.id
  returning * into v_quote;

  for v_draft in select id, version from public.quotes where lead_id = v_lead.id and status = 'draft' loop
    delete from public.quotes where id = v_draft.id;
    perform public.log_activity(v_lead.id, 'quote_draft_discarded',
      'Unsent draft v' || v_draft.version || ' discarded because quote v' || v_quote.version || ' was accepted');
  end loop;

  perform set_config('app.allow_booked', 'on', true);
  update public.leads set status = 'booked' where id = v_lead.id;
  perform set_config('app.allow_booked', '', true);

  insert into public.bookings (lead_id, quote_id, customer_id, snapshot, total_price)
  select v_lead.id, v_quote.id, v_lead.customer_id,
    v_quote.snapshot || jsonb_build_object(
      'quote_version', v_quote.version,
      'total', v_quote.total,
      'pickup_window_start', v_quote.pickup_window_start,
      'pickup_window_end', v_quote.pickup_window_end,
      'terms', v_quote.terms,
      'accepted_at', v_quote.responded_at,
      'contact', jsonb_build_object('name', v_lead.contact_name, 'email', v_lead.contact_email,
                                    'phone', v_lead.contact_phone, 'company', v_lead.contact_company)
    ),
    v_quote.total
  on conflict (quote_id) do nothing
  returning * into v_booking;

  if v_booking.id is null then
    select * into v_booking from public.bookings where quote_id = v_quote.id;
  end if;

  return jsonb_build_object('result', 'accepted', 'booking_reference', v_booking.reference,
                            'booking_id', v_booking.id, 'responded_at', v_quote.responded_at);
end;
$$;

create or replace function public.staff_record_acceptance(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  return public.accept_quote_core(p_quote_id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public quote link (service role only; the server passes the token's hash)
-- ---------------------------------------------------------------------------
create or replace function public.quote_public_state(q public.quotes)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when q.status = 'sent' and q.expires_at <= now() then 'expired'
    when q.status = 'sent' then 'active'
    else q.status::text
  end;
$$;

-- Returns ONLY customer-safe fields. Carrier pay, broker fee and internal notes
-- are never selected here.
create or replace function public.get_public_quote(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_state text;
  v_company text;
  v_booking_ref text;
begin
  perform set_config('app.actor_type', 'customer', true);
  select * into v_quote from public.quotes where token_hash = p_token_hash and status <> 'draft';
  if not found then
    return null;
  end if;
  v_state := public.quote_public_state(v_quote);
  select company_name into v_company from public.app_settings where id = 1;

  if v_state in ('superseded', 'withdrawn') then
    return jsonb_build_object('state', v_state, 'company_name', v_company,
                              'reference', v_quote.snapshot ->> 'reference');
  end if;

  if v_quote.first_viewed_at is null and v_state = 'active' then
    update public.quotes set first_viewed_at = now() where id = v_quote.id;
  end if;

  if v_state = 'accepted' then
    select reference into v_booking_ref from public.bookings where quote_id = v_quote.id;
  end if;

  return jsonb_build_object(
    'state', v_state,
    'company_name', v_company,
    'reference', v_quote.snapshot ->> 'reference',
    'version', v_quote.version,
    'customer_name', v_quote.snapshot ->> 'customer_name',
    'pickup', v_quote.snapshot -> 'pickup',
    'delivery', v_quote.snapshot -> 'delivery',
    'transport_type', v_quote.snapshot ->> 'transport_type',
    'vehicles', v_quote.snapshot -> 'vehicles',
    'pickup_window_start', v_quote.pickup_window_start,
    'pickup_window_end', v_quote.pickup_window_end,
    'total', v_quote.total,
    'terms', v_quote.terms,
    'expires_at', v_quote.expires_at,
    'sent_at', v_quote.sent_at,
    'responded_at', v_quote.responded_at,
    'booking_reference', v_booking_ref
  );
end;
$$;

create or replace function public.respond_to_quote(
  p_token_hash text,
  p_action text,
  p_reason text default null,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  perform set_config('app.actor_type', 'customer', true);
  select * into v_quote from public.quotes where token_hash = p_token_hash and status <> 'draft';
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if p_action = 'accept' then
    return public.accept_quote_core(v_quote.id, p_ip_hash);
  elsif p_action = 'decline' then
    select * into v_quote from public.quotes where id = v_quote.id for update;
    if v_quote.status = 'declined' then
      return jsonb_build_object('result', 'already_declined', 'responded_at', v_quote.responded_at);
    end if;
    if v_quote.status = 'accepted' then
      return jsonb_build_object('result', 'already_accepted');
    end if;
    if v_quote.status <> 'sent' then
      return jsonb_build_object('result', v_quote.status::text);
    end if;
    if v_quote.expires_at <= now() then
      return jsonb_build_object('result', 'expired');
    end if;
    update public.quotes set status = 'declined', responded_at = now(),
      decline_reason = nullif(left(trim(p_reason), 1000), ''), response_ip_hash = p_ip_hash
    where id = v_quote.id
    returning * into v_quote;
    return jsonb_build_object('result', 'declined', 'responded_at', v_quote.responded_at);
  end if;

  raise exception 'invalid_action' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Email webhook (service role): update delivery status by provider id
-- ---------------------------------------------------------------------------
create or replace function public.record_email_event(p_provider_message_id text, p_status public.email_status, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.email_status;
  rank_new int;
  rank_cur int;
begin
  select status into v_current from public.email_deliveries where provider_message_id = p_provider_message_id for update;
  if not found then
    return false;
  end if;
  -- Never move backwards (e.g. a late "delayed" after "delivered").
  rank_new := array_position(array['pending','sent','delayed','delivered','bounced','complained','failed']::text[], p_status::text);
  rank_cur := array_position(array['pending','sent','delayed','delivered','bounced','complained','failed']::text[], v_current::text);
  if rank_new <= rank_cur then
    return true;
  end if;
  update public.email_deliveries set status = p_status, error = coalesce(p_error, error)
  where provider_message_id = p_provider_message_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
create or replace function public.search_leads(
  p_query text default null,
  p_status public.lead_status default null,
  p_assigned_to uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, reference text, status public.lead_status, source public.lead_source,
  contact_name text, contact_email text, contact_phone text, contact_company text,
  pickup_city text, pickup_state text, delivery_city text, delivery_state text,
  earliest_pickup_date date, transport_type public.transport_type,
  assigned_to uuid, assigned_name text, vehicle_count bigint, vehicle_summary text,
  created_at timestamptz, updated_at timestamptz, total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select nullif(trim(p_query), '') as term)
  select l.id, l.reference, l.status, l.source,
         l.contact_name, l.contact_email, l.contact_phone, l.contact_company,
         l.pickup_city, l.pickup_state::text, l.delivery_city, l.delivery_state::text,
         l.earliest_pickup_date, l.transport_type,
         l.assigned_to, coalesce(nullif(p.full_name, ''), p.email),
         (select count(*) from public.lead_vehicles v where v.lead_id = l.id),
         (select string_agg(v.year || ' ' || v.make || ' ' || v.model, ', ' order by v.position)
            from public.lead_vehicles v where v.lead_id = l.id),
         l.created_at, l.updated_at,
         count(*) over ()
  from public.leads l
  left join public.profiles p on p.id = l.assigned_to
  cross join q
  where (p_status is null or l.status = p_status)
    and (p_assigned_to is null or l.assigned_to = p_assigned_to)
    and (
      q.term is null
      or l.reference ilike '%' || q.term || '%'
      or l.contact_name ilike '%' || q.term || '%'
      or l.contact_email ilike '%' || q.term || '%'
      or l.contact_phone ilike '%' || q.term || '%'
      or l.contact_company ilike '%' || q.term || '%'
      or l.pickup_city ilike '%' || q.term || '%'
      or l.delivery_city ilike '%' || q.term || '%'
      or l.pickup_zip = q.term or l.delivery_zip = q.term
      or exists (select 1 from public.lead_vehicles v where v.lead_id = l.id
                 and (v.make ilike '%' || q.term || '%' or v.model ilike '%' || q.term || '%'))
    )
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- used by RLS policies and the app
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- staff workflow
grant execute on function public.create_staff_lead(jsonb) to authenticated;
grant execute on function public.set_lead_stage(uuid, public.lead_status) to authenticated;
grant execute on function public.mark_lead_lost(uuid, text) to authenticated;
grant execute on function public.reopen_lead(uuid) to authenticated;
grant execute on function public.save_quote_draft(uuid, numeric, numeric, date, date, text, timestamptz, text) to authenticated;
grant execute on function public.send_quote(uuid, uuid, text) to authenticated;
grant execute on function public.withdraw_quote(uuid) to authenticated;
grant execute on function public.rotate_quote_link(uuid, uuid, text) to authenticated;
grant execute on function public.staff_record_acceptance(uuid) to authenticated;
grant execute on function public.search_leads(text, public.lead_status, uuid, integer, integer) to authenticated;
-- helpers that run inside invoker functions / generated defaults
grant execute on function public.generate_reference(text) to authenticated, service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;
grant execute on function public.stage_label(public.lead_status) to authenticated, service_role;
grant execute on function public.shipment_label(public.shipment_status) to authenticated, service_role;

-- public flows: only the Next.js server (service role) may call these
grant execute on function public.submit_quote_request(jsonb, text) to service_role;
grant execute on function public.get_public_quote(text) to service_role;
grant execute on function public.respond_to_quote(text, text, text, text) to service_role;
grant execute on function public.record_email_event(text, public.email_status, text) to service_role;
