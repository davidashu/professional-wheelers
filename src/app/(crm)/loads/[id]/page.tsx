import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { displayName, requireInternal } from "@/lib/auth";
import { getTeam, must, teamMap } from "@/lib/data";
import { addDaysIso, formatDate, formatDateTime, money } from "@/lib/format";
import {
  CARRIER_STANDING_LABEL, EQUIPMENT_LABEL, PAY_TERMS_LABEL, isUuid, place,
  type Carrier, type Invoice, type Load, type LoadVehicle,
} from "@/lib/tms";
import type { Activity } from "@/lib/types";
import { Alert, Badge, Card, CardHeader, DefinitionList, EmptyState, PageHeader } from "@/components/ui";
import { CarrierBar, CustomerBar } from "@/components/tms-status";
import { TaskList, assigneeOptions, type TaskRow } from "../../tasks/task-list";
import { NewTaskForm } from "../../tasks/task-forms";
import {
  AssignForm, CarrierStatusForm, CustomerStatusForm, DetailsForm, InvoiceStatusButtons, NewInvoiceForm, RatesForm, VehiclesForm,
} from "./forms";

export const metadata: Metadata = { title: "Load" };

export default async function LoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, profile } = await requireInternal();
  const load = must(await supabase.from("loads").select("*").eq("id", id).maybeSingle<Load>(), "load");
  if (!load) notFound();

  const isCrm = profile.role !== "dispatch";
  const [customerRes, carrierRes, vehiclesRes, invoicesRes, carriersRes, tasksRes, activityRes, team] = await Promise.all([
    supabase.from("customers").select("id, name, company, payment_terms_days").eq("id", load.customer_id).maybeSingle(),
    load.carrier_id ? supabase.from("carriers").select("*").eq("id", load.carrier_id).maybeSingle<Carrier>() : Promise.resolve({ data: null, error: null }),
    supabase.from("load_vehicles").select("*").eq("load_id", id).order("position"),
    isCrm ? supabase.from("invoices").select("*").eq("load_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    supabase.from("carriers").select("id, name, mc_number, standing").order("name").limit(1000),
    supabase.from("tasks").select("*, customers(name, company), loads(load_number)").eq("load_id", id).order("created_at", { ascending: false }),
    supabase.from("activities").select("*").eq("load_id", id).order("created_at", { ascending: false }).limit(100),
    getTeam(supabase),
  ]);
  const customer = must(customerRes, "customer") as { id: string; name: string; company: string | null; payment_terms_days: number } | null;
  const carrier = must(carrierRes, "carrier") as Carrier | null;
  const vehicles = must(vehiclesRes, "vehicles") as LoadVehicle[];
  const invoices = must(invoicesRes, "invoices") as Invoice[];
  const carriers = must(carriersRes, "carriers") as Array<{ id: string; name: string; mc_number: string | null; standing: string }>;
  const tasks = must(tasksRes, "tasks") as TaskRow[];
  const activity = must(activityRes, "activity") as Activity[];
  const people = teamMap(team);
  const liveInvoice = invoices.find((i) => i.status !== "void");
  const insuranceExpired = carrier?.insurance_expires_on && carrier.insurance_expires_on < new Date().toISOString().slice(0, 10);
  const vehicleText = vehicles.map((v) => [v.vin, v.year, v.make, v.model].filter(Boolean).join(" ")).join("\n");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <Link href="/loads" className="text-sm text-slate-600 hover:underline">← Loads</Link>
      <PageHeader
        title={<span className="font-mono">{load.load_number}</span>}
        description={
          <>
            {customer ? (isCrm ? <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">{customer.company || customer.name}</Link> : customer.company || customer.name) : "—"}
            {" · "}{EQUIPMENT_LABEL[load.equipment]}
            {load.customer_ref ? ` · PO ${load.customer_ref}` : ""}
            {load.lane_request_id ? " · from a quote order" : ""}
          </>
        }
      />

      <Card className="mb-6 space-y-5 p-4">
        <CustomerBar status={load.customer_status} />
        <CustomerStatusForm loadId={load.id} status={load.customer_status} />
        <div className="border-t border-slate-100" />
        <CarrierBar status={load.carrier_status} />
        <CarrierStatusForm loadId={load.id} status={load.carrier_status} hasCarrier={!!load.carrier_id} />
        {(load.issue_note || load.cancel_reason) && (
          <Alert tone="warning" title={load.cancel_reason ? "Cancelled" : "Issue"}>{load.cancel_reason ?? load.issue_note}</Alert>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Lane" />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Pickup · {formatDate(load.pickup_date)}</p>
                <p className="mt-1 font-medium text-slate-900">{place(load.origin_city, load.origin_state, load.origin_name)}</p>
                <p className="text-sm text-slate-600">{load.origin_address}</p>
                <p className="text-sm text-slate-600">{[load.origin_contact, load.origin_phone].filter(Boolean).join(" · ")}</p>
                {load.pickup_window && <p className="text-sm text-slate-600">Hours: {load.pickup_window}</p>}
                {load.picked_up_at && <p className="mt-1 text-xs text-emerald-700">Picked up {formatDateTime(load.picked_up_at)}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Delivery · {formatDate(load.delivery_date)}</p>
                <p className="mt-1 font-medium text-slate-900">{place(load.dest_city, load.dest_state, load.dest_name)}</p>
                <p className="text-sm text-slate-600">{load.dest_address}</p>
                <p className="text-sm text-slate-600">{[load.dest_contact, load.dest_phone].filter(Boolean).join(" · ")}</p>
                {load.delivery_window && <p className="text-sm text-slate-600">Hours: {load.delivery_window}</p>}
                {load.delivered_at && <p className="mt-1 text-xs text-emerald-700">Delivered {formatDateTime(load.delivered_at)}</p>}
              </div>
              {load.special_instructions && (
                <p className="sm:col-span-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{load.special_instructions}</p>
              )}
            </div>
            <details className="border-t border-slate-100 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Edit load details</summary>
              <div className="mt-4"><DetailsForm load={load} /></div>
            </details>
          </Card>

          <Card>
            <CardHeader title={`Vehicles · ${vehicles.length}`} />
            <div className="p-4">
              {vehicles.length > 0 && (
                <ul className="mb-4 space-y-1 text-sm">
                  {vehicles.map((v) => (
                    <li key={v.id}><span className="font-mono text-xs text-slate-500">{v.vin ?? "no VIN"}</span> · {[v.year, v.make, v.model].filter(Boolean).join(" ")}</li>
                  ))}
                </ul>
              )}
              <VehiclesForm loadId={load.id} text={vehicleText} />
            </div>
          </Card>

          {isCrm && (
            <Card>
              <CardHeader title="Customer invoice" description="Issuing an invoice moves the load to Invoiced to customer and shows it in the customer's portal." />
              <div className="space-y-4 p-4">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md ring-1 ring-slate-200 px-3 py-2">
                    <div>
                      <Link href={`/invoices/${inv.id}`} className="font-mono font-medium hover:underline">{inv.invoice_number}</Link>{" "}
                      <Badge tone={inv.status === "paid" ? "green" : inv.status === "void" ? "gray" : inv.due_on < today ? "red" : "teal"}>
                        {inv.status === "open" && inv.due_on < today ? "Overdue" : inv.status}
                      </Badge>
                      <p className="text-xs text-slate-500">{money(inv.amount)} · issued {formatDate(inv.issued_on)} · due {formatDate(inv.due_on)}{inv.paid_on ? ` · paid ${formatDate(inv.paid_on)}` : ""}</p>
                    </div>
                    {inv.status === "open" && <InvoiceStatusButtons invoiceId={inv.id} loadId={load.id} />}
                  </div>
                ))}
                {!liveInvoice && load.customer_status !== "cancelled" && (
                  <NewInvoiceForm loadId={load.id} amount={load.customer_rate} dueOn={addDaysIso(today, customer?.payment_terms_days ?? 0)} />
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Tasks for this load" />
            <TaskList tasks={tasks} team={people} me={profile.id} myRole={profile.role} showContext={false} empty="No tasks for this load" />
            <div className="border-t border-slate-100 p-4">
              <NewTaskForm assignees={assigneeOptions(team)} loadId={load.id} customerId={load.customer_id} defaultAssignee={`user:${profile.id}`} />
            </div>
          </Card>

          <Card>
            <CardHeader title="History" />
            {activity.length === 0 ? <EmptyState title="No history yet" /> : (
              <ol className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <li key={a.id} className="px-4 py-2 text-sm">
                    <span className="text-slate-900">{a.message}</span>
                    <span className="ml-2 text-xs text-slate-500">{formatDateTime(a.created_at)}{a.actor_id ? ` · ${displayName(people.get(a.actor_id))}` : a.actor_type === "customer" ? " · customer" : ""}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Money" />
            <div className="p-4">
              <DefinitionList
                items={[
                  ["Customer rate", money(load.customer_rate)],
                  ["Carrier rate", money(load.carrier_rate)],
                  ["Quick-pay fee kept", `${money(load.quick_pay_fee)} (${Number(load.quick_pay_pct)}%)`],
                  ["Adjustments", <span key="a">{money(load.adjustments)}{load.adjustments_note ? ` · ${load.adjustments_note}` : ""}</span>],
                  ["Profit", <strong key="p" className={Number(load.profit) < 0 ? "text-red-700" : "text-emerald-700"}>{money(load.profit)}</strong>],
                  ["Carrier pay terms", PAY_TERMS_LABEL[load.carrier_pay_terms]],
                  ...(load.carrier_invoice_number ? [["Carrier invoice #", load.carrier_invoice_number] as [string, string]] : []),
                  ...(load.carrier_paid_at ? [["Carrier paid", formatDateTime(load.carrier_paid_at)] as [string, string]] : []),
                ]}
              />
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Edit rates</summary>
                <div className="mt-3"><RatesForm load={load} role={profile.role} /></div>
              </details>
            </div>
          </Card>

          <Card>
            <CardHeader title="Carrier and team" />
            <div className="space-y-4 p-4">
              {carrier && (
                <div className="text-sm">
                  <Link href={`/carriers/${carrier.id}`} className="font-medium hover:underline">{carrier.name}</Link>
                  <p className="text-slate-600">{[carrier.mc_number && `MC ${carrier.mc_number}`, carrier.phone, carrier.email].filter(Boolean).join(" · ")}</p>
                  {carrier.standing !== "active" && <p className="mt-1"><Badge tone={carrier.standing === "do_not_use" ? "red" : "amber"}>{CARRIER_STANDING_LABEL[carrier.standing]}</Badge></p>}
                  {insuranceExpired && <p className="mt-1 text-red-700">Insurance expired {formatDate(carrier.insurance_expires_on)}</p>}
                  {carrier.standing_reason && <p className="mt-1 text-amber-800">{carrier.standing_reason}</p>}
                </div>
              )}
              <p className="text-sm text-slate-600">
                Sales: {displayName(load.sales_rep_id ? people.get(load.sales_rep_id) : null)} · Dispatch: {displayName(load.dispatcher_id ? people.get(load.dispatcher_id) : null)}
              </p>
              <AssignForm
                load={load}
                carriers={carriers}
                role={profile.role}
                team={team.filter((t) => t.active).map((t) => ({ id: t.id, label: displayName(t), role: t.role }))}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
