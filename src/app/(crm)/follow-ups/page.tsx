import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, displayName } from "@/lib/auth";
import { getTeam, must, teamMap, uniq } from "@/lib/data";
import { formatDateTime, relativeTime, requestNow } from "@/lib/format";
import type { FollowUp, Lead } from "@/lib/types";
import { expiryFromDate } from "@/lib/quotes";
import { todayIso } from "@/lib/validation";
import { Card, EmptyState, LinkButton, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { LeadStatusBadge } from "@/components/status";
import { CompleteFollowUpButton } from "../leads/[id]/lead-forms";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const { supabase, profile } = await requireStaff();
  const { mine } = await searchParams;
  let q = supabase.from("follow_ups").select("*").is("completed_at", null).order("due_at", { ascending: true }).limit(300);
  if (mine) q = q.eq("assigned_to", profile.id);
  const [res, team] = await Promise.all([q, getTeam(supabase)]);
  const items = must(res, "follow-ups") as FollowUp[];
  const leadIds = uniq(items.map((f) => f.lead_id));
  const leadsRes = leadIds.length ? await supabase.from("leads").select("id, reference, contact_name, contact_phone, status").in("id", leadIds) : { data: [], error: null };
  const leads = new Map((must(leadsRes, "leads") as Lead[]).map((l) => [l.id, l]));
  const people = teamMap(team);
  const now = requestNow();
  const endOfToday = new Date(expiryFromDate(todayIso())); // end of today, Pacific
  const groups: Array<[string, FollowUp[], string]> = [
    ["Overdue", items.filter((f) => new Date(f.due_at).getTime() < now), "text-red-700"],
    ["Due today", items.filter((f) => { const t = new Date(f.due_at).getTime(); return t >= now && t <= endOfToday.getTime(); }), "text-amber-700"],
    ["Upcoming", items.filter((f) => new Date(f.due_at).getTime() > endOfToday.getTime()), "text-slate-700"],
  ];

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Open follow-ups across all leads. Schedule new ones from a lead."
        actions={<LinkButton variant={mine ? "primary" : "secondary"} href={mine ? "/follow-ups" : "/follow-ups?mine=1"}>{mine ? "Showing mine" : "Only mine"}</LinkButton>}
      />
      {items.length === 0 ? (
        <Card><EmptyState title="No open follow-ups" body="Schedule follow-ups from any lead to keep deals moving." /></Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, list, tone]) => list.length > 0 && (
            <Card key={label}>
              <h2 className={`border-b border-slate-100 px-4 py-3 text-sm font-semibold ${tone}`}>{label} ({list.length})</h2>
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead className="bg-slate-50"><tr><th className={thClass}>Due</th><th className={thClass}>Lead</th><th className={thClass}>Task</th><th className={thClass}>Rep</th><th className={thClass}><span className="sr-only">Action</span></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.map((f) => {
                      const l = leads.get(f.lead_id);
                      return (
                        <tr key={f.id}>
                          <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(f.due_at)}<div className="text-xs text-slate-500">{relativeTime(f.due_at)}</div></td>
                          <td className={tdClass}>
                            <Link href={`/leads/${f.lead_id}`} className="font-medium text-slate-900 hover:underline">{l?.contact_name}</Link>
                            <div className="flex items-center gap-2 text-xs text-slate-500"><span className="font-mono">{l?.reference}</span>{l && <LeadStatusBadge status={l.status} />}</div>
                            {l?.contact_phone && <a href={`tel:${l.contact_phone}`} className="text-xs text-brand-700 hover:underline">{l.contact_phone}</a>}
                          </td>
                          <td className={tdClass}>{f.note || "Follow up"}</td>
                          <td className={tdClass}>{displayName(people.get(f.assigned_to))}</td>
                          <td className={tdClass}><CompleteFollowUpButton id={f.id} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
