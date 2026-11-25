-- Customer booking portal: after accepting, the customer uses the same secure
-- quote link to give full pickup/delivery addresses and contacts and to sign
-- the booking agreement. Signature details are frozen once submitted.

alter table public.app_settings
  add column booking_agreement_text text not null default
    'Replace this text with your booking agreement in Settings. '
    || 'By signing, the customer authorizes the broker to arrange transport of the vehicle(s) listed above '
    || 'with a licensed and insured motor carrier at the quoted price, confirms the vehicle(s) will be '
    || 'available during the pickup window, and agrees to the quote terms.'
    check (length(trim(booking_agreement_text)) between 1 and 20000);

alter table public.bookings
  add column customer_details_submitted_at timestamptz,
  add column agreement_text text,
  add column agreement_signed_name text check (agreement_signed_name is null or length(agreement_signed_name) <= 120),
  add column agreement_signed_at timestamptz,
  add column agreement_ip_hash text,
  add constraint bookings_agreement_complete check (
    (agreement_signed_at is null and agreement_signed_name is null and agreement_text is null)
    or (agreement_signed_at is not null and agreement_signed_name is not null and agreement_text is not null)
  );

-- Staff can correct addresses, but never alter what the customer signed.
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

  if (new.agreement_text, new.agreement_signed_name, new.agreement_signed_at, new.agreement_ip_hash, new.customer_details_submitted_at)
     is distinct from
     (old.agreement_text, old.agreement_signed_name, old.agreement_signed_at, old.agreement_ip_hash, old.customer_details_submitted_at)
     and coalesce(current_setting('app.allow_agreement', true), '') <> 'on' then
    raise exception 'The signed agreement can only be submitted by the customer.' using errcode = '42501';
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

-- Skip the generic "booking updated" entry when the customer portal writes;
-- submit_booking_details logs one clearer entry instead.
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

  if coalesce(current_setting('app.allow_agreement', true), '') = 'on' then
    return new;
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

-- Public quote view, now with the booking portal section once accepted.
-- Still returns ONLY customer-safe fields.
create or replace function public.get_public_quote(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_state text;
  v_settings public.app_settings;
  v_booking public.bookings;
  v_booking_json jsonb;
begin
  perform set_config('app.actor_type', 'customer', true);
  select * into v_quote from public.quotes where token_hash = p_token_hash and status <> 'draft';
  if not found then
    return null;
  end if;
  v_state := public.quote_public_state(v_quote);
  select * into v_settings from public.app_settings where id = 1;

  if v_state in ('superseded', 'withdrawn') then
    return jsonb_build_object('state', v_state, 'company_name', v_settings.company_name,
                              'reference', v_quote.snapshot ->> 'reference');
  end if;

  if v_quote.first_viewed_at is null and v_state = 'active' then
    update public.quotes set first_viewed_at = now() where id = v_quote.id;
  end if;

  if v_state = 'accepted' then
    select * into v_booking from public.bookings where quote_id = v_quote.id;
    if found then
      v_booking_json := jsonb_build_object(
        'reference', v_booking.reference,
        'details_submitted', v_booking.customer_details_submitted_at is not null,
        'submitted_at', v_booking.customer_details_submitted_at,
        'agreement_text', coalesce(v_booking.agreement_text, v_settings.booking_agreement_text),
        'signed_name', v_booking.agreement_signed_name,
        'signed_at', v_booking.agreement_signed_at,
        'pickup_address', v_booking.pickup_address,
        'pickup_contact_name', v_booking.pickup_contact_name,
        'pickup_contact_phone', v_booking.pickup_contact_phone,
        'delivery_address', v_booking.delivery_address,
        'delivery_contact_name', v_booking.delivery_contact_name,
        'delivery_contact_phone', v_booking.delivery_contact_phone
      );
    end if;
  end if;

  return jsonb_build_object(
    'state', v_state,
    'company_name', v_settings.company_name,
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
    'booking_reference', v_booking.reference,
    'booking', v_booking_json
  );
end;
$$;

-- Customer submits addresses/contacts and signs the agreement (service role only).
create or replace function public.submit_booking_details(p_token_hash text, p jsonb, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_booking public.bookings;
  v_agreement text;
  v_name text := left(trim(coalesce(p ->> 'signed_name', '')), 120);
  f text;
begin
  perform set_config('app.actor_type', 'customer', true);
  select * into v_quote from public.quotes where token_hash = p_token_hash and status <> 'draft';
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_quote.status <> 'accepted' then
    return jsonb_build_object('result', 'not_booked');
  end if;
  select * into v_booking from public.bookings where quote_id = v_quote.id for update;
  if not found then
    return jsonb_build_object('result', 'not_booked');
  end if;
  if v_booking.agreement_signed_at is not null then
    return jsonb_build_object('result', 'already_submitted', 'submitted_at', v_booking.customer_details_submitted_at);
  end if;

  foreach f in array array['pickup_address', 'pickup_contact_name', 'pickup_contact_phone',
                           'delivery_address', 'delivery_contact_name', 'delivery_contact_phone'] loop
    if length(trim(coalesce(p ->> f, ''))) = 0 then
      raise exception 'missing_%', f using errcode = '22023';
    end if;
  end loop;
  if length(v_name) < 2 then
    raise exception 'missing_signature' using errcode = '22023';
  end if;
  if coalesce((p ->> 'agree')::boolean, false) is not true then
    raise exception 'agreement_not_accepted' using errcode = '22023';
  end if;

  select booking_agreement_text into v_agreement from public.app_settings where id = 1;

  perform set_config('app.allow_agreement', 'on', true);
  update public.bookings set
    pickup_address = left(trim(p ->> 'pickup_address'), 300),
    pickup_contact_name = left(trim(p ->> 'pickup_contact_name'), 120),
    pickup_contact_phone = left(trim(p ->> 'pickup_contact_phone'), 30),
    delivery_address = left(trim(p ->> 'delivery_address'), 300),
    delivery_contact_name = left(trim(p ->> 'delivery_contact_name'), 120),
    delivery_contact_phone = left(trim(p ->> 'delivery_contact_phone'), 30),
    notes = case when nullif(trim(p ->> 'customer_notes'), '') is null then notes
                 else concat_ws(E'\n', notes, 'Customer note: ' || left(trim(p ->> 'customer_notes'), 1000)) end,
    customer_details_submitted_at = now(),
    agreement_text = v_agreement,
    agreement_signed_name = v_name,
    agreement_signed_at = now(),
    agreement_ip_hash = p_ip_hash
  where id = v_booking.id
  returning * into v_booking;
  perform set_config('app.allow_agreement', '', true);

  perform public.log_activity(v_booking.lead_id, 'agreement_signed',
    'Customer submitted pickup and delivery details and signed the booking agreement as "' || v_name || '"',
    jsonb_build_object('signed_at', v_booking.agreement_signed_at), v_quote.id, v_booking.id);

  return jsonb_build_object('result', 'submitted', 'submitted_at', v_booking.customer_details_submitted_at);
end;
$$;

revoke execute on function public.submit_booking_details(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_booking_details(text, jsonb, text) to service_role;
revoke execute on function public.get_public_quote(text) from public, anon, authenticated;
grant execute on function public.get_public_quote(text) to service_role;
