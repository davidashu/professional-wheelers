import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { EQUIPMENT_LABEL, QUOTE_ORDER_LABEL, QUOTE_ORDER_STATUSES, type QuoteOrder, type QuoteOrderStatus } from "@/lib/tms";
import { Card, CardHeader, EmptyState, PageHeader, cx } from "@/components/ui";
import { QuoteOrderBadge } from "@/components/tms-status";
import { PostQuoteOrderForm, PriceForm, ResponseForm } from "./forms";

export const metadata: Metadata = { title: "Quote orders" };

export default async function QuoteOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requireStaff();
  const { status: raw } = await searchParams;
  const status = QUOTE_ORDER_STATUSES.includes(raw as QuoteOrderStatus) ? (raw as QuoteOrderStatus) : null;
  let q = supabase.from("lane_requests").select("*, customers(name, company)").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  else q = q.in("status", ["new", "quoted", "too_high", "too_low"]);
  const [ordersRes, customersRes] = await Promise.all([
    q,
    supabase.from("customers").select("id, name, company").order("company", { nullsFirst: false }).limit(1000),
  ]);
  type Row = QuoteOrder & { customers: { name: string; company: string | null } | null };
  const orders = must(ordersRes, "quote orders") as Row[];
  const customers = (must(customersRes, "customers") as Array<{ id: string; name: string; company: string | null }>).map((c) => ({
    id: c.id, label: c.company ? `${c.company} (${c.name})` : c.name,
  }));

  return (
    <div>
      <PageHeader title="Quote orders" description="Lanes customers post for pricing, from the portal or by phone. Approved orders become loads." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter">
        <Chip href="/quote-orders" active={!status} label="Open" />
        {QUOTE_ORDER_STATUSES.map((s) => <Chip key={s} href={`/quote-orders?status=${s}`} active={status === s} label={QUOTE_ORDER_LABEL[s]} />)}
      </nav>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {orders.length === 0 ? <EmptyState title="No quote orders here" /> : (
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => (
                <li key={o.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {o.origin_city}, {o.origin_state} → {o.dest_city}, {o.dest_state}
                        <span className="ml-2 text-sm font-normal text-slate-500">{EQUIPMENT_LABEL[o.equipment]}</span>
                      </p>
                      <p className="text-sm text-slate-700">{o.description}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{o.reference}</span> · <Link href={`/customers/${o.customer_id}`} className="hover:underline">{o.customers?.company || o.customers?.name}</Link>
                        {" · "}posted {formatDateTime(o.created_at)}{o.pickup_date ? ` · ready ${formatDate(o.pickup_date)}` : ""}
                        {o.requested_by ? " · via portal" : ""}
                      </p>
                      {o.notes && <p className="text-xs text-slate-500">Notes: {o.notes}</p>}
                    </div>
                    <div className="text-right">
                      <QuoteOrderBadge status={o.status} />
                      {o.quoted_rate && <p className="mt-1 text-sm font-semibold">{money(o.quoted_rate)}</p>}
                      {o.target_rate && <p className="text-xs text-amber-800">Customer wants {money(o.target_rate)}</p>}
                    </div>
                  </div>
                  {o.response_note && <p className="rounded bg-slate-50 px-2 py-1 text-sm text-slate-700">Customer: {o.response_note}</p>}
                  {["new", "quoted", "too_high", "too_low"].includes(o.status) && <PriceForm id={o.id} current={o.quoted_rate} />}
                  {o.status === "quoted" && <ResponseForm id={o.id} />}
                  {o.load_id && <Link href={`/loads/${o.load_id}`} className="text-sm font-semibold text-brand-700 hover:underline">Open load →</Link>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Post a quote order" description="For customers who call or email." />
          <div className="p-4"><PostQuoteOrderForm customers={customers} /></div>
        </Card>
      </div>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cx("rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>
      {label}
    </Link>
  );
}
