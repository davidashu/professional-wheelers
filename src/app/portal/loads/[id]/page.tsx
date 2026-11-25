import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { EQUIPMENT_LABEL, isUuid, place, type Invoice, type PortalLoad } from "@/lib/tms";
import { Card, CardHeader, DefinitionList, EmptyState, PageHeader } from "@/components/ui";
import { CustomerBar } from "@/components/tms-status";

export const metadata: Metadata = { title: "Load" };

export default async function PortalLoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireCustomer();
  const loads = must(await supabase.rpc("portal_loads"), "shipments") as PortalLoad[];
  const load = loads.find((l) => l.id === id);
  if (!load) notFound();
  const [historyRes, invoicesRes] = await Promise.all([
    supabase.rpc("portal_load_history", { p_load_id: id }),
    supabase.from("invoices").select("*").eq("load_id", id).neq("status", "void"),
  ]);
  const history = must(historyRes, "history") as Array<{ created_at: string; message: string }>;
  const invoices = must(invoicesRes, "invoices") as Invoice[];

  return (
    <div className="space-y-6">
      <Link href="/portal" className="text-sm font-medium text-slate-600 hover:underline">← All shipments</Link>
      <PageHeader title={`Load ${load.load_number}`} description={`${place(load.origin_city, load.origin_state)} → ${place(load.dest_city, load.dest_state)}`} />
      <Card><div className="p-4"><CustomerBar status={load.customer_status} title="Status" /></div></Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <div className="p-4">
            <DefinitionList items={[
              ["Pickup", <span key="p">{place(load.origin_city, load.origin_state, load.origin_name)}<br />{formatDate(load.pickup_date)}{load.picked_up_at ? ` · picked up ${formatDateTime(load.picked_up_at)}` : ""}</span>],
              ["Delivery", <span key="d">{place(load.dest_city, load.dest_state, load.dest_name)}<br />{formatDate(load.delivery_date)}{load.delivered_at ? ` · delivered ${formatDateTime(load.delivered_at)}` : ""}</span>],
              ["Equipment", EQUIPMENT_LABEL[load.equipment]],
              ["Your reference", load.customer_ref ?? "—"],
              ["Rate", money(load.customer_rate)],
              ["Invoice", invoices.length ? invoices.map((i) => <Link key={i.id} href={`/portal/invoices/${i.id}`} className="font-mono hover:underline">{i.invoice_number}</Link>) : "Not invoiced yet"],
            ]} />
            {load.vehicles.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicles</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {load.vehicles.map((v, i) => <li key={i}>{[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}{v.vin ? <span className="font-mono text-slate-500"> · {v.vin}</span> : null}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Updates" />
          {history.length === 0 ? <EmptyState title="No updates yet" /> : (
            <ol className="divide-y divide-slate-100">
              {history.map((h, i) => (
                <li key={i} className="px-4 py-3 text-sm">
                  <p>{h.message}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(h.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
