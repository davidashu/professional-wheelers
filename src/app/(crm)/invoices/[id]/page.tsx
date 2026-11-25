import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { must } from "@/lib/data";
import { isUuid, type Invoice, type Load, type LoadVehicle } from "@/lib/tms";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireStaff();
  const invoice = must(await supabase.from("invoices").select("*").eq("id", id).maybeSingle<Invoice>(), "invoice");
  if (!invoice) notFound();
  const [loadRes, vehiclesRes, customerRes] = await Promise.all([
    supabase.from("loads").select("*").eq("id", invoice.load_id).maybeSingle<Load>(),
    supabase.from("load_vehicles").select("*").eq("load_id", invoice.load_id).order("position"),
    supabase.from("customers").select("name, company, billing_email, email").eq("id", invoice.customer_id).maybeSingle(),
  ]);
  const load = must(loadRes, "load");
  const customer = must(customerRes, "customer") as { name: string; company: string | null; billing_email: string | null; email: string | null } | null;
  if (!load || !customer) notFound();
  const vehicles = must(vehiclesRes, "vehicles") as LoadVehicle[];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/loads/${load.id}`} className="text-sm font-medium text-slate-600 hover:underline">← Back to load {load.load_number}</Link>
        <PrintButton />
      </div>
      <InvoiceDocument invoice={invoice} load={{ ...load, vehicles }} billTo={customer} />
    </div>
  );
}
