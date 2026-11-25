import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getTeam, must, teamMap } from "@/lib/data";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { quoteTotals } from "@/lib/pricing";
import type { Activity, Booking, Quote } from "@/lib/types";
import { Badge, Card, CardHeader, DefinitionList, PageHeader } from "@/components/ui";
import { ShipmentStatusBadge } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { BookingForm } from "./booking-form";
import { linkForQuote } from "@/lib/quotes";
import { CopyLink } from "@/components/copy-link";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Booking" };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireStaff();
  const booking = must(await supabase.from("bookings").select("*").eq("id", id).maybeSingle<Booking>(), "booking");
  if (!booking) notFound();
  const [quoteRes, activityRes, team] = await Promise.all([
    supabase.from("quotes").select("carrier_pay, broker_fee, total, version, link_id, token_hash").eq("id", booking.quote_id).single<Quote>(),
    supabase.from("activities").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    getTeam(supabase),
  ]);
  const quote = must(quoteRes, "quote");
  const s = booking.snapshot;
  const customerLink = linkForQuote(quote);
  const t = quoteTotals({ carrierPay: Number(quote.carrier_pay), brokerFee: Number(quote.broker_fee) });

  return (
    <div>
      <Link href="/bookings" className="text-sm text-slate-600 hover:underline">← Bookings</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Booking <span className="font-mono">{booking.reference}</span> <ShipmentStatusBadge status={booking.status} /></span>}
        description={<>Accepted {formatDateTime(s.accepted_at)} from quote v{s.quote_version} · <Link className="text-brand-700 hover:underline" href={`/leads/${booking.lead_id}`}>Lead {s.reference}</Link></>}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Customer details and agreement" />
            <div className="space-y-3 p-4 text-sm">
              {booking.agreement_signed_at ? (
                <>
                  <Alert tone="success" title="Agreement signed">
                    Signed by {booking.agreement_signed_name} on {formatDateTime(booking.agreement_signed_at)}. The customer also submitted the pickup and delivery details below.
                  </Alert>
                  <details>
                    <summary className="cursor-pointer font-medium text-slate-700">View the exact agreement text they signed</summary>
                    <p className="mt-2 whitespace-pre-wrap text-slate-600">{booking.agreement_text}</p>
                  </details>
                </>
              ) : (
                <>
                  <Alert tone="warning" title="Waiting for the customer">
                    The customer hasn&apos;t submitted addresses or signed the agreement yet. They use the same link as their quote.
                  </Alert>
                  {customerLink ? <CopyLink url={customerLink} label="Copy customer booking link" /> : <p className="text-xs text-slate-500">The link can&apos;t be rebuilt with the current secret; enter details below instead.</p>}
                </>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Pickup, delivery and carrier" description="Collect full addresses and contacts now that the shipment is booked. Payment and dispatch-board posting happen outside this system." />
            <div className="p-4"><BookingForm booking={booking} /></div>
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <Timeline activities={must(activityRes, "activity") as Activity[]} people={teamMap(team)} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Accepted quote" description="Locked at acceptance." />
            <div className="space-y-4 p-4">
              <DefinitionList
                items={[
                  ["Customer total", <strong key="t">{money(booking.total_price)}</strong>],
                  ["Carrier pay", money(quote.carrier_pay)],
                  ["Broker fee", money(quote.broker_fee)],
                  ["Gross profit", <span key="g" className="font-semibold text-emerald-700">{money(t.grossProfit)} ({t.marginPercent}%)</span>],
                  ["Pickup window", `${formatDate(s.pickup_window_start)} – ${formatDate(s.pickup_window_end)}`],
                  ["Transport", s.transport_type === "enclosed" ? "Enclosed" : "Open"],
                  ["Route", `${s.pickup.city}, ${s.pickup.state} ${s.pickup.zip} → ${s.delivery.city}, ${s.delivery.state} ${s.delivery.zip}`],
                ]}
              />
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicles</p>
                <ul className="space-y-1 text-sm">
                  {s.vehicles.map((v, i) => (
                    <li key={i} className="flex items-center justify-between">{v.year} {v.make} {v.model} {v.operable ? <Badge tone="green">Runs</Badge> : <Badge tone="amber">Inoperable</Badge>}</li>
                  ))}
                </ul>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">Terms the customer accepted</summary>
                <p className="mt-2 whitespace-pre-wrap text-slate-600">{s.terms}</p>
              </details>
            </div>
          </Card>
          <Card>
            <CardHeader title="Customer contact" />
            <div className="p-4">
              <DefinitionList
                items={[
                  ["Name", s.contact.name],
                  ["Email", s.contact.email ? <a key="e" className="text-brand-700 hover:underline" href={`mailto:${s.contact.email}`}>{s.contact.email}</a> : "—"],
                  ["Phone", s.contact.phone ? <a key="p" className="text-brand-700 hover:underline" href={`tel:${s.contact.phone}`}>{s.contact.phone}</a> : "—"],
                  ["Company", s.contact.company || "—"],
                ]}
              />
              <Link href={`/customers/${booking.customer_id}`} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Customer record →</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
