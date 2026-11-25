-- Demo data for local development and staging. Safe to re-run on an empty
-- database (supabase db reset). Do not run against production.
--
-- Demo staff (password for all: DemoPassw0rd!) - change or delete before go-live:
--   admin@demo.autotransport.test   Admin  (Morgan Reyes)
--   jordan@demo.autotransport.test  Sales  (Jordan Patel)
--   casey@demo.autotransport.test   Sales  (Casey Nguyen)

-- ---------------------------------------------------------------------------
-- Staff users (the on_auth_user_created trigger creates active profiles
-- because app_metadata.role is set)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'admin@demo.autotransport.test', extensions.crypt('DemoPassw0rd!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"admin"}', '{"full_name":"Morgan Reyes"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'jordan@demo.autotransport.test', extensions.crypt('DemoPassw0rd!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"sales"}', '{"full_name":"Jordan Patel"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'casey@demo.autotransport.test', extensions.crypt('DemoPassw0rd!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"sales"}', '{"full_name":"Casey Nguyen"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')
on conflict (provider_id, provider) do nothing;

-- Curated history below: switch off the activity/guard triggers while loading
-- so the timeline isn't filled with "drafted" entries for already-sent quotes.
alter table public.leads disable trigger user;
alter table public.quotes disable trigger user;
alter table public.bookings disable trigger user;
alter table public.follow_ups disable trigger user;
alter table public.lead_notes disable trigger user;
alter table public.email_deliveries disable trigger user;

update public.app_settings set company_name = 'Professional Wheelers' where id = 1;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
insert into public.customers (id, name, email, phone, company, notes, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'Rachel Kim',       'rachel.kim@example.com',     '(415) 555-0142', null, null, now() - interval '40 days'),
  ('c0000000-0000-4000-8000-000000000002', 'Marcus Johnson',   'marcus.j@example.com',       '(312) 555-0187', null, 'Prefers text messages.', now() - interval '12 days'),
  ('c0000000-0000-4000-8000-000000000003', 'Elena Garcia',     'elena.garcia@example.com',   '(305) 555-0119', null, null, now() - interval '9 days'),
  ('c0000000-0000-4000-8000-000000000004', 'Tom Becker',       'tbecker@example.com',        '(602) 555-0163', 'Desert Classic Motors', 'Dealer. Ships 2-3 cars a month.', now() - interval '120 days'),
  ('c0000000-0000-4000-8000-000000000005', 'Priya Shah',       'priya.shah@example.com',     '(646) 555-0178', null, null, now() - interval '6 days'),
  ('c0000000-0000-4000-8000-000000000006', 'Daniel Okafor',    'd.okafor@example.com',       '(713) 555-0134', null, null, now() - interval '5 days'),
  ('c0000000-0000-4000-8000-000000000007', 'Linda Morales',    'linda.morales@example.com',  '(210) 555-0101', null, 'Military relocation (PCS).', now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000008', 'Greg Hollis',      'greg@hollisrestorations.example', '(503) 555-0155', 'Hollis Restorations', null, now() - interval '30 days'),
  ('c0000000-0000-4000-8000-000000000009', 'Aisha Rahman',     'aisha.r@example.com',        '(404) 555-0192', null, null, now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000010', 'Kevin Walsh',      'kwalsh@example.com',         '(617) 555-0128', null, null, now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000011', 'Sofia Rossi',      'sofia.rossi@example.com',    '(702) 555-0110', null, null, now() - interval '3 hours'),
  ('c0000000-0000-4000-8000-000000000012', 'Bill Turner',      null,                         '(801) 555-0177', null, 'Called in; no email on file.', now() - interval '4 days');

-- ---------------------------------------------------------------------------
-- Leads (one per shipment)
-- ---------------------------------------------------------------------------
insert into public.leads (id, reference, customer_id, status, source, assigned_to,
  contact_name, contact_email, contact_phone, contact_company,
  pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip,
  earliest_pickup_date, pickup_date_flexible, transport_type, special_instructions,
  lost_reason, lost_at, created_at)
values
  -- New requests
  ('a0000000-0000-4000-8000-000000000001', 'Q-7KX2PM', 'c0000000-0000-4000-8000-000000000011', 'new', 'web_form', null,
   'Sofia Rossi', 'sofia.rossi@example.com', '(702) 555-0110', null,
   'Las Vegas', 'NV', '89109', 'Denver', 'CO', '80202', current_date + 6, true, 'open', null, null, null, now() - interval '3 hours'),
  ('a0000000-0000-4000-8000-000000000002', 'Q-9HT4WD', 'c0000000-0000-4000-8000-000000000010', 'new', 'web_form', '33333333-3333-4333-8333-333333333333',
   'Kevin Walsh', 'kwalsh@example.com', '(617) 555-0128', null,
   'Boston', 'MA', '02116', 'Naples', 'FL', '34102', current_date + 10, false, 'enclosed', 'Low clearance sports car. Liftgate or ramps needed.', null, null, now() - interval '1 day'),
  ('a0000000-0000-4000-8000-000000000003', 'Q-3RBN8C', 'c0000000-0000-4000-8000-000000000009', 'new', 'web_form', null,
   'Aisha Rahman', 'aisha.r@example.com', '(404) 555-0192', null,
   'Atlanta', 'GA', '30309', 'Charlotte', 'NC', '28202', current_date + 3, true, 'open', 'Narrow street at pickup; a large truck may not fit.', null, null, now() - interval '2 days'),
  -- Contacted
  ('a0000000-0000-4000-8000-000000000004', 'Q-5MJ6QA', 'c0000000-0000-4000-8000-000000000006', 'contacted', 'web_form', '22222222-2222-4222-8222-222222222222',
   'Daniel Okafor', 'd.okafor@example.com', '(713) 555-0134', null,
   'Houston', 'TX', '77002', 'Chicago', 'IL', '60601', current_date + 8, true, 'open', null, null, null, now() - interval '5 days'),
  ('a0000000-0000-4000-8000-000000000005', 'Q-8WPZ3E', 'c0000000-0000-4000-8000-000000000012', 'contacted', 'phone', '33333333-3333-4333-8333-333333333333',
   'Bill Turner', null, '(801) 555-0177', null,
   'Salt Lake City', 'UT', '84101', 'Boise', 'ID', '83702', current_date + 12, true, 'open', 'Customer will call back with exact dates.', null, null, now() - interval '4 days'),
  -- Pricing (draft quote)
  ('a0000000-0000-4000-8000-000000000006', 'Q-2DFK7N', 'c0000000-0000-4000-8000-000000000005', 'pricing', 'web_form', '22222222-2222-4222-8222-222222222222',
   'Priya Shah', 'priya.shah@example.com', '(646) 555-0178', null,
   'New York', 'NY', '10001', 'Austin', 'TX', '78701', current_date + 9, false, 'open', null, null, null, now() - interval '6 days'),
  -- Quote sent, active
  ('a0000000-0000-4000-8000-000000000007', 'Q-6TQV9R', 'c0000000-0000-4000-8000-000000000003', 'quote_sent', 'web_form', '22222222-2222-4222-8222-222222222222',
   'Elena Garcia', 'elena.garcia@example.com', '(305) 555-0119', null,
   'Miami', 'FL', '33101', 'Seattle', 'WA', '98101', current_date + 7, true, 'open', null, null, null, now() - interval '9 days'),
  -- Quote sent, revised (v1 superseded, v2 active)
  ('a0000000-0000-4000-8000-000000000008', 'Q-4NYC2H', 'c0000000-0000-4000-8000-000000000002', 'quote_sent', 'web_form', '33333333-3333-4333-8333-333333333333',
   'Marcus Johnson', 'marcus.j@example.com', '(312) 555-0187', null,
   'Chicago', 'IL', '60614', 'Phoenix', 'AZ', '85004', current_date + 5, false, 'open', null, null, null, now() - interval '12 days'),
  -- Quote sent, expired
  ('a0000000-0000-4000-8000-000000000009', 'Q-HB5X8K', 'c0000000-0000-4000-8000-000000000008', 'quote_sent', 'web_form', '22222222-2222-4222-8222-222222222222',
   'Greg Hollis', 'greg@hollisrestorations.example', '(503) 555-0155', 'Hollis Restorations',
   'Portland', 'OR', '97201', 'Scottsdale', 'AZ', '85251', current_date - 3, true, 'enclosed', '1967 Mustang, non-running. Winch required.', null, null, now() - interval '30 days'),
  -- Booked
  ('a0000000-0000-4000-8000-000000000010', 'Q-P3ZM6W', 'c0000000-0000-4000-8000-000000000004', 'booked', 'repeat_customer', '33333333-3333-4333-8333-333333333333',
   'Tom Becker', 'tbecker@example.com', '(602) 555-0163', 'Desert Classic Motors',
   'Phoenix', 'AZ', '85004', 'Dallas', 'TX', '75201', current_date - 2, false, 'enclosed', null, null, null, now() - interval '8 days'),
  ('a0000000-0000-4000-8000-000000000011', 'Q-R7CJ4T', 'c0000000-0000-4000-8000-000000000007', 'booked', 'web_form', '22222222-2222-4222-8222-222222222222',
   'Linda Morales', 'linda.morales@example.com', '(210) 555-0101', null,
   'San Antonio', 'TX', '78205', 'Fayetteville', 'NC', '28301', current_date - 10, false, 'open', 'PCS move. Two vehicles.', null, null, now() - interval '20 days'),
  ('a0000000-0000-4000-8000-000000000012', 'Q-V2KD9F', 'c0000000-0000-4000-8000-000000000004', 'booked', 'repeat_customer', '33333333-3333-4333-8333-333333333333',
   'Tom Becker', 'tbecker@example.com', '(602) 555-0163', 'Desert Classic Motors',
   'Phoenix', 'AZ', '85004', 'Los Angeles', 'CA', '90012', current_date - 25, false, 'open', null, null, null, now() - interval '35 days'),
  -- Lost
  ('a0000000-0000-4000-8000-000000000013', 'Q-K8WT3B', 'c0000000-0000-4000-8000-000000000001', 'lost', 'web_form', '22222222-2222-4222-8222-222222222222',
   'Rachel Kim', 'rachel.kim@example.com', '(415) 555-0142', null,
   'San Francisco', 'CA', '94103', 'Portland', 'OR', '97201', current_date - 20, false, 'open', null,
   'Chose to drive the vehicle herself', now() - interval '25 days', now() - interval '40 days');

insert into public.lead_vehicles (lead_id, position, year, make, model, operable) values
  ('a0000000-0000-4000-8000-000000000001', 0, 2021, 'Toyota', 'RAV4', true),
  ('a0000000-0000-4000-8000-000000000002', 0, 2019, 'Porsche', '911 Carrera', true),
  ('a0000000-0000-4000-8000-000000000003', 0, 2016, 'Honda', 'Civic', true),
  ('a0000000-0000-4000-8000-000000000004', 0, 2022, 'Ford', 'F-150', true),
  ('a0000000-0000-4000-8000-000000000005', 0, 2018, 'Subaru', 'Outback', true),
  ('a0000000-0000-4000-8000-000000000006', 0, 2020, 'Tesla', 'Model 3', true),
  ('a0000000-0000-4000-8000-000000000007', 0, 2017, 'Jeep', 'Wrangler', true),
  ('a0000000-0000-4000-8000-000000000008', 0, 2015, 'Chevrolet', 'Malibu', true),
  ('a0000000-0000-4000-8000-000000000009', 0, 1967, 'Ford', 'Mustang Fastback', false),
  ('a0000000-0000-4000-8000-000000000010', 0, 1972, 'Chevrolet', 'Corvette Stingray', true),
  ('a0000000-0000-4000-8000-000000000011', 0, 2020, 'Toyota', 'Highlander', true),
  ('a0000000-0000-4000-8000-000000000011', 1, 2014, 'Honda', 'Accord', true),
  ('a0000000-0000-4000-8000-000000000012', 0, 2019, 'BMW', 'X5', true),
  ('a0000000-0000-4000-8000-000000000013', 0, 2012, 'Mazda', 'Miata', true);

-- ---------------------------------------------------------------------------
-- Quotes (link hashes are random: use "Issue new link" to get a working URL
-- for a demo quote, since raw tokens are derived from your QUOTE_LINK_SECRET)
-- ---------------------------------------------------------------------------
create temporary table seed_quotes (
  id uuid, lead_id uuid, version int, status public.quote_status, carrier_pay numeric, broker_fee numeric,
  sent_offset interval, expires_offset interval, responded_offset interval, decline_reason text
);

insert into seed_quotes values
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006', 1, 'draft',      1150, 275, null, interval '7 days', null, null),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000007', 1, 'sent',       1450, 325, interval '2 days', interval '5 days', null, null),
  ('b0000000-0000-4000-8000-000000000081', 'a0000000-0000-4000-8000-000000000008', 1, 'superseded', 1050, 300, interval '6 days', interval '1 day', null, null),
  ('b0000000-0000-4000-8000-000000000082', 'a0000000-0000-4000-8000-000000000008', 2, 'sent',        980, 245, interval '1 day', interval '6 days', null, null),
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000009', 1, 'sent',       1900, 450, interval '12 days', interval '-5 days', null, null),
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000010', 1, 'accepted',   1250, 350, interval '6 days', interval '1 day', interval '5 days', null),
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011', 1, 'accepted',   1700, 400, interval '17 days', interval '-10 days', interval '16 days', null),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000012', 1, 'accepted',    600, 225, interval '33 days', interval '-26 days', interval '32 days', null),
  ('b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000013', 1, 'declined',    750, 200, interval '35 days', interval '-28 days', interval '30 days', 'Too expensive');

insert into public.quotes (id, lead_id, version, status, carrier_pay, broker_fee,
  pickup_window_start, pickup_window_end, terms, internal_note, expires_at,
  link_id, token_hash, snapshot, sent_at, sent_by, first_viewed_at, responded_at, decline_reason, created_by, created_at)
select
  sq.id, l.id, sq.version, sq.status, sq.carrier_pay, sq.broker_fee,
  l.earliest_pickup_date, l.earliest_pickup_date + 4,
  s.default_quote_terms,
  case when sq.status = 'draft' then 'Carrier board avg for this lane is ~$1,100. Check enclosed option.' end,
  case when sq.sent_offset is null then now() + sq.expires_offset else now() - sq.sent_offset + interval '7 days' + (sq.expires_offset - interval '7 days') end,
  case when sq.status <> 'draft' then gen_random_uuid() end,
  case when sq.status <> 'draft' then encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex') end,
  case when sq.status <> 'draft' then jsonb_build_object(
    'reference', l.reference, 'customer_name', l.contact_name,
    'pickup', jsonb_build_object('city', l.pickup_city, 'state', l.pickup_state, 'zip', l.pickup_zip),
    'delivery', jsonb_build_object('city', l.delivery_city, 'state', l.delivery_state, 'zip', l.delivery_zip),
    'transport_type', l.transport_type, 'earliest_pickup_date', l.earliest_pickup_date,
    'pickup_date_flexible', l.pickup_date_flexible,
    'vehicles', (select jsonb_agg(jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'operable', v.operable) order by v.position)
                 from public.lead_vehicles v where v.lead_id = l.id)) end,
  case when sq.sent_offset is not null then now() - sq.sent_offset end,
  case when sq.sent_offset is not null then l.assigned_to end,
  case when sq.sent_offset is not null and sq.status <> 'superseded' then now() - sq.sent_offset + interval '3 hours' end,
  case when sq.responded_offset is not null then now() - sq.responded_offset end,
  sq.decline_reason,
  l.assigned_to,
  coalesce(now() - sq.sent_offset - interval '1 hour', now() - interval '1 day')
from seed_quotes sq
join public.leads l on l.id = sq.lead_id
cross join public.app_settings s;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
insert into public.bookings (id, reference, lead_id, quote_id, customer_id, status, snapshot, total_price,
  pickup_address, pickup_contact_name, pickup_contact_phone,
  delivery_address, delivery_contact_name, delivery_contact_phone,
  carrier_name, carrier_phone, carrier_assigned_at, picked_up_at, delivered_at, notes, created_at)
select
  bk.id, bk.reference, q.lead_id, q.id, l.customer_id, bk.status,
  q.snapshot || jsonb_build_object('quote_version', q.version, 'total', q.total,
    'pickup_window_start', q.pickup_window_start, 'pickup_window_end', q.pickup_window_end,
    'terms', q.terms, 'accepted_at', q.responded_at,
    'contact', jsonb_build_object('name', l.contact_name, 'email', l.contact_email, 'phone', l.contact_phone, 'company', l.contact_company)),
  q.total,
  bk.pickup_address, bk.pickup_contact_name, bk.pickup_contact_phone,
  bk.delivery_address, bk.delivery_contact_name, bk.delivery_contact_phone,
  bk.carrier_name, bk.carrier_phone, bk.carrier_assigned_at, bk.picked_up_at, bk.delivered_at, bk.notes,
  q.responded_at
from (values
  ('d0000000-0000-4000-8000-000000000010'::uuid, 'B-4TFW8Y', 'b0000000-0000-4000-8000-000000000010'::uuid, 'awaiting_carrier'::public.shipment_status,
   null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz, null::timestamptz,
   'Dealer wants enclosed soft-tie only.'),
  ('d0000000-0000-4000-8000-000000000011'::uuid, 'B-9QMC3J', 'b0000000-0000-4000-8000-000000000011'::uuid, 'picked_up'::public.shipment_status,
   '4512 Fredericksburg Rd, San Antonio, TX 78201', 'Linda Morales', '(210) 555-0101',
   '1200 Bragg Blvd, Fayetteville, NC 28301', 'Ray Morales', '(910) 555-0146',
   'Lone Star Carriers LLC', '(214) 555-0199', now() - interval '12 days', now() - interval '9 days', null::timestamptz,
   'Driver ETA to delivery: 2 days.'),
  ('d0000000-0000-4000-8000-000000000012'::uuid, 'B-2HXK7P', 'b0000000-0000-4000-8000-000000000012'::uuid, 'delivered'::public.shipment_status,
   '2100 E Camelback Rd, Phoenix, AZ 85016', 'Tom Becker', '(602) 555-0163',
   '850 S Figueroa St, Los Angeles, CA 90017', 'Ana Lopez', '(213) 555-0181',
   'Westbound Auto Haulers', '(480) 555-0122', now() - interval '28 days', now() - interval '25 days', now() - interval '23 days',
   null)
) as bk(id, reference, quote_id, status, pickup_address, pickup_contact_name, pickup_contact_phone,
        delivery_address, delivery_contact_name, delivery_contact_phone,
        carrier_name, carrier_phone, carrier_assigned_at, picked_up_at, delivered_at, notes)
join public.quotes q on q.id = bk.quote_id
join public.leads l on l.id = q.lead_id;

-- ---------------------------------------------------------------------------
-- Notes, follow-ups, email log
-- ---------------------------------------------------------------------------
insert into public.lead_notes (lead_id, author_id, body, created_at) values
  ('a0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Left voicemail. Customer prefers a call after 5pm CT.', now() - interval '4 days'),
  ('a0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 'Spoke with Priya. Firm on the pickup date; wants a quote today.', now() - interval '1 day'),
  ('a0000000-0000-4000-8000-000000000008', '33333333-3333-4333-8333-333333333333', 'Customer said v1 was over budget. Revised with lower carrier pay; lane is soft this week.', now() - interval '1 day'),
  ('a0000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'Non-running classic; only 3 enclosed carriers with winches on this lane.', now() - interval '12 days'),
  ('a0000000-0000-4000-8000-000000000010', '33333333-3333-4333-8333-333333333333', 'Repeat dealer. Accepted same day.', now() - interval '5 days');

insert into public.follow_ups (lead_id, assigned_to, due_at, note, completed_at, completed_by, created_by, created_at) values
  ('a0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', now() - interval '1 day', 'Call back after 5pm CT', null, null, '22222222-2222-4222-8222-222222222222', now() - interval '4 days'),
  ('a0000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', now() + interval '1 day', 'Check whether Elena reviewed the quote', null, null, '22222222-2222-4222-8222-222222222222', now() - interval '2 days'),
  ('a0000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', now() - interval '3 days', 'Quote expired; ask Greg about new dates', null, null, '22222222-2222-4222-8222-222222222222', now() - interval '6 days'),
  ('a0000000-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333', now() + interval '2 days', 'Get exact dates from Bill', null, null, '33333333-3333-4333-8333-333333333333', now() - interval '4 days'),
  ('a0000000-0000-4000-8000-000000000008', '33333333-3333-4333-8333-333333333333', now() - interval '2 hours', 'Confirm revised quote works for Marcus', null, null, '33333333-3333-4333-8333-333333333333', now() - interval '1 day'),
  ('a0000000-0000-4000-8000-000000000010', '33333333-3333-4333-8333-333333333333', now() - interval '6 days', 'Send quote', now() - interval '6 days', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', now() - interval '7 days');

insert into public.email_deliveries (quote_id, lead_id, to_email, subject, provider, provider_message_id, status, created_by, created_at) values
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000007', 'elena.garcia@example.com', 'Your vehicle shipping quote Q-6TQV9R', 'resend', 'demo-msg-0007', 'delivered', '22222222-2222-4222-8222-222222222222', now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000082', 'a0000000-0000-4000-8000-000000000008', 'marcus.j@example.com', 'Your revised vehicle shipping quote Q-4NYC2H', 'resend', 'demo-msg-0082', 'sent', '33333333-3333-4333-8333-333333333333', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- Activity timeline
-- ---------------------------------------------------------------------------
insert into public.activities (lead_id, booking_id, quote_id, actor_id, actor_type, kind, message, created_at)
select l.id, null, null, null, case when l.source = 'web_form' then 'customer' else 'staff' end, 'lead_created',
       case when l.source = 'web_form' then 'Quote request ' || l.reference || ' received from the website'
            else 'Lead ' || l.reference || ' created (' || replace(l.source::text, '_', ' ') || ')' end,
       l.created_at
from public.leads l;

insert into public.activities (lead_id, quote_id, actor_id, actor_type, kind, message, created_at)
select q.lead_id, q.id, q.sent_by, 'staff', 'quote_sent',
       'Quote v' || q.version || ' sent at ' || public.money(q.total) || ', valid until ' || to_char(q.expires_at, 'Mon DD, YYYY'),
       q.sent_at
from public.quotes q where q.sent_at is not null;

insert into public.activities (lead_id, quote_id, actor_type, kind, message, created_at)
select q.lead_id, q.id, 'customer', 'quote_' || q.status::text,
       'Quote v' || q.version || ' ' || q.status::text || coalesce(': ' || q.decline_reason, ''),
       q.responded_at
from public.quotes q where q.responded_at is not null;

insert into public.activities (lead_id, booking_id, quote_id, actor_type, kind, message, created_at)
select b.lead_id, b.id, b.quote_id, 'system', 'booking_created',
       'Booking ' || b.reference || ' created at ' || public.money(b.total_price) || ' (Awaiting Carrier)', b.created_at
from public.bookings b;

insert into public.activities (lead_id, booking_id, actor_id, actor_type, kind, message, created_at)
select b.lead_id, b.id, '22222222-2222-4222-8222-222222222222', 'staff', 'shipment_status',
       'Shipment status changed to ' || public.shipment_label(b.status), coalesce(b.delivered_at, b.picked_up_at, b.carrier_assigned_at)
from public.bookings b where b.status <> 'awaiting_carrier';

insert into public.activities (lead_id, actor_id, actor_type, kind, message, created_at) values
  ('a0000000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', 'staff', 'stage_changed', 'Marked Lost: Chose to drive the vehicle herself', now() - interval '25 days');

alter table public.leads enable trigger user;
alter table public.quotes enable trigger user;
alter table public.bookings enable trigger user;
alter table public.follow_ups enable trigger user;
alter table public.lead_notes enable trigger user;
alter table public.email_deliveries enable trigger user;
drop table if exists seed_quotes;
