import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, displayName } from "@/lib/auth";
import { getTeam, must, teamMap, uniq, vehicleSummaries } from "@/lib/data";
import { formatDate, money, relativeTime, requestNow } from "@/lib/format";
import type { Booking, FollowUp, Lead, Quote } from "@/lib/types";
import { Alert, Card, CardHeader, EmptyState, LinkButton, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { ShipmentStatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, profile } = await requireStaff();
  const { error: pageError } = await searchParams;
  const nowIso = new Date().toISOString();

  const [newLeadsRes, newCountRes, awaitingRes, overdueRes, bookingsRes, team] = await Promise.all([
    supabase.from("leads").select("*").eq("status", "new").order("created_at", { ascending: false }).limit(8),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("quotes").select("*").eq("status", "sent").gt("expires_at", nowIso).order("expires_at", { ascending: true }).limit(50),
    supabase.from("follow_ups").select("*").is("completed_at", null).lt("due_at", nowIso).order("due_at", { ascending: true }).limit(50),
    supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(8),
    getTeam(supabase),
  ]);
  const stageCounts = await Promise.all(
    PIPELINE.map(async ([status]) => {
      const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", status);
      return count ?? 0;
    }),
  );

  const newLeads = must(newLeadsRes, "new requests") as Lead[];
  const awaiting = must(awaitingRes, "quotes") as Quote[];
  const overdue = must(overdueRes, "follow-ups") as FollowUp[];
  const bookings = must(bookingsRes, "bookings") as Booking[];
  const people = teamMap(team);

  const relatedIds = uniq([...awaiting.map((q) => q.lead_id), ...overdue.map((f) => f.lead_id)]);
  const relatedRes = relatedIds.length
    ? await supabase.from("leads").select("id, reference, contact_name, pickup_city, pickup_state, delivery_city, delivery_state, assigned_to").in("id", relatedIds)
    : { data: [], error: null };
  const related = new Map((must(relatedRes, "leads") as Lead[]).map((l) => [l.id, l]));
  const vehicles = await vehicleSummaries(supabase, newLeads.map((l) => l.id));

  const myOverdue = overdue.filter((f) => f.assigned_to === profile.id).length;

  return (
    <div>
      <PageHeader
        title={`Good ${greeting()}, ${displayName(profile).split(" ")[0]}`}
        description="What needs attention today."
        actions={<LinkButton href="/leads/new">+ New phone lead</LinkButton>}
      />
      {pageError === "admin_only" && <div className="mb-4"><Alert tone="warning">That page is for admins only.</Alert></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="New requests" value={newCountRes.count ?? 0} href="/leads?status=new" tone="blue" />
        <Stat label="Quotes awaiting reply" value={awaiting.length} href="/leads?status=quote_sent" tone="teal" />
        <Stat label="Overdue follow-ups" value={overdue.length} href="/follow-ups" tone={overdue.length ? "red" : "slate"} hint={myOverdue ? `${myOverdue} assigned to you` : undefined} />
        <Stat label="Recent bookings" value={bookings.filter((b) => requestNow() - new Date(b.created_at).getTime() < 7 * 86400000).length} href="/bookings" tone="green" hint="last 7 days" />
      </div>

      <nav aria-label="Pipeline" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PIPELINE.map(([status, label], i) => (
          <Link
            key={status}
            href={`/leads?status=${status}`}
            className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 hover:ring-brand-300"
          >
            <span className="block text-xs font-medium text-slate-500">{label}</span>
            <span className="block font-display text-lg font-extrabold tabular-nums text-ink">{stageCounts[i]}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="New requests" description="Newest first. Contact these customers and price their shipments." action={<Link href="/leads?status=new" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
          {newLeads.length === 0 ? (
            <EmptyState title="No new requests" body="New website quote requests will show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {newLeads.map((l) => (
                <li key={l.id}>
                  <Link href={`/leads/${l.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-900">{l.contact_name} <span className="ml-1 font-mono text-xs text-slate-500">{l.reference}</span></p>
                      <span className="text-xs text-slate-500">{relativeTime(l.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{l.pickup_city}, {l.pickup_state} → {l.delivery_city}, {l.delivery_state} · {vehicles.get(l.id) ?? "—"}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Pickup {formatDate(l.earliest_pickup_date)}{l.pickup_date_flexible ? " (flexible)" : ""} · {l.transport_type === "enclosed" ? "Enclosed" : "Open"} · {l.assigned_to ? displayName(people.get(l.assigned_to)) : "Unassigned"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Quotes awaiting a reply" description="Active quotes, soonest to expire first." />
          {awaiting.length === 0 ? (
            <EmptyState title="No quotes waiting" body="Quotes you send will appear here until the customer responds or the quote expires." />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className="bg-slate-50"><tr><th className={thClass}>Customer</th><th className={thClass}>Total</th><th className={thClass}>Expires</th><th className={thClass}>Viewed</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {awaiting.slice(0, 8).map((q) => {
                    const l = related.get(q.lead_id);
                    return (
                      <tr key={q.id} className="hover:bg-slate-50">
                        <td className={tdClass}><Link href={`/leads/${q.lead_id}`} className="font-medium text-slate-900 hover:underline">{l?.contact_name}</Link><div className="font-mono text-xs text-slate-500">{l?.reference} · v{q.version}</div></td>
                        <td className={tdClass}>{money(q.total)}</td>
                        <td className={tdClass}>{relativeTime(q.expires_at)}</td>
                        <td className={tdClass}>{q.first_viewed_at ? <span className="text-emerald-700">Yes</span> : <span className="text-slate-400">Not yet</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Overdue follow-ups" action={<Link href="/follow-ups" className="text-sm font-medium text-brand-700 hover:underline">All follow-ups</Link>} />
          {overdue.length === 0 ? (
            <EmptyState title="You're all caught up" body="No follow-ups are past due." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overdue.slice(0, 8).map((f) => {
                const l = related.get(f.lead_id);
                return (
                  <li key={f.id}>
                    <Link href={`/leads/${f.lead_id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-900">{l?.contact_name} <span className="ml-1 font-mono text-xs text-slate-500">{l?.reference}</span></p>
                        <p className="text-sm text-slate-600">{f.note || "Follow up"}</p>
                        <p className="text-xs text-slate-500">{displayName(people.get(f.assigned_to))}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs font-semibold text-red-700">Due {relativeTime(f.due_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent bookings" action={<Link href="/bookings" className="text-sm font-medium text-brand-700 hover:underline">All bookings</Link>} />
          {bookings.length === 0 ? (
            <EmptyState title="No bookings yet" body="Accepted quotes become bookings automatically." />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className="bg-slate-50"><tr><th className={thClass}>Booking</th><th className={thClass}>Route</th><th className={thClass}>Total</th><th className={thClass}>Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className={tdClass}><Link href={`/bookings/${b.id}`} className="font-medium text-slate-900 hover:underline">{b.snapshot.contact?.name}</Link><div className="font-mono text-xs text-slate-500">{b.reference} · {formatDate(b.created_at, { year: undefined })}</div></td>
                      <td className={tdClass}>{b.snapshot.pickup.city}, {b.snapshot.pickup.state} → {b.snapshot.delivery.city}, {b.snapshot.delivery.state}</td>
                      <td className={tdClass}>{money(b.total_price)}</td>
                      <td className={tdClass}><ShipmentStatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const PIPELINE = [
  ["new", "New request"],
  ["contacted", "Contacted"],
  ["pricing", "Pricing"],
  ["quote_sent", "Quote sent"],
  ["booked", "Booked"],
] as const;

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Los_Angeles" }).format(new Date()));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function Stat({ label, value, href, tone, hint }: { label: string; value: number; href: string; tone: "blue" | "teal" | "red" | "green" | "slate"; hint?: string }) {
  const color = { blue: "text-blue-700", teal: "text-brand-700", red: "text-red-700", green: "text-emerald-700", slate: "text-slate-900" }[tone];
  return (
    <Link href={href} className="rounded-xl bg-white p-4 shadow-xs ring-1 ring-slate-200 hover:ring-brand-300">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Link>
  );
}
