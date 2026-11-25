"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Label, inputClass } from "@/components/ui";
import {
  CARRIER_STATUSES, CARRIER_STATUS_LABEL, CUSTOMER_STATUSES, CUSTOMER_STATUS_LABEL, NEEDS_ISSUE_NOTE, PAY_TERMS,
  PAY_TERMS_LABEL, type CarrierStatus, type CustomerStatus, type Load,
} from "@/lib/tms";
import {
  assignLoad, createInvoice, replaceVehicles, setCarrierStatus, setCustomerStatus, setInvoiceStatus, updateLoadDetails, updateRates,
} from "../actions";
import { LoadFields } from "../load-fields";

export function CustomerStatusForm({ loadId, status }: { loadId: string; status: CustomerStatus }) {
  const [next, setNext] = useState<CustomerStatus>(status);
  const needsNote = next === "cancelled" || NEEDS_ISSUE_NOTE.includes(next);
  return (
    <ActionForm action={setCustomerStatus} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="load_id" value={loadId} />
      <div>
        <Label htmlFor="cs">Change customer status</Label>
        <select id="cs" name="status" value={next} onChange={(e) => setNext(e.target.value as CustomerStatus)} className={`${inputClass} w-auto`}>
          {CUSTOMER_STATUSES.map((s) => <option key={s} value={s}>{CUSTOMER_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {needsNote && (
        <div className="min-w-56 flex-1">
          <Label htmlFor="cs-note">{next === "cancelled" ? "Cancel reason" : "What's the issue?"}</Label>
          <input id="cs-note" name="note" required className={inputClass} />
        </div>
      )}
      <SubmitButton size="md" variant="secondary" disabled={next === status}>Update</SubmitButton>
    </ActionForm>
  );
}

export function CarrierStatusForm({ loadId, status, hasCarrier }: { loadId: string; status: CarrierStatus; hasCarrier: boolean }) {
  const [next, setNext] = useState<CarrierStatus>(status);
  return (
    <ActionForm action={setCarrierStatus} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="load_id" value={loadId} />
      <div>
        <Label htmlFor="ks">Change carrier status</Label>
        <select id="ks" name="status" value={next} onChange={(e) => setNext(e.target.value as CarrierStatus)} className={`${inputClass} w-auto`} disabled={!hasCarrier}>
          {CARRIER_STATUSES.map((s) => <option key={s} value={s}>{CARRIER_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {next === "issue" && (
        <div className="min-w-56 flex-1">
          <Label htmlFor="ks-note">Issue / claim details</Label>
          <input id="ks-note" name="note" required className={inputClass} />
        </div>
      )}
      {next === "invoice_received" && (
        <div>
          <Label htmlFor="cin" optional>Carrier invoice #</Label>
          <input id="cin" name="carrier_invoice_number" className={inputClass} />
        </div>
      )}
      <SubmitButton size="md" variant="secondary" disabled={!hasCarrier || next === status}>Update</SubmitButton>
      {!hasCarrier && <p className="w-full text-xs text-slate-500">Assign a carrier first.</p>}
    </ActionForm>
  );
}

export function AssignForm({ load, carriers, team, role }: {
  load: Load; carriers: Array<{ id: string; name: string; mc_number: string | null; standing: string }>;
  team: Array<{ id: string; label: string; role: string }>; role: string;
}) {
  return (
    <ActionForm action={assignLoad} className="space-y-3">
      <input type="hidden" name="load_id" value={load.id} />
      <div>
        <Label htmlFor="carrier_id">Carrier</Label>
        <select id="carrier_id" name="carrier_id" defaultValue={load.carrier_id ?? ""} className={inputClass}>
          <option value="">No carrier yet</option>
          {carriers.map((c) => (
            <option key={c.id} value={c.id} disabled={c.standing === "do_not_use"}>
              {c.name}{c.mc_number ? ` · MC ${c.mc_number}` : ""}{c.standing === "pending" ? " · not vetted" : ""}{c.standing === "do_not_use" ? " · DO NOT USE" : ""}
            </option>
          ))}
        </select>
      </div>
      {role !== "dispatch" && (
        <div>
          <Label htmlFor="dispatcher_id">Dispatcher</Label>
          <select id="dispatcher_id" name="dispatcher_id" defaultValue={load.dispatcher_id ?? ""} className={inputClass}>
            <option value="">Unassigned</option>
            {team.filter((t) => t.role === "dispatch" || t.role === "admin").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      )}
      {role === "admin" && (
        <div>
          <Label htmlFor="sales_rep_id">Sales rep</Label>
          <select id="sales_rep_id" name="sales_rep_id" defaultValue={load.sales_rep_id ?? ""} className={inputClass}>
            <option value="">Unassigned</option>
            {team.filter((t) => t.role === "sales" || t.role === "admin").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      )}
      <SubmitButton variant="secondary">Save assignment</SubmitButton>
    </ActionForm>
  );
}

export function RatesForm({ load, role }: { load: Load; role: string }) {
  const customerLocked = role === "dispatch";
  return (
    <ActionForm action={updateRates} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="load_id" value={load.id} />
      <div>
        <Label htmlFor="customer_rate">Customer rate ($)</Label>
        <input id="customer_rate" name="customer_rate" defaultValue={load.customer_rate} readOnly={customerLocked} className={inputClass} inputMode="decimal" />
      </div>
      <div>
        <Label htmlFor="carrier_rate">Carrier rate ($)</Label>
        <input id="carrier_rate" name="carrier_rate" defaultValue={load.carrier_rate} className={inputClass} inputMode="decimal" />
      </div>
      <div>
        <Label htmlFor="carrier_pay_terms">Carrier pay terms</Label>
        <select id="carrier_pay_terms" name="carrier_pay_terms" defaultValue={load.carrier_pay_terms} className={inputClass}>
          {PAY_TERMS.map((t) => <option key={t} value={t}>{PAY_TERMS_LABEL[t]}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="quick_pay_pct">Quick-pay fee we keep (%)</Label>
        <input id="quick_pay_pct" name="quick_pay_pct" defaultValue={load.quick_pay_pct} className={inputClass} inputMode="decimal" />
      </div>
      {!customerLocked && (
        <>
          <div>
            <Label htmlFor="adjustments" optional>Adjustment ($, minus for claims)</Label>
            <input id="adjustments" name="adjustments" defaultValue={load.adjustments} className={inputClass} inputMode="decimal" />
          </div>
          <div>
            <Label htmlFor="adjustments_note" optional>Adjustment note</Label>
            <input id="adjustments_note" name="adjustments_note" defaultValue={load.adjustments_note ?? ""} className={inputClass} placeholder="Damage claim −$500" />
          </div>
          <div>
            <Label htmlFor="competitor_price" optional>Competitor price ($)</Label>
            <input id="competitor_price" name="competitor_price" defaultValue={load.competitor_price ?? ""} className={inputClass} inputMode="decimal" />
          </div>
        </>
      )}
      <div className="sm:col-span-2"><SubmitButton variant="secondary">Save rates</SubmitButton></div>
    </ActionForm>
  );
}

export function DetailsForm({ load }: { load: Load }) {
  return (
    <ActionForm action={updateLoadDetails} className="space-y-4">
      <input type="hidden" name="load_id" value={load.id} />
      <LoadFields load={load} />
      <SubmitButton variant="secondary">Save details</SubmitButton>
    </ActionForm>
  );
}

export function VehiclesForm({ loadId, text }: { loadId: string; text: string }) {
  return (
    <ActionForm action={replaceVehicles} className="space-y-2">
      <input type="hidden" name="load_id" value={loadId} />
      <Label htmlFor="vehicles">One per line: VIN, year, make, model</Label>
      <textarea id="vehicles" name="vehicles" rows={4} defaultValue={text} className={`${inputClass} font-mono`} />
      <SubmitButton variant="secondary" size="sm">Save vehicles</SubmitButton>
    </ActionForm>
  );
}

export function NewInvoiceForm({ loadId, amount, dueOn }: { loadId: string; amount: string; dueOn: string }) {
  return (
    <ActionForm action={createInvoice} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="load_id" value={loadId} />
      <div>
        <Label htmlFor="inv-amount">Amount ($)</Label>
        <input id="inv-amount" name="amount" defaultValue={amount} className={inputClass} inputMode="decimal" />
      </div>
      <div>
        <Label htmlFor="inv-due">Due on</Label>
        <input id="inv-due" name="due_on" type="date" defaultValue={dueOn} className={inputClass} />
      </div>
      <div>
        <Label htmlFor="inv-notes" optional>Note on invoice</Label>
        <input id="inv-notes" name="notes" className={inputClass} />
      </div>
      <div className="sm:col-span-3"><SubmitButton>Issue invoice</SubmitButton></div>
    </ActionForm>
  );
}

export function InvoiceStatusButtons({ invoiceId, loadId }: { invoiceId: string; loadId: string }) {
  return (
    <div className="flex gap-2">
      <ActionForm action={setInvoiceStatus} showSuccess={false}>
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <input type="hidden" name="load_id" value={loadId} />
        <input type="hidden" name="status" value="paid" />
        <SubmitButton size="sm" variant="secondary">Mark paid</SubmitButton>
      </ActionForm>
      <ActionForm action={setInvoiceStatus} showSuccess={false}>
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <input type="hidden" name="load_id" value={loadId} />
        <input type="hidden" name="status" value="void" />
        <SubmitButton size="sm" variant="danger">Void</SubmitButton>
      </ActionForm>
    </div>
  );
}
