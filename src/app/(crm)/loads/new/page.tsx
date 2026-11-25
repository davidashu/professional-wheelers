import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { must } from "@/lib/data";
import { Card, PageHeader } from "@/components/ui";
import { NewLoadForm } from "./new-load-form";

export const metadata: Metadata = { title: "New load" };

export default async function NewLoadPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { supabase } = await requireStaff();
  const { customer } = await searchParams;
  const customers = must(
    await supabase.from("customers").select("id, name, company").order("company", { nullsFirst: false }).order("name").limit(1000),
    "customers",
  ) as Array<{ id: string; name: string; company: string | null }>;
  return (
    <div>
      <Link href="/loads" className="text-sm text-slate-600 hover:underline">← Loads</Link>
      <PageHeader title="New load" description="For a booked shipment. Customers can also approve quotes in their portal, which creates the load for you." />
      <Card className="p-4">
        <NewLoadForm customers={customers} defaultCustomer={customer ?? ""} />
      </Card>
    </div>
  );
}
