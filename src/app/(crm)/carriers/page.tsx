import Link from "next/link";
import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, money } from "@/lib/format";
import { CARRIER_STANDING_LABEL, carrierWarnings, type Carrier } from "@/lib/tms";
import { Badge, Card, CardHeader, EmptyState, PageHeader, inputClass, tableClass, tdClass, thClass } from "@/components/ui";
import { CarrierForm } from "./carrier-form";

export const metadata: Metadata = { title: "Carriers" };

export default async function CarriersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, profile } = await requireInternal();
  const { q: raw } = await searchParams;
  const q = (raw ?? "").trim().slice(0, 60).replace(/[%,()]/g, " ");
  let query = supabase.from("carriers").select("*").order("name").limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,mc_number.ilike.%${q}%,lanes.ilike.%${q}%`);
  const [carriersRes, statsRes] = await Promise.all([
    query,
    supabase.from("loads").select("carrier_id, profit").not("carrier_id", "is", null).neq("customer_status", "cancelled"),
  ]);
  const carriers = must(carriersRes, "carriers") as Carrier[];
  const stats = new Map<string, { loads: number; profit: number }>();
  for (const l of must(statsRes, "carrier stats") as Array<{ carrier_id: string; profit: string }>) {
    const s = stats.get(l.carrier_id) ?? { loads: 0, profit: 0 };
    stats.set(l.carrier_id, { loads: s.loads + 1, profit: s.profit + Number(l.profit) });
  }
  const canEdit = profile.role !== "sales";

  return (
    <div>
      <PageHeader title="Carriers" description="Vetting status, insurance and history. Do-not-use carriers can't be assigned to loads." />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={raw ?? ""} placeholder="Name, MC #, lane…" className={`${inputClass} w-64`} aria-label="Search carriers" />
        <button className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Search</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {carriers.length === 0 ? <EmptyState title="No carriers yet" /> : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className="bg-slate-50"><tr><th className={thClass}>Carrier</th><th className={thClass}>Standing</th><th className={thClass}>Insurance</th><th className={thClass}>Loads</th><th className={`${thClass} text-right`}>Profit</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {carriers.map((c) => {
                    const warnings = carrierWarnings(c);
                    const s = stats.get(c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className={tdClass}>
                          <Link href={`/carriers/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.name}</Link>
                          <div className="text-xs text-slate-500">{[c.mc_number && `MC ${c.mc_number}`, c.phone].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className={tdClass}>
                          <Badge tone={c.standing === "active" ? "green" : c.standing === "do_not_use" ? "red" : "amber"}>{CARRIER_STANDING_LABEL[c.standing]}</Badge>
                        </td>
                        <td className={tdClass}>
                          {warnings.length ? <span className="text-xs text-amber-800">{warnings.join(" · ")}</span> : <span className="text-xs text-emerald-700">OK until {formatDate(c.insurance_expires_on)}</span>}
                        </td>
                        <td className={tdClass}>{s?.loads ?? 0}</td>
                        <td className={`${tdClass} text-right`}>{money(s?.profit ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {canEdit && (
          <Card>
            <CardHeader title="Add carrier" />
            <div className="p-4"><CarrierForm /></div>
          </Card>
        )}
      </div>
    </div>
  );
}
