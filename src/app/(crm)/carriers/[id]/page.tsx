import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, money } from "@/lib/format";
import { carrierWarnings, isUuid, place, type Carrier, type Load } from "@/lib/tms";
import { Alert, Card, CardHeader, EmptyState, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { CarrierStatusBadge, CustomerStatusBadge } from "@/components/tms-status";
import { CarrierForm } from "../carrier-form";

export const metadata: Metadata = { title: "Carrier" };

export default async function CarrierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, profile } = await requireInternal();
  const carrier = must(await supabase.from("carriers").select("*").eq("id", id).maybeSingle<Carrier>(), "carrier");
  if (!carrier) notFound();
  const loads = must(
    await supabase.from("loads").select("*").eq("carrier_id", id).order("created_at", { ascending: false }).limit(100),
    "loads",
  ) as Load[];
  const warnings = carrierWarnings(carrier);
  return (
    <div>
      <Link href="/carriers" className="text-sm text-slate-600 hover:underline">← Carriers</Link>
      <PageHeader title={carrier.name} description={[carrier.mc_number && `MC ${carrier.mc_number}`, carrier.dot_number && `DOT ${carrier.dot_number}`].filter(Boolean).join(" · ")} />
      {carrier.standing === "do_not_use" && <div className="mb-4"><Alert title="Do not use">{carrier.standing_reason ?? "This carrier can't be assigned to loads."}</Alert></div>}
      {warnings.length > 0 && carrier.standing !== "do_not_use" && <div className="mb-4"><Alert tone="warning" title="Check before booking">{warnings.join(" · ")}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`Loads · ${loads.length}`} />
          {loads.length === 0 ? <EmptyState title="No loads with this carrier yet" /> : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className="bg-slate-50"><tr><th className={thClass}>Load</th><th className={thClass}>Lane</th><th className={thClass}>Pickup</th><th className={thClass}>Status</th><th className={`${thClass} text-right`}>Pay</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {loads.map((l) => (
                    <tr key={l.id}>
                      <td className={tdClass}><Link href={`/loads/${l.id}`} className="font-mono hover:underline">{l.load_number}</Link></td>
                      <td className={tdClass}>{place(l.origin_city, l.origin_state)} → {place(l.dest_city, l.dest_state)}</td>
                      <td className={tdClass}>{formatDate(l.pickup_date)}</td>
                      <td className={tdClass}><div className="flex flex-col gap-1"><CustomerStatusBadge status={l.customer_status} /><CarrierStatusBadge status={l.carrier_status} /></div></td>
                      <td className={`${tdClass} text-right`}>{money(l.carrier_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Details" />
          <div className="p-4"><CarrierForm carrier={carrier} readOnly={profile.role === "sales"} /></div>
        </Card>
      </div>
    </div>
  );
}
