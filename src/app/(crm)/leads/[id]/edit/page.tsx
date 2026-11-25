import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import type { Lead, Vehicle } from "@/lib/types";
import { Alert, PageHeader } from "@/components/ui";
import { LeadForm } from "../../lead-form";
import { updateLeadDetails } from "../../actions";

export const metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireStaff();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle<Lead>();
  if (!lead) notFound();
  const { data: vehicles } = await supabase.from("lead_vehicles").select("*").eq("lead_id", id).order("position");

  return (
    <div className="max-w-3xl">
      <Link href={`/leads/${id}`} className="text-sm text-slate-600 hover:underline">← {lead.reference}</Link>
      <PageHeader title="Edit lead details" description="Quotes already sent keep the details the customer saw." />
      {lead.status === "booked" || lead.status === "lost" ? (
        <Alert tone="warning">This lead is {lead.status}. Its details are locked.</Alert>
      ) : (
        <LeadForm
          mode="edit"
          action={updateLeadDetails}
          defaults={{
            lead_id: lead.id,
            contact_name: lead.contact_name,
            contact_email: lead.contact_email ?? "",
            contact_phone: lead.contact_phone ?? "",
            contact_company: lead.contact_company ?? "",
            pickup_city: lead.pickup_city, pickup_state: lead.pickup_state, pickup_zip: lead.pickup_zip,
            delivery_city: lead.delivery_city, delivery_state: lead.delivery_state, delivery_zip: lead.delivery_zip,
            earliest_pickup_date: lead.earliest_pickup_date,
            pickup_date_flexible: lead.pickup_date_flexible,
            transport_type: lead.transport_type,
            special_instructions: lead.special_instructions ?? "",
            vehicles: ((vehicles ?? []) as Vehicle[]).map((v) => ({ year: v.year, make: v.make, model: v.model, operable: v.operable })),
          }}
        />
      )}
    </div>
  );
}
