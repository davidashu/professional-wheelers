import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { hashToken, isWellFormedToken } from "@/lib/tokens";
import type { PublicQuote } from "@/lib/types";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { RespondForms } from "./respond-forms";
import { BookingDetailsForm } from "./booking-details-form";
import { openPortalFromQuote } from "@/app/portal/actions";

export const metadata: Metadata = {
  title: "Your vehicle shipping quote",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function loadQuote(token: string): Promise<PublicQuote | null> {
  if (!isWellFormedToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("get_public_quote", { p_token_hash: hashToken(token) });
  if (error) throw new Error("Quote lookup failed");
  return (data as PublicQuote | null) ?? null;
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await loadQuote(token);

  if (!q) {
    return (
      <Shell company="Vehicle shipping quote">
        <h1 className="text-xl font-bold text-slate-900">This link isn&apos;t valid</h1>
        <p className="mt-2 text-slate-600">Check that you copied the whole link from your email or text. If it still doesn&apos;t work, contact us and we&apos;ll resend your quote.</p>
      </Shell>
    );
  }

  if (q.state === "superseded" || q.state === "withdrawn") {
    return (
      <Shell company={q.company_name}>
        <h1 className="text-xl font-bold text-slate-900">{q.state === "superseded" ? "This quote has been updated" : "This quote is no longer available"}</h1>
        <p className="mt-2 text-slate-600">
          {q.state === "superseded"
            ? "We sent you a revised quote for this shipment. Please use the link in our most recent message."
            : "Please contact us if you'd still like to ship your vehicle."}
        </p>
        <p className="mt-4 text-sm text-slate-500">Reference {q.reference}</p>
      </Shell>
    );
  }

  const first = q.customer_name?.split(" ")[0];
  return (
    <Shell company={q.company_name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Quote {q.reference}{q.version && q.version > 1 ? ` (revision ${q.version})` : ""}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{first ? `${first}, here's your quote` : "Your vehicle shipping quote"}</h1>
        </div>
        <StateBadge state={q.state} />
      </div>

      <div className="mt-6 rounded-lg bg-slate-50 p-5 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">Total price</p>
        <p className="text-4xl font-bold tabular-nums text-slate-900" data-testid="public-total">{money(q.total)}</p>
        <p className="mt-1 text-sm text-slate-600">All-in price for door-to-door transport.</p>
        {q.state === "active" && <p className="mt-2 text-sm font-medium text-amber-800">Valid until {formatDateTime(q.expires_at)}</p>}
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Item label="Pickup">{q.pickup?.city}, {q.pickup?.state} {q.pickup?.zip}</Item>
        <Item label="Delivery">{q.delivery?.city}, {q.delivery?.state} {q.delivery?.zip}</Item>
        <Item label="Pickup window">{formatDate(q.pickup_window_start)} – {formatDate(q.pickup_window_end)}</Item>
        <Item label="Transport type">{q.transport_type === "enclosed" ? "Enclosed carrier" : "Open carrier"}</Item>
      </dl>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Vehicles</h2>
        <ul className="mt-2 divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
          {q.vehicles?.map((v, i) => (
            <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{v.year} {v.make} {v.model}</span>
              <span className="text-slate-500">{v.operable ? "Runs" : "Inoperable"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Terms</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600" data-testid="terms">{q.terms}</p>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        {q.state === "active" && <RespondForms token={token} />}
        {q.state === "expired" && (
          <div role="status" className="rounded-md bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">This quote expired on {formatDateTime(q.expires_at)}.</p>
            <p className="mt-1 text-sm">Carrier rates change often. Reply to our email or call us and we&apos;ll send an updated quote.</p>
          </div>
        )}
        {q.state === "accepted" && (
          <div className="space-y-6">
            <div role="status" className="rounded-md bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
              <p className="font-semibold">You accepted this quote on {formatDateTime(q.responded_at)}. Your shipment is booked.</p>
              {q.booking_reference && <p className="mt-1 text-sm">Booking reference <span className="font-mono font-bold" data-testid="booking-reference">{q.booking_reference}</span>.</p>}
            </div>
            {q.booking && !q.booking.details_submitted && q.pickup && q.delivery && (
              <BookingDetailsForm token={token} booking={q.booking} pickup={q.pickup} delivery={q.delivery} />
            )}
            {q.booking?.details_submitted && (
              <div className="rounded-md p-4 ring-1 ring-slate-200" data-testid="booking-details-summary">
                <h2 className="font-semibold text-slate-900">Your booking details</h2>
                <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                  <Item label="Pickup">{q.booking.pickup_address}<br />{q.booking.pickup_contact_name} · {q.booking.pickup_contact_phone}</Item>
                  <Item label="Delivery">{q.booking.delivery_address}<br />{q.booking.delivery_contact_name} · {q.booking.delivery_contact_phone}</Item>
                </dl>
                <p className="mt-4 text-sm text-slate-600">Agreement signed by <strong>{q.booking.signed_name}</strong> on {formatDateTime(q.booking.signed_at)}. We&apos;ll contact you when a carrier is assigned.</p>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">View the agreement you signed</summary>
                  <p className="mt-2 whitespace-pre-wrap text-slate-600">{q.booking.agreement_text}</p>
                </details>
              </div>
            )}
          </div>
        )}
        {q.state === "declined" && (
          <div role="status" className="rounded-md bg-slate-100 p-4 text-slate-800 ring-1 ring-slate-200">
            <p className="font-semibold">You declined this quote on {formatDateTime(q.responded_at)}.</p>
            <p className="mt-1 text-sm">Changed your mind? Contact us and we&apos;ll send a new quote.</p>
          </div>
        )}
      </div>

      <form action={openPortalFromQuote} className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
        <input type="hidden" name="token" value={token} />
        <div className="text-sm">
          <p className="font-semibold text-slate-900">Your customer portal</p>
          <p className="text-slate-600">See all your quotes and bookings, track your shipment and message our team.</p>
        </div>
        <SubmitButton variant="secondary" pendingText="Opening…">Open my customer portal</SubmitButton>
      </form>
    </Shell>
  );
}

function Shell({ company, children }: { company: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 text-base font-bold tracking-tight text-brand-800">{company}</div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">{children}</div>
      </main>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function StateBadge({ state }: { state: PublicQuote["state"] }) {
  const map = { active: ["teal", "Awaiting your response"], expired: ["amber", "Expired"], accepted: ["green", "Booked"], declined: ["gray", "Declined"], superseded: ["gray", "Updated"], withdrawn: ["gray", "Unavailable"] } as const;
  const [tone, label] = map[state];
  return <Badge tone={tone}>{label}</Badge>;
}
