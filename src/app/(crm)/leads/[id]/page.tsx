import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireStaff, displayName } from "@/lib/auth";
import { getSettings, getTeam, must, teamMap } from "@/lib/data";
import { formatDate, formatDateTime, money, relativeTime, addDaysIso, dateInputValue } from "@/lib/format";
import { serverEnv } from "@/lib/env";
import { linkForQuote } from "@/lib/quotes";
import { quoteTotals } from "@/lib/pricing";
import { quoteDisplayState, SOURCE_LABEL } from "@/lib/labels";
import { todayIso } from "@/lib/validation";
import type { Activity, Booking, Customer, EmailDelivery, FollowUp, Lead, Note, Quote, Vehicle } from "@/lib/types";
import { Alert, Badge, Card, CardHeader, DefinitionList, EmptyState, LinkButton } from "@/components/ui";
import { EmailStatusBadge, LeadStatusBadge, QuoteStatusBadge, ShipmentStatusBadge } from "@/components/status";
import { QuoteBuilder } from "./quote-builder";
import { QuoteRowActions } from "./quote-row-actions";
import { AssignmentForm, FollowUpForm, CompleteFollowUpButton, LostForm, NoteForm, ReopenButton, StageForm } from "./lead-forms";
import { Timeline } from "@/components/timeline";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revise?: string }> }) {
  const { id } = await params;
  const { revise } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireStaff();

  const leadRes = await supabase.from("leads").select("*").eq("id", id).maybeSingle<Lead>();
  const lead = must(leadRes, "lead");
  if (!lead) notFound();

  const [customerRes, vehiclesRes, quotesRes, notesRes, followRes, activityRes, emailsRes, bookingRes, otherRes, team, settings] = await Promise.all([
    supabase.from("customers").select("*").eq("id", lead.customer_id).single<Customer>(),
    supabase.from("lead_vehicles").select("*").eq("lead_id", id).order("position"),
    supabase.from("quotes").select("*").eq("lead_id", id).order("version", { ascending: false }),
    supabase.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("follow_ups").select("*").eq("lead_id", id).order("due_at", { ascending: true }),
    supabase.from("activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("email_deliveries").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("bookings").select("*").eq("lead_id", id).maybeSingle<Booking>(),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("customer_id", lead.customer_id).neq("id", id),
    getTeam(supabase),
    getSettings(supabase),
  ]);
  const customer = must(customerRes, "customer");
  const vehicles = must(vehiclesRes, "vehicles") as Vehicle[];
  const quotes = must(quotesRes, "quotes") as Quote[];
  const notes = must(notesRes, "notes") as Note[];
  const followUps = must(followRes, "follow-ups") as FollowUp[];
  const activities = must(activityRes, "activity") as Activity[];
  const emails = must(emailsRes, "emails") as EmailDelivery[];
  const booking = must(bookingRes, "booking");
  const people = teamMap(team);
  const activeTeam = team.filter((t) => t.active).map((t) => ({ id: t.id, name: displayName(t) }));

  const closed = lead.status === "booked" || lead.status === "lost";
  const draft = quotes.find((q) => q.status === "draft") ?? null;
  const reviseFrom = revise ? quotes.find((q) => q.id === revise) : null;
  const base = draft ?? reviseFrom ?? quotes[0] ?? null;
  const today = todayIso();
  const builderDefaults = {
    carrier_pay: base ? String(Number(base.carrier_pay)) : "",
    broker_fee: base ? String(Number(base.broker_fee)) : "",
    pickup_window_start: base && !reviseFrom && draft ? base.pickup_window_start : maxDate(lead.earliest_pickup_date, today),
    pickup_window_end: base && !reviseFrom && draft ? base.pickup_window_end : addDaysIso(maxDate(lead.earliest_pickup_date, today), lead.pickup_date_flexible ? 5 : 2),
    expires_on: draft ? dateInputValue(new Date(draft.expires_at)) : addDaysIso(today, settings.quote_validity_days),
    terms: base?.terms ?? settings.default_quote_terms,
    internal_note: draft?.internal_note ?? "",
  };
  const openFollowUps = followUps.filter((f) => !f.completed_at);
  const doneFollowUps = followUps.filter((f) => f.completed_at);

  return (
    <div>
      <Link href="/leads" className="text-sm text-slate-600 hover:underline">← Leads</Link>
      <div className="mb-6 mt-1 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{lead.contact_name}</h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-mono">{lead.reference}</span> · {SOURCE_LABEL[lead.source]} · received {formatDateTime(lead.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!closed && <StageForm leadId={lead.id} status={lead.status} />}
          {lead.status !== "booked" && lead.status !== "lost" && <LinkButton href={`/leads/${lead.id}/edit`} variant="secondary">Edit details</LinkButton>}
          {lead.status !== "booked" && lead.status !== "lost" && <LostForm leadId={lead.id} />}
          {lead.status === "lost" && <ReopenButton leadId={lead.id} />}
          {booking && <LinkButton href={`/bookings/${booking.id}`}>Open booking {booking.reference}</LinkButton>}
        </div>
      </div>

      {lead.status === "lost" && (
        <div className="mb-6"><Alert tone="warning" title="Lost">{lead.lost_reason} · {formatDateTime(lead.lost_at)}</Alert></div>
      )}
      {booking && (
        <div className="mb-6">
          <Alert tone="success" title={`Booked: ${booking.reference}`}>
            {money(booking.total_price)} · Shipment status: <ShipmentStatusBadge status={booking.status} />. Add pickup and delivery addresses on the booking.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Shipment request" />
            <div className="grid gap-6 p-4 sm:grid-cols-2">
              <DefinitionList
                items={[
                  ["Pickup", <span key="p">{lead.pickup_city}, {lead.pickup_state} {lead.pickup_zip}</span>],
                  ["Delivery", <span key="d">{lead.delivery_city}, {lead.delivery_state} {lead.delivery_zip}</span>],
                  ["Transport", lead.transport_type === "enclosed" ? "Enclosed" : "Open"],
                ]}
              />
              <DefinitionList
                items={[
                  ["Earliest pickup", formatDate(lead.earliest_pickup_date)],
                  ["Date flexible", lead.pickup_date_flexible ? "Yes" : "No, fixed date"],
                  ["Instructions", lead.special_instructions || <span key="n" className="text-slate-400">None</span>],
                ]}
              />
            </div>
            <div className="border-t border-slate-100 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicles ({vehicles.length})</h3>
              <ul className="divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
                {vehicles.map((v) => (
                  <li key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-slate-900">{v.year} {v.make} {v.model}</span>
                    {v.operable ? <Badge tone="green">Runs</Badge> : <Badge tone="amber">Inoperable</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card id="quotes">
            <CardHeader
              title="Quote"
              description="Carrier pay, broker fee and profit are internal. Customers only see the total, route, vehicles, pickup window and terms."
            />
            <div className="p-4">
              {closed ? (
                <p className="text-sm text-slate-600">{lead.status === "booked" ? "This lead is booked. The accepted quote is locked." : "Reopen the lead to send a new quote."}</p>
              ) : (
                <QuoteBuilder
                  leadId={lead.id}
                  defaults={builderDefaults}
                  hasDraft={Boolean(draft)}
                  nextVersion={draft ? draft.version : (quotes[0]?.version ?? 0) + 1}
                  hasActiveQuote={quotes.some((q) => quoteDisplayState(q) === "sent")}
                  emailConfigured={serverEnv.emailConfigured}
                  customerEmail={lead.contact_email}
                  draftId={draft?.id ?? null}
                />
              )}
            </div>
            <div className="border-t border-slate-100">
              <h3 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Quote history</h3>
              {quotes.filter((q) => q.status !== "draft").length === 0 ? (
                <EmptyState title="No quotes sent yet" body="Price the shipment above and send the quote link to the customer." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {quotes.filter((q) => q.status !== "draft").map((q) => {
                    const state = quoteDisplayState(q);
                    const t = quoteTotals({ carrierPay: Number(q.carrier_pay), brokerFee: Number(q.broker_fee) });
                    const link = state === "sent" ? linkForQuote(q) : null;
                    const qEmails = emails.filter((e) => e.quote_id === q.id);
                    return (
                      <li key={q.id} className="px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="flex items-center gap-2 font-semibold text-slate-900">
                              Version {q.version} <QuoteStatusBadge state={state} />
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Sent {formatDateTime(q.sent_at)} by {displayName(people.get(q.sent_by ?? ""))} · {state === "sent" ? "expires" : "expiry"} {formatDateTime(q.expires_at)}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Pickup window {formatDate(q.pickup_window_start)} – {formatDate(q.pickup_window_end)}
                              {q.first_viewed_at ? ` · viewed ${relativeTime(q.first_viewed_at)}` : " · not viewed yet"}
                              {q.responded_at ? ` · responded ${formatDateTime(q.responded_at)}` : ""}
                            </p>
                            {q.decline_reason && <p className="mt-1 text-sm text-red-700">Decline reason: {q.decline_reason}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-900">{money(q.total)}</p>
                            <p className="text-xs text-slate-500">Carrier {money(q.carrier_pay)} · Fee {money(q.broker_fee)}</p>
                            <p className="text-xs font-semibold text-emerald-700">Gross profit {money(t.grossProfit)} ({t.marginPercent}%)</p>
                          </div>
                        </div>
                        {q.internal_note && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Internal: {q.internal_note}</p>}
                        {qEmails.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {qEmails.map((e) => (
                              <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                <EmailStatusBadge status={e.status} /> {e.to_email} · {formatDateTime(e.created_at)}
                                {e.error && <span className="text-red-700">({e.error})</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        <QuoteRowActions
                          quoteId={q.id}
                          leadId={lead.id}
                          state={state}
                          link={link}
                          linkBroken={state === "sent" && !link}
                          canEmail={serverEnv.emailConfigured && Boolean(lead.contact_email)}
                          leadOpen={!closed}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity timeline" description="Significant changes to this lead, its quotes and booking." />
            <Timeline activities={activities} people={people} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer" action={<Link href={`/customers/${customer.id}`} className="text-sm font-medium text-brand-700 hover:underline">Customer record</Link>} />
            <div className="space-y-3 p-4 text-sm">
              <DefinitionList
                items={[
                  ["Name", lead.contact_name],
                  ["Email", lead.contact_email ? <a key="e" className="text-brand-700 hover:underline" href={`mailto:${lead.contact_email}`}>{lead.contact_email}</a> : "—"],
                  ["Phone", lead.contact_phone ? <a key="p" className="text-brand-700 hover:underline" href={`tel:${lead.contact_phone}`}>{lead.contact_phone}</a> : "—"],
                  ["Company", lead.contact_company || "—"],
                ]}
              />
              {(otherRes.count ?? 0) > 0 && (
                <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  Repeat customer: {otherRes.count} other shipment{otherRes.count === 1 ? "" : "s"} on file.
                </p>
              )}
              {customer.notes && <p className="text-xs text-slate-600">Customer note: {customer.notes}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment" />
            <div className="p-4">
              <AssignmentForm leadId={lead.id} assignedTo={lead.assigned_to} source={lead.source} team={activeTeam} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Follow-ups" />
            <div className="p-4">
              {openFollowUps.length === 0 ? (
                <p className="mb-3 text-sm text-slate-500">No open follow-ups.</p>
              ) : (
                <ul className="mb-4 space-y-2">
                  {openFollowUps.map((f) => {
                    const overdue = new Date(f.due_at) < new Date();
                    return (
                      <li key={f.id} className="flex items-start justify-between gap-2 rounded-md p-2 ring-1 ring-slate-200">
                        <div className="text-sm">
                          <p className={overdue ? "font-semibold text-red-700" : "font-semibold text-slate-900"}>
                            {overdue ? "Overdue · " : ""}{formatDateTime(f.due_at)}
                          </p>
                          <p className="text-slate-700">{f.note || "Follow up"}</p>
                          <p className="text-xs text-slate-500">{displayName(people.get(f.assigned_to))}</p>
                        </div>
                        <CompleteFollowUpButton id={f.id} />
                      </li>
                    );
                  })}
                </ul>
              )}
              <FollowUpForm leadId={lead.id} team={activeTeam} defaultRep={lead.assigned_to} />
              {doneFollowUps.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">{doneFollowUps.length} completed follow-up{doneFollowUps.length === 1 ? "" : "s"}.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Internal notes" description="Visible to staff only." />
            <div className="p-4">
              <NoteForm leadId={lead.id} />
              {notes.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-md bg-slate-50 p-3 text-sm">
                      <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
                      <p className="mt-1 text-xs text-slate-500">{displayName(people.get(n.author_id ?? ""))} · {formatDateTime(n.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function maxDate(a: string, b: string) {
  return a > b ? a : b;
}
