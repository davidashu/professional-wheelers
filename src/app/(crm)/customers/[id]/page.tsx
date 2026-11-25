import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getTeam, must, teamMap, vehicleSummaries } from "@/lib/data";
import { formatDate, money } from "@/lib/format";
import type { Booking, Customer, Lead } from "@/lib/types";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { LeadStatusBadge, ShipmentStatusBadge } from "@/components/status";
import { CustomerForm } from "./customer-form";
import { StaffConversation } from "@/components/staff-conversation";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireStaff();
  const customer = must(await supabase.from("customers").select("*").eq("id", id).maybeSingle<Customer>(), "customer");
  if (!customer) notFound();
  const [leadsRes, bookingsRes] = await Promise.all([
    supabase.from("leads").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("bookings").select("*").eq("customer_id", id),
  ]);
  const leads = must(leadsRes, "shipments") as Lead[];
  const bookings = new Map((must(bookingsRes, "bookings") as Booking[]).map((b) => [b.lead_id, b]));
  const vehicles = await vehicleSummaries(supabase, leads.map((l) => l.id));
  const team = await getTeam(supabase);
  const lifetime = [...bookings.values()].reduce((sum, b) => sum + Number(b.total_price), 0);

  return (
    <div>
      <Link href="/customers" className="text-sm text-slate-600 hover:underline">← Customers</Link>
      <PageHeader
        title={customer.name}
        description={`${leads.length} shipment request${leads.length === 1 ? "" : "s"} · ${bookings.size} booked · ${money(lifetime)} booked revenue`}
        actions={<LinkButton href={`/leads/new?customer=${customer.id}`}>+ New shipment for this customer</LinkButton>}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Shipments" />
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
            <div className="p-4"><CustomerForm customer={customer} /></div>
          </Card>
          <Card id="messages">
            <CardHeader title="Messages" description="Conversation with this customer in their portal." />
            <StaffConversation
              supabase={supabase}
              customerId={customer.id}
              customerEmail={customer.email}
              leadId={leads.length === 1 ? leads[0]!.id : null}
              people={teamMap(team)}
              references={new Map(leads.map((l) => [l.id, l.reference]))}
              emailConfigured={serverEnv.emailConfigured}
              refresh={false}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
