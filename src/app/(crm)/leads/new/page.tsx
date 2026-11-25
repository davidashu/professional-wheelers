import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { todayIso } from "@/lib/validation";
import type { Customer } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "../lead-form";
import { createLead } from "../actions";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { supabase, profile } = await requireStaff();
  const { customer: customerId } = await searchParams;
  const team = await getTeam(supabase);
  let customer: Customer | null = null;
  if (customerId && /^[0-9a-f-]{36}$/.test(customerId)) {
    const { data } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle<Customer>();
    customer = data;
  }
  return (
    <div className="max-w-3xl">
      <Link href="/leads" className="text-sm text-slate-600 hover:underline">← Leads</Link>
      <PageHeader
        title={customer ? `New shipment for ${customer.name}` : "New phone lead"}
        description={
          customer
            ? "Contact details come from the existing customer record."
            : "If the email matches an existing customer, the lead is added to their record instead of creating a duplicate."
        }
      />
      <LeadForm
        mode="create"
        action={createLead}
        team={team.filter((t) => t.active).map((t) => ({ id: t.id, name: t.full_name || t.email }))}
        defaults={{
          customer_id: customer?.id ?? "",
          contact_name: customer?.name ?? "",
          contact_email: customer?.email ?? "",
          contact_phone: customer?.phone ?? "",
          contact_company: customer?.company ?? "",
          source: customer ? "repeat_customer" : "phone",
          assigned_to: profile.id,
          earliest_pickup_date: todayIso(),
          pickup_date_flexible: true,
          transport_type: "open",
          vehicles: [{ year: "", make: "", model: "", operable: true }],
        }}
      />
    </div>
  );
}
