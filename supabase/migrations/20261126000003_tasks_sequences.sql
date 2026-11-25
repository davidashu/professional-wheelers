-- Tasks (global list + per customer/load, assignable to a person or a whole
-- position) and profit-drop sequences that create call tasks automatically.

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create type public.task_status as enum ('open', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  body text check (body is null or length(body) <= 10000),
  customer_id uuid references public.customers (id) on delete cascade,
  load_id uuid references public.loads (id) on delete cascade,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  assigned_role public.app_role,
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  source text not null default 'manual' check (source in ('manual', 'sequence')),
  sequence_rule_key text,
  sequence_period date,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  outcome text check (outcome is null or length(outcome) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_has_assignee check (assigned_user_id is not null or assigned_role is not null),
  constraint tasks_role_not_customer check (assigned_role is null or assigned_role <> 'customer'),
  constraint tasks_sequence_fields check (source = 'manual' or (sequence_rule_key is not null and sequence_period is not null and customer_id is not null))
);
-- At most one automatic profit task per customer per month.
create unique index tasks_one_sequence_per_customer_month on public.tasks (customer_id, sequence_period) where source = 'sequence';
create index tasks_open_user_idx on public.tasks (assigned_user_id, due_at) where status = 'open';
create index tasks_open_role_idx on public.tasks (assigned_role, due_at) where status = 'open';
create index tasks_customer_idx on public.tasks (customer_id, created_at desc);
create index tasks_load_idx on public.tasks (load_id);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create or replace function public.can_see_task(t public.tasks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_app_role() = 'admin' then true
    when public.current_app_role() in ('sales', 'dispatch') then
      t.assigned_user_id = auth.uid()
      or (t.assigned_role = public.current_app_role() and t.assigned_user_id is null)
      or t.created_by = auth.uid()
      or (t.customer_id is not null and public.current_app_role() = 'sales'
          and exists (select 1 from public.customers c where c.id = t.customer_id and c.sales_rep_id = auth.uid()))
      or (t.load_id is not null and public.can_see_load(t.load_id))
    else false
  end;
$$;

create or replace function public.guard_task_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status = 'open' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and public.current_app_role() <> 'admin' then
    if new.source is distinct from old.source or new.sequence_rule_key is distinct from old.sequence_rule_key
       or new.sequence_period is distinct from old.sequence_period then
      raise exception 'Automatic task details can''t be changed.' using errcode = '42501';
    end if;
    -- Non-admins may claim a position task for themselves, but not hand tasks to others.
    if new.assigned_user_id is distinct from old.assigned_user_id
       and not (old.assigned_user_id is null and new.assigned_user_id = auth.uid())
       and old.created_by is distinct from auth.uid() then
      raise exception 'Only an admin or the task''s creator can reassign it.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.guard_task_write();

alter table public.tasks enable row level security;
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;

create policy "read visible tasks" on public.tasks
  for select to authenticated using (public.can_see_task(tasks));
create policy "internal create tasks" on public.tasks
  for insert to authenticated
  with check (
    public.is_internal() and created_by = auth.uid() and source = 'manual'
    and (customer_id is null or public.can_see_customer(customer_id))
    and (load_id is null or public.can_see_load(load_id))
  );
create policy "update visible tasks" on public.tasks
  for update to authenticated
  using (public.can_see_task(tasks))
  with check (public.is_internal());
create policy "admin or creator delete tasks" on public.tasks
  for delete to authenticated
  using (public.is_admin() or (created_by = auth.uid() and source = 'manual'));

-- ---------------------------------------------------------------------------
-- Profit-drop sequences
-- ---------------------------------------------------------------------------
-- A rule matches when each of the last `months` month-over-month profit drops
-- is in [min_drop, max_drop) and, if set, the combined drop over the window is
-- at least min_total_drop. Drops are fractions: 0.20 = 20%. Lower severity
-- number = more serious; a customer gets one task per month, from the most
-- serious matching rule.
create table public.sequence_rules (
  key text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  months smallint not null check (months between 1 and 6),
  min_drop numeric(5, 4) not null check (min_drop between 0 and 1),
  max_drop numeric(6, 4) check (max_drop is null or max_drop > min_drop),
  min_total_drop numeric(5, 4) check (min_total_drop is null or min_total_drop between 0 and 1),
  severity smallint not null check (severity between 1 and 100),
  active boolean not null default true,
  task_priority public.task_priority not null default 'high',
  due_days smallint not null default 2 check (due_days between 0 and 30),
  task_title text not null check (length(task_title) between 1 and 200),
  task_body text not null check (length(task_body) between 1 and 5000),
  updated_at timestamptz not null default now()
);
create trigger sequence_rules_updated_at before update on public.sequence_rules
  for each row execute function public.set_updated_at();

insert into public.sequence_rules (key, name, description, months, min_drop, max_drop, min_total_drop, severity, task_priority, due_days, task_title, task_body) values
('sharp_drop', 'Sharp drop', 'Profit down 50% or more in one month. A month with no loads counts as a 100% drop.',
  1, 0.50, null, null, 10, 'urgent', 1,
  'Call {customer}: profit down {drop} last month',
  'Profit from {customer} fell sharply.' || chr(10) || chr(10) || '{history}' || chr(10) || chr(10) ||
  'Call your contact today and find out why their shipments dropped. Ask:' || chr(10) ||
  '- Did they move loads to another broker or carrier? At what price?' || chr(10) ||
  '- Was there a service problem (late pickup, damage, communication)?' || chr(10) ||
  '- Has their own volume dropped (fewer vehicles bought, slower season)?' || chr(10) ||
  '- What lanes are coming up in the next 30 days that we can quote?' || chr(10) || chr(10) ||
  'Log what you learn in the outcome before completing this task.'),
('steep_drop', 'Steep one-month drop', 'Profit down 40–50% in one month.',
  1, 0.40, 0.50, null, 20, 'high', 2,
  'Call {customer}: profit down {drop} last month',
  'Profit from {customer} dropped steeply.' || chr(10) || chr(10) || '{history}' || chr(10) || chr(10) ||
  'Call your contact and understand why their shipments with us dropped. Ask about competitor pricing, '
  || 'any service issues, their own volume, and upcoming lanes we can quote.' || chr(10) || chr(10) ||
  'Log what you learn in the outcome before completing this task.'),
('two_month_drop', 'Two-month decline', 'Profit down 20–40% in each of the last two months.',
  2, 0.20, 0.40, null, 30, 'high', 2,
  'Call {customer}: profit down two months in a row ({drop} total)',
  'Profit from {customer} has dropped 20–40% two months in a row.' || chr(10) || chr(10) || '{history}' || chr(10) || chr(10) ||
  'Call your contact and understand why their sales with us dropped. Ask about competitor pricing, '
  || 'service issues, their own volume, and upcoming lanes we can quote.' || chr(10) || chr(10) ||
  'Log what you learn in the outcome before completing this task.'),
('mixed_decline', 'Mixed decline', 'Profit down at least 10% in each of the last two months, 30% or more combined (for example −15% then −30%).',
  2, 0.10, null, 0.30, 40, 'high', 3,
  'Call {customer}: profit down {drop} over two months',
  'Profit from {customer} has been falling for two months.' || chr(10) || chr(10) || '{history}' || chr(10) || chr(10) ||
  'Call your contact and understand why their sales with us dropped. Ask about competitor pricing, '
  || 'service issues, their own volume, and upcoming lanes we can quote.' || chr(10) || chr(10) ||
  'Log what you learn in the outcome before completing this task.'),
('slow_decline', 'Slow decline', 'Profit down 10–20% in each of the last three months.',
  3, 0.10, 0.20, null, 50, 'normal', 3,
  'Call {customer}: profit slipping three months in a row ({drop} total)',
  'Profit from {customer} has slipped 10–20% every month for three months.' || chr(10) || chr(10) || '{history}' || chr(10) || chr(10) ||
  'Call your contact and understand why their sales with us are dropping. Ask about competitor pricing, '
  || 'service issues, their own volume, and upcoming lanes we can quote.' || chr(10) || chr(10) ||
  'Log what you learn in the outcome before completing this task.');

create table public.sequence_runs (
  id bigint generated always as identity primary key,
  evaluated_month date not null,
  customers_checked integer not null default 0,
  tasks_created integer not null default 0,
  details jsonb not null default '[]'::jsonb,
  run_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.sequence_rules enable row level security;
alter table public.sequence_runs enable row level security;
grant select, update on public.sequence_rules to authenticated;
grant select on public.sequence_runs to authenticated;
grant all on public.sequence_rules, public.sequence_runs to service_role;
create policy "internal read rules" on public.sequence_rules
  for select to authenticated using (public.is_internal());
create policy "admin edit rules" on public.sequence_rules
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read runs" on public.sequence_runs
  for select to authenticated using (public.is_admin());

-- Monthly profit per customer (RLS of the caller applies).
create or replace view public.customer_monthly_profit
with (security_invoker = true) as
select l.customer_id,
       date_trunc('month', l.service_date)::date as month,
       count(*)::integer as loads,
       sum(l.customer_rate) as revenue,
       sum(l.carrier_rate) as carrier_cost,
       sum(l.profit) as profit
from public.loads l
where l.customer_status <> 'cancelled'
group by l.customer_id, date_trunc('month', l.service_date);
grant select on public.customer_monthly_profit to authenticated, service_role;

create or replace function public.pct(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when n is null then '–' else round(n * 100)::text || '%' end;
$$;

-- Evaluates every customer for the last complete month before p_as_of and
-- creates call tasks. Safe to run repeatedly: one task per customer per month.
create or replace function public.run_profit_sequences(p_as_of date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := (date_trunc('month', p_as_of) - interval '1 month')::date; -- last complete month
  v_customer record;
  v_rule public.sequence_rules;
  v_profits numeric[];      -- index 1 = v_month, 2 = month before, ...
  v_drops numeric[];        -- index 1 = drop into v_month, ...
  v_ok boolean;
  v_total numeric;
  v_history text;
  v_created integer := 0;
  v_checked integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_assignee uuid;
  v_task_id uuid;
  i integer;
  v_months_back constant integer := 7;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can run sequences.' using errcode = '42501';
  end if;

  for v_customer in
    select c.id, c.name, c.company, c.sales_rep_id
    from public.customers c
    where exists (
      select 1 from public.loads l
      where l.customer_id = c.id and l.customer_status <> 'cancelled'
        and l.service_date >= (v_month - (v_months_back || ' months')::interval)::date
        and l.service_date < (v_month + interval '1 month')::date
    )
  loop
    v_checked := v_checked + 1;
    v_profits := array[]::numeric[];
    for i in 0..v_months_back loop
      v_profits := v_profits || coalesce((
        select sum(l.profit) from public.loads l
        where l.customer_id = v_customer.id and l.customer_status <> 'cancelled'
          and date_trunc('month', l.service_date) = (v_month - (i || ' months')::interval)
      ), 0);
    end loop;

    v_drops := array[]::numeric[];
    for i in 1..v_months_back loop
      -- drop from month i+1 (older) into month i; undefined when the older month had no profit
      v_drops := v_drops || case when v_profits[i + 1] > 0
                                 then (v_profits[i + 1] - v_profits[i]) / v_profits[i + 1] end;
    end loop;

    for v_rule in select * from public.sequence_rules where active order by severity loop
      v_ok := true;
      for i in 1..v_rule.months loop
        if v_drops[i] is null or v_drops[i] < v_rule.min_drop
           or (v_rule.max_drop is not null and v_drops[i] >= v_rule.max_drop) then
          v_ok := false;
          exit;
        end if;
      end loop;
      v_total := case when v_profits[v_rule.months + 1] > 0
                      then (v_profits[v_rule.months + 1] - v_profits[1]) / v_profits[v_rule.months + 1] end;
      if v_ok and v_rule.min_total_drop is not null and (v_total is null or v_total < v_rule.min_total_drop) then
        v_ok := false;
      end if;
      continue when not v_ok;

      v_history := '';
      for i in reverse (v_rule.months + 1)..1 loop
        v_history := v_history || to_char(v_month - ((i - 1) || ' months')::interval, 'Mon YYYY') || ': '
          || public.money(v_profits[i]) || ' profit'
          || case when i <= v_rule.months then ' (' || case when v_drops[i] >= 0 then '−' else '+' end
                  || public.pct(abs(v_drops[i])) || ')' else '' end
          || chr(10);
      end loop;

      select p.id into v_assignee from public.profiles p
      where p.id = v_customer.sales_rep_id and p.active and p.role in ('admin', 'sales');

      insert into public.tasks (title, body, customer_id, assigned_user_id, assigned_role, due_at, priority,
                                source, sequence_rule_key, sequence_period, created_by)
      values (
        replace(replace(v_rule.task_title, '{customer}', coalesce(v_customer.company, v_customer.name)), '{drop}', public.pct(v_total)),
        replace(replace(replace(v_rule.task_body, '{customer}', coalesce(v_customer.company, v_customer.name)),
                        '{drop}', public.pct(v_total)), '{history}', rtrim(v_history, chr(10))),
        v_customer.id,
        v_assignee,
        case when v_assignee is null then 'admin'::public.app_role end,
        (p_as_of + v_rule.due_days)::timestamptz + interval '17 hours',
        v_rule.task_priority, 'sequence', v_rule.key, v_month, null
      )
      on conflict (customer_id, sequence_period) where source = 'sequence' do nothing
      returning id into v_task_id;

      if v_task_id is not null then
        v_created := v_created + 1;
        v_details := v_details || jsonb_build_object('customer_id', v_customer.id, 'rule', v_rule.key,
                                                     'task_id', v_task_id, 'total_drop', round(v_total, 4));
        insert into public.activities (customer_id, actor_type, kind, message, metadata)
        values (v_customer.id, 'system', 'sequence_task', 'Sequence "' || v_rule.name || '" created a call task',
                jsonb_build_object('rule', v_rule.key, 'task_id', v_task_id, 'month', v_month));
      end if;
      v_task_id := null;
      exit; -- most serious matching rule only
    end loop;
  end loop;

  insert into public.sequence_runs (evaluated_month, customers_checked, tasks_created, details, run_by)
  values (v_month, v_checked, v_created, v_details,
          case when exists (select 1 from public.profiles where id = auth.uid()) then auth.uid() end);

  return jsonb_build_object('month', v_month, 'customers_checked', v_checked, 'tasks_created', v_created);
end;
$$;

-- Customer portal: the signed-in customer's company (no internal notes).
create or replace function public.portal_customer()
returns table (id uuid, name text, company text, email text, phone text, billing_email text, payment_terms_days integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.company, c.email, c.phone, c.billing_email, c.payment_terms_days
  from public.customers c where c.id = public.current_customer_id();
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.can_see_task(public.tasks) to authenticated, service_role;
grant execute on function public.pct(numeric) to authenticated, service_role;
grant execute on function public.run_profit_sequences(date) to authenticated, service_role;
grant execute on function public.portal_customer() to authenticated;
