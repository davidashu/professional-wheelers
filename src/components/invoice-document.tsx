import { formatDate, money } from "@/lib/format";
import { COMPANY, place } from "@/lib/tms";
import { Badge } from "@/components/ui";

export type InvoiceDoc = {
  invoice_number: string; amount: string; issued_on: string; due_on: string; status: "open" | "paid" | "void";
  paid_on: string | null; notes: string | null;
};
export type InvoiceLoad = {
  load_number: string; customer_ref: string | null;
  origin_name: string | null; origin_city: string | null; origin_state: string | null;
  dest_name: string | null; dest_city: string | null; dest_state: string | null;
  pickup_date: string | null; delivered_at: string | null;
  vehicles: Array<{ vin: string | null; year: number | null; make: string | null; model: string | null }>;
};
export type InvoiceBillTo = { name: string; company: string | null; billing_email: string | null; email: string | null };

const STATUS_TONE = { open: "amber", paid: "green", void: "gray" } as const;

/** Printable invoice, shared by staff and the customer portal. Never shows carrier pay or profit. */
export function InvoiceDocument({ invoice, load, billTo }: { invoice: InvoiceDoc; load: InvoiceLoad; billTo: InvoiceBillTo }) {
  const overdue = invoice.status === "open" && invoice.due_on < new Date().toISOString().slice(0, 10);
  return (
    <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-800 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-lg font-bold text-slate-900">{COMPANY.name}</p>
          <p className="text-slate-600">{COMPANY.cityState}</p>
          <p className="text-slate-600">MC# {COMPANY.mc} · DOT# {COMPANY.dot}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight text-slate-900">INVOICE</p>
          <p className="font-mono">{invoice.invoice_number}</p>
          <div className="mt-1">
            <Badge tone={overdue ? "red" : STATUS_TONE[invoice.status]}>{overdue ? "Past due" : invoice.status === "open" ? "Payment due" : invoice.status === "paid" ? "Paid" : "Void"}</Badge>
          </div>
        </div>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-1 font-medium">{billTo.company ?? billTo.name}</p>
          {billTo.company && <p>{billTo.name}</p>}
          {(billTo.billing_email ?? billTo.email) && <p>{billTo.billing_email ?? billTo.email}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:text-right">
          <dt className="text-slate-500">Issued</dt><dd>{formatDate(invoice.issued_on)}</dd>
          <dt className="text-slate-500">Due</dt><dd>{formatDate(invoice.due_on)}</dd>
          {invoice.paid_on && <><dt className="text-slate-500">Paid</dt><dd>{formatDate(invoice.paid_on)}</dd></>}
          <dt className="text-slate-500">Load #</dt><dd className="font-mono">{load.load_number}</dd>
          {load.customer_ref && <><dt className="text-slate-500">Your ref</dt><dd>{load.customer_ref}</dd></>}
        </dl>
      </section>

      <table className="w-full border-t border-slate-200 text-left">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 font-semibold">Description</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 border-y border-slate-200">
          <tr>
            <td className="py-3 pr-4">
              <p className="font-medium">Transportation: {place(load.origin_city, load.origin_state, load.origin_name)} to {place(load.dest_city, load.dest_state, load.dest_name)}</p>
              <p className="text-slate-600">
                Picked up {formatDate(load.pickup_date)}{load.delivered_at ? ` · Delivered ${formatDate(load.delivered_at)}` : ""}
              </p>
              {load.vehicles.length > 0 && (
                <ul className="mt-1 text-slate-600">
                  {load.vehicles.map((v, i) => (
                    <li key={i}>{[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}{v.vin ? ` · VIN ${v.vin}` : ""}</li>
                  ))}
                </ul>
              )}
            </td>
            <td className="py-3 text-right align-top">{money(invoice.amount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="py-3 text-right font-semibold">Total due</td>
            <td className="py-3 text-right text-base font-bold">{invoice.status === "paid" ? money(0) : money(invoice.amount)}</td>
          </tr>
        </tfoot>
      </table>

      {invoice.notes && <p className="mt-4 whitespace-pre-line text-slate-600">{invoice.notes}</p>}
      <p className="mt-8 text-xs text-slate-500">Thank you for shipping with {COMPANY.name}. Please include the invoice number with your payment.</p>
    </article>
  );
}
