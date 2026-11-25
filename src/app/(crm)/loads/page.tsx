import Link from "next/link";
import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, money } from "@/lib/format";
import {
  CARRIER_STATUSES, CARRIER_STATUS_LABEL, CUSTOMER_STATUSES, CUSTOMER_STATUS_LABEL, place,
  type CarrierStatus, type CustomerStatus, type Load,
} from "@/lib/tms";
import { Card, EmptyState, LinkButton, PageHeader, inputClass, tableClass, tdClass, thClass } from "@/components/ui";
import { CarrierStatusBadge, CustomerStatusBadge } from "@/components/tms-status";

export const metadata: Metadata = { title: "Loads" };

const OPEN_CUSTOMER: CustomerStatus[] = [
  "confirmed", "dispatched", "pickup_delayed", "picked_up", "running_late", "pod_received", "pod_issue", "delivered", "load_issue",
];

export default async function LoadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; cs?: string; ks?: string; q?: string; mine?: string }>;
}) {
  const { supabase, profile } = await requireInternal();
  const sp = await searchParams;
  const view = sp.view === "all" || sp.view === "billing" ? sp.view : "active";
  const cs = CUSTOMER_STATUSES.includes(sp.cs as CustomerStatus) ? (sp.cs as CustomerStatus) : null;
  const ks = CARRIER_STATUSES.includes(sp.ks as CarrierStatus) ? (sp.ks as CarrierStatus) : null;
  const q = (sp.q ?? "").trim().slice(0, 60);

  let query = supabase
    .from("loads")
    .select("*, customers(name, company), carriers(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (cs) query = query.eq("customer_status", cs);
  else if (view === "active") query = query.in("customer_status", OPEN_CUSTOMER);
  else if (view === "billing") query = query.in("customer_status", ["delivered", "pod_received", "invoiced", "payment_due"]);
  if (ks) query = query.eq("carrier_status", ks);
  if (sp.mine === "1") {
    query = profile.role === "dispatch" ? query.eq("dispatcher_id", profile.id) : query.eq("sales_rep_id", profile.id);
  }
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(
      `load_number.ilike.%${safe}%,customer_ref.ilike.%${safe}%,origin_city.ilike.%${safe}%,dest_city.ilike.%${safe}%,origin_name.ilike.%${safe}%,dest_name.ilike.%${safe}%`,
    );
  }
  type Row = Load & { customers: { name: string; company: string | null } | null; carriers: { name: string } | null };
  const loads = must(await query, "loads") as Row[];
  const showMoney = true;
  const totals = loads.reduce(
    (t, l) => ({ revenue: t.revenue + Number(l.customer_rate), profit: t.profit + Number(l.profit) }),
    { revenue: 0, profit: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Loads"
        description={profile.role === "dispatch" ? "Loads assigned to you." : "Every load with its customer and carrier status."}
        actions={profile.role !== "dispatch" ? <LinkButton href="/loads/new">+ New load</LinkButton> : undefined}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <select name="view" defaultValue={view} className={`${inputClass} w-auto`} aria-label="View">
          <option value="active">Active</option>
          <option value="billing">To bill</option>
          <option value="all">All</option>
        </select>
        <select name="cs" defaultValue={cs ?? ""} className={`${inputClass} w-auto`} aria-label="Customer status">
          <option value="">Any customer status</option>
          {CUSTOMER_STATUSES.map((s) => <option key={s} value={s}>{CUSTOMER_STATUS_LABEL[s]}</option>)}
        </select>
        <select name="ks" defaultValue={ks ?? ""} className={`${inputClass} w-auto`} aria-label="Carrier status">
          <option value="">Any carrier status</option>
          {CARRIER_STATUSES.map((s) => <option key={s} value={s}>{CARRIER_STATUS_LABEL[s]}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Load #, PO, city…" className={`${inputClass} w-48`} aria-label="Search" />
        {profile.role !== "admin" && (
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Mine only
          </label>
        )}
        <button className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Filter</button>
      </form>
      <Card>
        {loads.length === 0 ? (
          <EmptyState title="No loads match" body="Approved quote orders and accepted web quotes appear here automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-slate-50">
                <tr>
                  <th className={thClass}>Load</th>
                  <th className={thClass}>Customer</th>
                  <th className={thClass}>Lane</th>
                  <th className={thClass}>Pickup</th>
                  <th className={thClass}>Carrier</th>
                  <th className={thClass}>Customer status</th>
                  <th className={thClass}>Carrier status</th>
                  {showMoney && <th className={`${thClass} text-right`}>Rate / profit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loads.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className={tdClass}>
                      <Link href={`/loads/${l.id}`} className="font-mono font-medium text-slate-900 hover:underline">{l.load_number}</Link>
                      {l.customer_ref && <div className="text-xs text-slate-500">PO {l.customer_ref}</div>}
                    </td>
                    <td className={tdClass}>{l.customers?.company || l.customers?.name}</td>
                    <td className={tdClass}>
                      {place(l.origin_city, l.origin_state, l.origin_name)} → {place(l.dest_city, l.dest_state, l.dest_name)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatDate(l.pickup_date)}</td>
                    <td className={tdClass}>{l.carriers?.name ?? <span className="text-amber-700">Needs carrier</span>}</td>
                    <td className={tdClass}><CustomerStatusBadge status={l.customer_status} /></td>
                    <td className={tdClass}><CarrierStatusBadge status={l.carrier_status} /></td>
                    {showMoney && (
                      <td className={`${tdClass} whitespace-nowrap text-right`}>
                        {money(l.customer_rate)}
                        <div className={Number(l.profit) < 0 ? "text-xs text-red-700" : "text-xs text-emerald-700"}>{money(l.profit)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {showMoney && (
                <tfoot className="bg-slate-50 text-sm font-semibold">
                  <tr>
                    <td className={tdClass} colSpan={7}>{loads.length} loads</td>
                    <td className={`${tdClass} text-right`}>{money(totals.revenue)}<div className="text-xs text-emerald-700">{money(totals.profit)}</div></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
