import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { displayName, requireStaff } from "@/lib/auth";
import { getTeam, must, teamMap, vehicleSummaries } from "@/lib/data";
import { place, type CustomerLocation, type Load } from "@/lib/tms";
import { CustomerStatusBadge, CarrierStatusBadge } from "@/components/tms-status";
import { TaskList, assigneeOptions, type TaskRow } from "../../tasks/task-list";
import { NewTaskForm } from "../../tasks/task-forms";
import { AddLocationForm, AddPortalUserForm, RemoveLocationButton, SalesRepForm } from "./profile-forms";
import { formatDate, money } from "@/lib/format";
import type { Booking, Customer, Lead } from "@/lib/types";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { LeadStatusBadge, ShipmentStatusBadge } from "@/components/status";
import { CustomerForm } from "./customer-form";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireStaff();
  const customer = must(await supabase.from("customers").select("*").eq("id", id).maybeSingle<Customer>(), "customer");
  if (!customer) notFound();
  const [leadsRes, bookingsRes, loadsRes, profitRes, tasksRes, locationsRes, team] = await Promise.all([
    supabase.from("leads").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("bookings").select("*").eq("customer_id", id),
    supabase.from("loads").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("customer_monthly_profit").select("*").eq("customer_id", id).order("month", { ascending: false }).limit(12),
    supabase.from("tasks").select("*, customers(name, company), loads(load_number)").eq("customer_id", id)
      .order("status", { ascending: true }).order("due_at", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("customer_locations").select("*").eq("customer_id", id).order("name"),
    getTeam(supabase),
  ]);
  const loads = must(loadsRes, "loads") as Load[];
  const monthly = must(profitRes, "monthly profit") as Array<{ month: string; loads: number; revenue: string; profit: string }>;
  const tasks = must(tasksRes, "tasks") as TaskRow[];
  const locations = must(locationsRes, "locations") as CustomerLocation[];
  const people = teamMap(team);
  const portalUsers = profile.role === "admin"
    ? (must(await supabase.from("profiles").select("id, email, full_name, active").eq("customer_id", id), "portal users") as Array<{ id: string; email: string; full_name: string; active: boolean }>)
    : [];
  const rep = customer.sales_rep_id ? people.get(customer.sales_rep_id) : undefined;
  const leads = must(leadsRes, "shipments") as Lead[];
  const bookings = new Map((must(bookingsRes, "bookings") as Booking[]).map((b) => [b.lead_id, b]));
  const vehicles = await vehicleSummaries(supabase, leads.map((l) => l.id));
  const lifetimeProfit = monthly.reduce((sum, m) => sum + Number(m.profit), 0);
  const lifetimeRevenue = monthly.reduce((sum, m) => sum + Number(m.revenue), 0);

  return (
    <div>
      <Link href="/customers" className="text-sm text-slate-600 hover:underline">← Customers</Link>
      <PageHeader
        title={customer.company || customer.name}
        description={`Sales rep: ${rep ? displayName(rep) : "unassigned"} · ${loads.length} loads · last 12 months ${money(lifetimeRevenue)} revenue, ${money(lifetimeProfit)} profit`}
        actions={
          <>
            <LinkButton href={`/loads/new?customer=${customer.id}`}>+ New load</LinkButton>
            <LinkButton variant="secondary" href={`/leads/new?customer=${customer.id}`}>+ Car quote</LinkButton>
          </>
        }
      />
      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Tasks" description="Tasks for this customer, including automatic profit-drop call tasks." />
          <TaskList tasks={tasks} team={people} me={profile.id} myRole={profile.role} showContext={false} empty="No tasks for this customer" />
          <div className="border-t border-slate-100 p-4">
            <NewTaskForm assignees={assigneeOptions(team)} customerId={customer.id} defaultAssignee={customer.sales_rep_id ? `user:${customer.sales_rep_id}` : `user:${profile.id}`} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Profit by month" />
          {monthly.length === 0 ? <EmptyState title="No loads yet" /> : (
            <table className={tableClass}>
              <thead className="bg-slate-50"><tr><th className={thClass}>Month</th><th className={thClass}>Loads</th><th className={`${thClass} text-right`}>Profit</th><th className={`${thClass} text-right`}>Change</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {monthly.map((m, i) => {
                  const prev = monthly[i + 1];
                  const change = prev && Number(prev.profit) > 0 ? (Number(m.profit) - Number(prev.profit)) / Number(prev.profit) : null;
                  return (
                    <tr key={m.month}>
                      <td className={tdClass}>{formatDate(m.month, { day: undefined })}</td>
                      <td className={tdClass}>{m.loads}</td>
                      <td className={`${tdClass} text-right`}>{money(m.profit)}</td>
                      <td className={`${tdClass} text-right ${change !== null && change < 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {change === null ? "—" : `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card className="mb-6">
        <CardHeader title={`Loads · ${loads.length}`} />
        {loads.length === 0 ? <EmptyState title="No loads yet" /> : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-slate-50"><tr><th className={thClass}>Load</th><th className={thClass}>Lane</th><th className={thClass}>Pickup</th><th className={thClass}>Status</th><th className={`${thClass} text-right`}>Rate / profit</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loads.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className={tdClass}><Link href={`/loads/${l.id}`} className="font-mono font-medium hover:underline">{l.load_number}</Link></td>
                    <td className={tdClass}>{place(l.origin_city, l.origin_state, l.origin_name)} → {place(l.dest_city, l.dest_state, l.dest_name)}</td>
                    <td className={tdClass}>{formatDate(l.pickup_date)}</td>
                    <td className={tdClass}><div className="flex flex-col gap-1"><CustomerStatusBadge status={l.customer_status} /><CarrierStatusBadge status={l.carrier_status} /></div></td>
                    <td className={`${tdClass} text-right`}>{money(l.customer_rate)}<div className="text-xs text-emerald-700">{money(l.profit)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Car quote requests (web form)" />
          {leads.length === 0 ? (
            <EmptyState title="No shipments yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className="bg-slate-50"><tr><th className={thClass}>Reference</th><th className={thClass}>Route</th><th className={thClass}>Vehicles</th><th className={thClass}>Stage</th><th className={thClass}>Booking</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => {
                    const b = bookings.get(l.id);
                    return (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className={tdClass}><Link href={`/leads/${l.id}`} className="font-mono font-medium text-slate-900 hover:underline">{l.reference}</Link><div className="text-xs text-slate-500">{formatDate(l.created_at)}</div></td>
                        <td className={tdClass}>{l.pickup_city}, {l.pickup_state} → {l.delivery_city}, {l.delivery_state}</td>
                        <td className={tdClass}>{vehicles.get(l.id)}</td>
                        <td className={tdClass}><LeadStatusBadge status={l.status} /></td>
                        <td className={tdClass}>{b ? <Link href={`/bookings/${b.id}`} className="flex flex-col gap-1 hover:underline"><span className="font-mono text-xs">{b.reference}</span><ShipmentStatusBadge status={b.status} /></Link> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact details" />
            <div className="space-y-4 p-4">
              <SalesRepForm
                customerId={customer.id}
                current={customer.sales_rep_id ?? null}
                me={profile.id}
                canReassign={profile.role === "admin"}
                options={team.filter((t) => t.active && (t.role === "sales" || t.role === "admin")).map((t) => ({ id: t.id, label: displayName(t) }))}
              />
              <CustomerForm customer={customer} />
            </div>
          </Card>
          <Card>
            <CardHeader title={`Locations · ${locations.length}`} description="Stores, yards and docks for this customer." />
            <ul className="divide-y divide-slate-100">
              {locations.map((loc) => (
                <li key={loc.id} className="flex items-start justify-between gap-2 px-4 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{loc.name}</p>
                    <p className="text-slate-600">{[loc.address, place(loc.city, loc.state), loc.zip].filter((x) => x && x !== "—").join(", ")}</p>
                    <p className="text-xs text-slate-500">{[loc.contact_name, loc.contact_phone, loc.hours].filter(Boolean).join(" · ")}</p>
                  </div>
                  <RemoveLocationButton customerId={customer.id} locationId={loc.id} />
                </li>
              ))}
            </ul>
            <details className="border-t border-slate-100 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Add location</summary>
              <div className="mt-3"><AddLocationForm customerId={customer.id} /></div>
            </details>
          </Card>
          {profile.role === "admin" && (
            <Card>
              <CardHeader title="Customer portal logins" description="They can post lanes for quotes, follow their loads and see invoices." />
              <ul className="divide-y divide-slate-100">
                {portalUsers.map((u) => (
                  <li key={u.id} className="px-4 py-2 text-sm">{u.full_name || u.email} <span className="text-slate-500">· {u.email}{u.active ? "" : " · disabled"}</span></li>
                ))}
              </ul>
              <div className="border-t border-slate-100 p-4"><AddPortalUserForm customerId={customer.id} /></div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
