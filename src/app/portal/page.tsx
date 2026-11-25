import Link from "next/link";
import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, money } from "@/lib/format";
import { EQUIPMENT_LABEL, place, type CustomerStatus, type Invoice, type PortalLoad, type QuoteOrder } from "@/lib/tms";
import { Badge, Card, CardHeader, EmptyState, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { CustomerBar, QuoteOrderBadge } from "@/components/tms-status";
import { AnswerQuoteForm, RequestQuoteForm } from "./forms";

export const metadata: Metadata = { title: "Shipments" };


const DONE: CustomerStatus[] = ["customer_paid", "paid", "cancelled"];

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { supabase } = await requireCustomer();
  const { show } = await searchParams;
  const [loadsRes, quotesRes, invoicesRes] = await Promise.all([
    supabase.rpc("portal_loads"),
    supabase.from("lane_requests").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("invoices").select("*").neq("status", "void").order("issued_on", { ascending: false }).limit(100),
  ]);
  const loads = must(loadsRes, "shipments") as PortalLoad[];
  const quotes = must(quotesRes, "quote orders") as QuoteOrder[];
  const invoices = must(invoicesRes, "invoices") as Invoice[];
  const loadNo = new Map(loads.map((l) => [l.id, l.load_number]));
  const visibleLoads = show === "all" ? loads : loads.filter((l) => !DONE.includes(l.customer_status));
  const openQuotes = quotes.filter((q) => q.status !== "approved" && q.status !== "cancelled");
  const today = new Date().toISOString().slice(0, 10);
  const balance = invoices.filter((i) => i.status === "open").reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Your shipments" description="Track loads, get quotes on new lanes and view invoices." />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={show === "all" ? "All loads" : "Active loads"}
            action={<Link href={show === "all" ? "/portal" : "/portal?show=all"} className="text-sm font-medium text-slate-600 hover:underline">{show === "all" ? "Show active only" : "Show all"}</Link>}
          />
          {visibleLoads.length === 0 ? <EmptyState title="No active loads" body="Post a lane for a quote and approved loads will show up here." /> : (
            <ul className="divide-y divide-slate-100">
              {visibleLoads.map((l) => (
                <li key={l.id} className="p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/portal/loads/${l.id}`} className="font-semibold text-slate-900 hover:underline">
                      {l.load_number} · {place(l.origin_city, l.origin_state)} → {place(l.dest_city, l.dest_state)}
                    </Link>
                    <span className="text-sm text-slate-500">
                      {EQUIPMENT_LABEL[l.equipment]} · Pickup {formatDate(l.pickup_date)}{l.customer_ref ? ` · Ref ${l.customer_ref}` : ""}
                    </span>
                  </div>
                  <CustomerBar status={l.customer_status} title="Status" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Get a quote" description="Post a lane and we'll price it. You can approve, or tell us it's too high or too low." />
          <div className="p-4"><RequestQuoteForm /></div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Quote orders" description={openQuotes.length ? `${openQuotes.length} open` : undefined} />
        {quotes.length === 0 ? <EmptyState title="No quote orders yet" /> : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-slate-50"><tr>
                <th className={thClass}>Ref</th><th className={thClass}>Lane</th><th className={thClass}>Status</th>
                <th className={thClass}>Our price</th><th className={thClass}>Your answer</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className={`${tdClass} font-mono`}>{q.reference}</td>
                    <td className={tdClass}>
                      <p className="font-medium">{q.origin_city}, {q.origin_state} → {q.dest_city}, {q.dest_state}</p>
                      <p className="text-xs text-slate-500">{EQUIPMENT_LABEL[q.equipment]} · {q.description}</p>
                    </td>
                    <td className={tdClass}><QuoteOrderBadge status={q.status} /></td>
                    <td className={tdClass}>
                      {q.quoted_rate ? <span className="font-semibold">{money(q.quoted_rate)}</span> : <span className="text-slate-500">Pricing…</span>}
                      {q.quote_note && <p className="text-xs text-slate-500">{q.quote_note}</p>}
                    </td>
                    <td className={tdClass}>
                      {q.status === "approved" && q.load_id ? (
                        <Link href={`/portal/loads/${q.load_id}`} className="text-sm font-semibold hover:underline">Load {loadNo.get(q.load_id) ?? ""} →</Link>
                      ) : q.status === "cancelled" ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <>
                          {(q.status === "too_high" || q.status === "too_low") && (
                            <p className="mb-1 text-xs text-slate-500">You said {q.status === "too_high" ? "too high" : "too low"}{q.target_rate ? ` (${money(q.target_rate)})` : ""}. We&apos;ll re-quote.</p>
                          )}
                          <AnswerQuoteForm id={q.id} canApprove={q.status === "quoted"} />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Invoices" description={balance > 0 ? `Open balance ${money(balance)}` : "No open balance"} />
        {invoices.length === 0 ? <EmptyState title="No invoices yet" /> : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-slate-50"><tr>
                <th className={thClass}>Invoice</th><th className={thClass}>Load</th><th className={thClass}>Issued</th>
                <th className={thClass}>Due</th><th className={thClass}>Amount</th><th className={thClass}>Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((i) => {
                  const overdue = i.status === "open" && i.due_on < today;
                  return (
                    <tr key={i.id}>
                      <td className={tdClass}><Link href={`/portal/invoices/${i.id}`} className="font-mono font-medium hover:underline">{i.invoice_number}</Link></td>
                      <td className={tdClass}>{loadNo.get(i.load_id) ?? "—"}</td>
                      <td className={tdClass}>{formatDate(i.issued_on)}</td>
                      <td className={tdClass}>{formatDate(i.due_on)}</td>
                      <td className={tdClass}>{money(i.amount)}</td>
                      <td className={tdClass}>
                        <Badge tone={i.status === "paid" ? "green" : overdue ? "red" : "amber"}>{i.status === "paid" ? "Paid" : overdue ? "Past due" : "Payment due"}</Badge>
                      </td>
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
