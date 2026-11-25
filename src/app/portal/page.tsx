import type { Metadata } from "next";
import Link from "next/link";
import { customerStage, requirePortal } from "@/lib/portal";
import { formatDate, formatDateTime, money, pickupWindow } from "@/lib/format";
import { SHIPMENT_LABEL, SHIPMENT_ORDER } from "@/lib/labels";
import type { PortalShipment } from "@/lib/types";
import { Badge, Card, EmptyState, LinkButton, buttonClass, cx } from "@/components/ui";
import { PortalShell } from "./portal-shell";

export const metadata: Metadata = { title: "My shipments", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PortalHome() {
  const portal = await requirePortal();
  const { shipments } = portal;
  const toReview = shipments.filter((s) => s.quote?.state === "active").length;
  const needsDetails = shipments.filter((s) => s.booking && !s.booking.details_submitted && s.booking.status !== "delivered").length;
  const moving = shipments.filter((s) => s.booking && s.booking.status !== "delivered").length;
  const first = portal.customer.name.split(" ")[0];

  return (
    <PortalShell company={portal.company_name} customerName={portal.customer.name} unread={portal.unread_messages}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hi {first}</h1>
        <p className="mt-1 text-sm text-slate-600">Your quotes, bookings and shipment status in one place.</p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Quotes to review" value={toReview} highlight={toReview > 0} />
        <Stat label="Bookings needing details" value={needsDetails} highlight={needsDetails > 0} />
        <Stat label="Shipments in progress" value={moving} />
      </div>

      {portal.unread_messages > 0 && (
        <Link
          href="/portal/messages"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-3 text-sm ring-1 ring-brand-100 hover:bg-brand-100"
        >
          <span className="font-semibold text-brand-800">
            You have {portal.unread_messages} new message{portal.unread_messages === 1 ? "" : "s"} from our team
          </span>
          <span className="font-semibold text-brand-700">Read →</span>
        </Link>
      )}

      {shipments.length === 0 ? (
        <Card>
          <EmptyState
            title="No shipments yet"
            body="Tell us what you're shipping and where. We'll review it and send you a firm price."
            action={<LinkButton href="/get-a-quote">Get a shipping quote</LinkButton>}
          />
        </Card>
      ) : (
        <ul className="space-y-4" data-testid="portal-shipments">
          {shipments.map((s) => (
            <li key={s.reference}>
              <ShipmentCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cx("rounded-lg bg-white px-4 py-3 shadow-sm ring-1", highlight ? "ring-brand-600" : "ring-slate-200")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 text-2xl font-bold tabular-nums", highlight ? "text-brand-800" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function ShipmentCard({ s }: { s: PortalShipment }) {
  const stage = customerStage(s);
  const q = s.quote;
  const b = s.booking;
  return (
    <Card className="overflow-hidden" data-testid={`shipment-${s.reference}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <p className="text-lg font-semibold text-slate-900">
            {s.pickup.city}, {s.pickup.state} <span className="text-slate-400">→</span> {s.delivery.city}, {s.delivery.state}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="font-mono">{s.reference}</span> · requested {formatDate(s.created_at)}
            {b && <> · booking <span className="font-mono">{b.reference}</span></>}
          </p>
        </div>
        <Badge tone={stage.tone}>{stage.label}</Badge>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto] sm:px-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Vehicles">
            {s.vehicles.map((v, i) => (
              <span key={i} className="block">
                {v.year} {v.make} {v.model}
                {!v.operable && <span className="text-slate-500"> (doesn&apos;t run)</span>}
              </span>
            ))}
          </Row>
          <Row label="Transport">{s.transport_type === "enclosed" ? "Enclosed carrier" : "Open carrier"}</Row>
          <Row label={q ? "Pickup window" : "Earliest pickup"}>
            {q ? pickupWindow(q.pickup_window_start, q.pickup_window_end) : `${formatDate(s.earliest_pickup_date)}${s.pickup_date_flexible ? " (flexible)" : ""}`}
          </Row>
          {q && q.state === "active" && <Row label="Quote valid until">{formatDateTime(q.expires_at)}</Row>}
          {b?.pickup_address && <Row label="Pickup address">{b.pickup_address}</Row>}
          {b?.delivery_address && <Row label="Delivery address">{b.delivery_address}</Row>}
        </dl>
        {(q || b) && (
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{b ? "Booked price" : "Quoted price"}</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{money(b ? b.total_price : q!.total)}</p>
            {q && q.version > 1 && !b && <p className="text-xs text-slate-500">Revised quote</p>}
          </div>
        )}
      </div>

      {b && <ShipmentProgress b={b} />}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        {q?.state === "active" && q.url && (
          <a href={q.url} className={buttonClass("primary")}>Review and accept quote</a>
        )}
        {b && !b.details_submitted && b.status !== "delivered" && q?.url && (
          <a href={q.url} className={buttonClass("primary")}>Add pickup and delivery details</a>
        )}
        {b?.details_submitted && q?.url && (
          <a href={q.url} className={buttonClass("secondary")}>View booking and agreement</a>
        )}
        {q?.state === "expired" && <p className="text-sm text-amber-800">This quote expired. Message us for an updated price.</p>}
        <Link href={`/portal/messages?about=${s.reference}`} className={buttonClass("secondary")}>
          Message us about this shipment
        </Link>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

function ShipmentProgress({ b }: { b: NonNullable<PortalShipment["booking"]> }) {
  const current = SHIPMENT_ORDER.indexOf(b.status);
  const when: Record<string, string | null> = {
    awaiting_carrier: null,
    carrier_assigned: b.carrier_assigned_at,
    picked_up: b.picked_up_at,
    delivered: b.delivered_at,
  };
  return (
    <ol className="grid grid-cols-4 gap-2 px-4 pb-4 sm:px-5" aria-label="Shipment progress">
      {SHIPMENT_ORDER.map((st, i) => {
        const done = i <= current;
        return (
          <li key={st} aria-current={i === current ? "step" : undefined}>
            <div className={cx("h-1.5 rounded-full", done ? "bg-brand-600" : "bg-slate-200")} />
            <p className={cx("mt-1.5 text-xs font-medium", done ? "text-slate-900" : "text-slate-400")}>{SHIPMENT_LABEL[st]}</p>
            {when[st] && <p className="text-[11px] text-slate-500">{formatDate(when[st])}</p>}
          </li>
        );
      })}
    </ol>
  );
}
