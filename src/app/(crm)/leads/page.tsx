import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getTeam, must } from "@/lib/data";
import { formatDate, relativeTime } from "@/lib/format";
import { LEAD_STATUS_LABEL, SOURCE_LABEL, type LeadSource, type LeadStatus } from "@/lib/labels";
import { Card, EmptyState, LinkButton, PageHeader, buttonClass, inputClass, tableClass, tdClass, thClass } from "@/components/ui";
import { LeadStatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Leads" };

const PAGE_SIZE = 25;
const STATUSES = Object.keys(LEAD_STATUS_LABEL) as LeadStatus[];

type Row = {
  id: string; reference: string; status: LeadStatus; source: LeadSource; contact_name: string;
  contact_email: string | null; contact_phone: string | null; contact_company: string | null;
  pickup_city: string; pickup_state: string; delivery_city: string; delivery_state: string;
  earliest_pickup_date: string; transport_type: string; assigned_name: string | null;
  vehicle_summary: string | null; created_at: string; total_count: number;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; rep?: string; page?: string }>;
}) {
  const { supabase, profile } = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const status = STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : null;
  const rep = sp.rep === "me" ? profile.id : sp.rep && /^[0-9a-f-]{36}$/.test(sp.rep) ? sp.rep : null;
  const page = Math.max(1, Number(sp.page) || 1);

  const [res, team] = await Promise.all([
    supabase.rpc("search_leads", {
      p_query: q || null,
      p_status: status,
      p_assigned_to: rep,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    getTeam(supabase),
  ]);
  const rows = must(res, "leads") as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (sp.rep) u.set("rep", sp.rep);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/leads?${s}` : "/leads";
  };

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Every quote request and phone lead. Search by name, email, phone, reference, city, ZIP or vehicle."
        actions={<LinkButton href="/leads/new">+ New phone lead</LinkButton>}
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-60 flex-1">
          <label htmlFor="q" className="sr-only">Search leads</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search leads…" className={inputClass} />
        </div>
        <div>
          <label htmlFor="status" className="sr-only">Stage</label>
          <select id="status" name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">All stages</option>
            {STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rep" className="sr-only">Rep</label>
          <select id="rep" name="rep" defaultValue={sp.rep ?? ""} className={inputClass}>
            <option value="">All reps</option>
            <option value="me">Assigned to me</option>
            {team.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
          </select>
        </div>
        <button className={buttonClass("secondary")}>Search</button>
        {(q || status || sp.rep) && <Link href="/leads" className="text-sm font-medium text-slate-600 hover:underline">Clear</Link>}
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={q || status || rep ? "No leads match your search" : "No leads yet"}
            body={q || status || rep ? "Try a different name, phone number, reference or filter." : "Quote requests from your website will appear here."}
            action={<LinkButton href="/leads/new" variant="secondary">Add a phone lead</LinkButton>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-slate-50">
                <tr>
                  <th className={thClass}>Customer</th>
                  <th className={thClass}>Route</th>
                  <th className={thClass}>Vehicles</th>
                  <th className={thClass}>Pickup</th>
                  <th className={thClass}>Stage</th>
                  <th className={thClass}>Rep</th>
                  <th className={thClass}>Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={tdClass}>
                      <Link href={`/leads/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.contact_name}</Link>
                      <div className="font-mono text-xs text-slate-500">{r.reference}</div>
                      {r.contact_company && <div className="text-xs text-slate-500">{r.contact_company}</div>}
                    </td>
                    <td className={tdClass}>{r.pickup_city}, {r.pickup_state} → {r.delivery_city}, {r.delivery_state}<div className="text-xs capitalize text-slate-500">{r.transport_type}</div></td>
                    <td className={`${tdClass} max-w-56`}>{r.vehicle_summary ?? "—"}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatDate(r.earliest_pickup_date)}</td>
                    <td className={tdClass}><LeadStatusBadge status={r.status} /></td>
                    <td className={tdClass}>{r.assigned_name ?? <span className="text-slate-400">Unassigned</span>}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{relativeTime(r.created_at)}<div className="text-xs text-slate-500">{SOURCE_LABEL[r.source]}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-600">{total} leads · page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className={buttonClass("secondary", "sm")} href={qs(page - 1)}>Previous</Link>}
              {page < pages && <Link className={buttonClass("secondary", "sm")} href={qs(page + 1)}>Next</Link>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
