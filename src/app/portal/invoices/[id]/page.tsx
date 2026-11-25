import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth";
import { must } from "@/lib/data";
import { isUuid, type Invoice, type PortalLoad } from "@/lib/tms";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Invoice" };

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireCustomer();
  const invoice = must(await supabase.from("invoices").select("*").eq("id", id).neq("status", "void").maybeSingle<Invoice>(), "invoice");
  if (!invoice) notFound();
  const [loadsRes, customerRes] = await Promise.all([
    supabase.rpc("portal_loads"),
    supabase.rpc("portal_customer").maybeSingle<{ name: string; company: string | null; billing_email: string | null; email: string | null }>(),
  ]);
  const load = (must(loadsRes, "shipments") as PortalLoad[]).find((l) => l.id === invoice.load_id);
  const customer = must(customerRes, "account");
  if (!load || !customer) notFound();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/portal/loads/${load.id}`} className="text-sm font-medium text-slate-600 hover:underline">← Load {load.load_number}</Link>
        <PrintButton />
      </div>
      <InvoiceDocument invoice={invoice} load={load} billTo={customer} />
    </div>
  );
}
