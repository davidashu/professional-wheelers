import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, money } from "@/lib/format";
import { SHIPMENT_LABEL, SHIPMENT_ORDER, type ShipmentStatus } from "@/lib/labels";
import type { Booking } from "@/lib/types";
import { Card, EmptyState, PageHeader, cx, tableClass, tdClass, thClass } from "@/components/ui";
import { ShipmentStatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requireStaff();
  const { status: raw } = await searchParams;
  const status = SHIPMENT_ORDER.includes(raw as ShipmentStatus) ? (raw as ShipmentStatus) : null;
  let q = supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const [res, countsRes] = await Promise.all([q, supabase.from("bookings").select("status")]);
  const bookings = must(res, "bookings") as Booking[];
  const counts = new Map<string, number>();
  for (const b of must(countsRes, "booking counts") as Array<{ status: string }>) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);

  return (
    <div>
      <PageHeader title="Bookings" description="Accepted quotes. Add addresses and contacts, assign a carrier, and track the shipment." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by status">
        <FilterChip href="/bookings" active={!status} label="All" count={[...counts.values()].reduce((a, b) => a + b, 0)} />
        {SHIPMENT_ORDER.map((s) => <FilterChip key={s} href={`/bookings?status=${s}`} active={status === s} label={SHIPMENT_LABEL[s]} count={counts.get(s) ?? 0} />)}
      </nav>
      <Card>
        {bookings.length === 0 ? (
          <EmptyState title="No bookings here" body="When a customer accepts a quote, the booking appears here automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-slate-50"><tr><th className={thClass}>Booking</th><th className={thClass}>Customer</th><th className={thClass}>Route</th><th className={thClass}>Pickup window</th><th className={thClass}>Carrier</th><th className={thClass}>Total</th><th className={thClass}>Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((b) => {
                  const missing = !b.pickup_address || !b.delivery_address;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className={tdClass}><Link href={`/bookings/${b.id}`} className="font-mono font-medium text-slate-900 hover:underline">{b.reference}</Link><div className="text-xs text-slate-500">{formatDate(b.created_at)}</div></td>
                      <td className={tdClass}>{b.snapshot.contact?.name}{missing && <div className="text-xs font-medium text-amber-700">Addresses needed</div>}</td>
                      <td className={tdClass}>{b.snapshot.pickup.city}, {b.snapshot.pickup.state} → {b.snapshot.delivery.city}, {b.snapshot.delivery.state}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>{formatDate(b.snapshot.pickup_window_start, { year: undefined })} – {formatDate(b.snapshot.pickup_window_end)}</td>
                      <td className={tdClass}>{b.carrier_name ?? <span className="text-slate-400">Not assigned</span>}</td>
                      <td className={tdClass}>{money(b.total_price)}</td>
                      <td className={tdClass}><ShipmentStatusBadge status={b.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cx("rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset", active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>
      {label} <span className={active ? "text-slate-300" : "text-slate-400"}>{count}</span>
    </Link>
  );
}
