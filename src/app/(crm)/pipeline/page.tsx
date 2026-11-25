import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, displayName } from "@/lib/auth";
import { getTeam, must, teamMap, vehicleSummaries } from "@/lib/data";
import { formatDate, money, relativeTime, requestNow } from "@/lib/format";
import { LEAD_STATUS_LABEL, PIPELINE, type LeadStatus } from "@/lib/labels";
import type { Lead, Quote } from "@/lib/types";
import { PageHeader, LinkButton } from "@/components/ui";
import { PipelineStageSelect } from "./stage-select";

export const metadata: Metadata = { title: "Pipeline" };

const headerTone: Record<LeadStatus, string> = {
  new: "border-blue-500", contacted: "border-violet-500", pricing: "border-amber-500",
  quote_sent: "border-teal-500", booked: "border-emerald-500", lost: "border-slate-400",
};

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ rep?: string }> }) {
  const { supabase, profile } = await requireStaff();
  const { rep } = await searchParams;
  const since = new Date(requestNow() - 30 * 86400000).toISOString();

  let query = supabase.from("leads").select("*").in("status", ["new", "contacted", "pricing", "quote_sent", "booked"]).order("created_at", { ascending: false }).limit(500);
  if (rep === "me") query = query.eq("assigned_to", profile.id);
  const [leadsRes, lostRes, team] = await Promise.all([
    query,
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "lost").gte("lost_at", since),
    getTeam(supabase),
  ]);
  // Booked column shows the last 30 days only so the board stays scannable.
  const leads = (must(leadsRes, "leads") as Lead[]).filter((l) => l.status !== "booked" || l.updated_at >= since);
  const people = teamMap(team);
  const vehicles = await vehicleSummaries(supabase, leads.map((l) => l.id));
  const quotedIds = leads.filter((l) => l.status === "quote_sent" || l.status === "booked").map((l) => l.id);
  const quotesRes = quotedIds.length
    ? await supabase.from("quotes").select("lead_id, total, status, expires_at").in("lead_id", quotedIds).in("status", ["sent", "accepted"])
    : { data: [], error: null };
  const latestTotal = new Map((must(quotesRes, "quotes") as Quote[]).map((q) => [q.lead_id, q]));

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description={`New Request → Contacted → Pricing → Quote Sent → Booked. ${lostRes.count ?? 0} lost in the last 30 days.`}
        actions={
          <>
            <LinkButton variant={rep === "me" ? "primary" : "secondary"} href={rep === "me" ? "/pipeline" : "/pipeline?rep=me"}>
              {rep === "me" ? "Showing my leads" : "Only my leads"}
            </LinkButton>
            <LinkButton variant="secondary" href="/leads?status=lost">View lost</LinkButton>
          </>
        }
      />
      <div className="grid gap-4 overflow-x-auto pb-4 lg:grid-cols-5">
        {PIPELINE.map((stage) => {
          const items = leads.filter((l) => l.status === stage);
          return (
            <section key={stage} className="flex min-w-64 flex-col rounded-lg bg-slate-100/80 ring-1 ring-slate-200" aria-label={LEAD_STATUS_LABEL[stage]}>
              <header className={`flex items-center justify-between border-t-4 ${headerTone[stage]} rounded-t-lg px-3 py-2`}>
                <h2 className="text-sm font-semibold text-slate-800">{LEAD_STATUS_LABEL[stage]}</h2>
                <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{items.length}</span>
              </header>
              <ul className="flex-1 space-y-2 p-2">
                {items.length === 0 && <li className="px-2 py-6 text-center text-xs text-slate-500">Nothing here</li>}
                {items.map((l) => {
                  const q = latestTotal.get(l.id);
                  const expired = q && q.status === "sent" && new Date(q.expires_at) <= new Date();
                  return (
                    <li key={l.id} className="rounded-md bg-white p-3 shadow-sm ring-1 ring-slate-200">
                      <Link href={`/leads/${l.id}`} className="block">
                        <p className="text-sm font-semibold text-slate-900 hover:underline">{l.contact_name}</p>
                        <p className="font-mono text-[11px] text-slate-500">{l.reference}</p>
                        <p className="mt-1 text-xs text-slate-700">{l.pickup_city}, {l.pickup_state} → {l.delivery_city}, {l.delivery_state}</p>
                        <p className="text-xs text-slate-500">{vehicles.get(l.id)}</p>
                        <p className="mt-1 text-xs text-slate-500">Pickup {formatDate(l.earliest_pickup_date, { year: undefined })} · {relativeTime(l.created_at)}</p>
                        {q && <p className={`mt-1 text-xs font-semibold ${expired ? "text-amber-700" : "text-slate-800"}`}>{money(q.total)}{expired ? " · expired" : ""}</p>}
                        <p className="mt-1 text-xs text-slate-500">{l.assigned_to ? displayName(people.get(l.assigned_to)) : "Unassigned"}</p>
                      </Link>
                      {stage !== "booked" && <PipelineStageSelect leadId={l.id} status={l.status} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
