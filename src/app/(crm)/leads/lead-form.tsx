"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Label, buttonClass, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/lib/actions";
import { SOURCE_LABEL, type LeadSource } from "@/lib/labels";
import { US_STATES } from "@/lib/us-states";

export type LeadFormDefaults = {
  lead_id?: string;
  customer_id?: string;
  contact_name?: string; contact_email?: string; contact_phone?: string; contact_company?: string;
  pickup_city?: string; pickup_state?: string; pickup_zip?: string;
  delivery_city?: string; delivery_state?: string; delivery_zip?: string;
  earliest_pickup_date?: string; pickup_date_flexible?: boolean; transport_type?: "open" | "enclosed";
  special_instructions?: string; source?: LeadSource; assigned_to?: string;
  vehicles: Array<{ year: number | string; make: string; model: string; operable: boolean }>;
};

let counter = 0;
const key = () => `v${++counter}`;

export function LeadForm({
  mode,
  action,
  defaults,
  team = [],
}: {
  mode: "create" | "edit";
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  defaults: LeadFormDefaults;
  team?: Array<{ id: string; name: string }>;
}) {
  const [vehicles, setVehicles] = useState(() => defaults.vehicles.map((v) => ({ ...v, key: key() })));
  const lockedCustomer = mode === "create" && Boolean(defaults.customer_id);
  // create uses name/email/phone/company; edit uses contact_* column names
  const n = (create: string, edit: string) => (mode === "create" ? create : edit);

  return (
    <ActionForm action={action} className="space-y-6">
      {defaults.lead_id && <input type="hidden" name="lead_id" value={defaults.lead_id} />}
      {mode === "create" && <input type="hidden" name="customer_id" value={defaults.customer_id ?? ""} />}

      <Section title="Customer">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name={n("name", "contact_name")} defaultValue={defaults.contact_name} required readOnly={lockedCustomer} />
          <Field label="Company" name={n("company", "contact_company")} defaultValue={defaults.contact_company} optional readOnly={lockedCustomer} />
          <Field label="Email" type="email" name={n("email", "contact_email")} defaultValue={defaults.contact_email} optional={mode === "edit" || !lockedCustomer} readOnly={lockedCustomer} />
          <Field label="Phone" type="tel" name={n("phone", "contact_phone")} defaultValue={defaults.contact_phone} optional readOnly={lockedCustomer} />
        </div>
        {mode === "create" && !lockedCustomer && <p className="mt-2 text-xs text-slate-500">Enter at least an email or a phone number.</p>}
      </Section>

      <Section title="Route">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Pickup city" name="pickup_city" defaultValue={defaults.pickup_city} required className="sm:col-span-3" />
          <StateSelect label="Pickup state" name="pickup_state" defaultValue={defaults.pickup_state} />
          <Field label="Pickup ZIP" name="pickup_zip" defaultValue={defaults.pickup_zip} required inputMode="numeric" maxLength={5} className="sm:col-span-1" />
          <Field label="Delivery city" name="delivery_city" defaultValue={defaults.delivery_city} required className="sm:col-span-3" />
          <StateSelect label="Delivery state" name="delivery_state" defaultValue={defaults.delivery_state} />
          <Field label="Delivery ZIP" name="delivery_zip" defaultValue={defaults.delivery_zip} required inputMode="numeric" maxLength={5} className="sm:col-span-1" />
        </div>
      </Section>

      <Section title="Pickup and transport">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Earliest pickup date" type="date" name="earliest_pickup_date" defaultValue={defaults.earliest_pickup_date} required />
          <div>
            <Label htmlFor="pickup_date_flexible">Date flexible?</Label>
            <select id="pickup_date_flexible" name="pickup_date_flexible" defaultValue={defaults.pickup_date_flexible ? "yes" : "no"} className={inputClass}>
              <option value="yes">Yes, flexible</option>
              <option value="no">No, fixed</option>
            </select>
          </div>
          <div>
            <Label htmlFor="transport_type">Transport type</Label>
            <select id="transport_type" name="transport_type" defaultValue={defaults.transport_type ?? "open"} className={inputClass}>
              <option value="open">Open</option>
              <option value="enclosed">Enclosed</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="special_instructions" optional>Special instructions</Label>
          <textarea id="special_instructions" name="special_instructions" rows={2} defaultValue={defaults.special_instructions} className={inputClass} />
        </div>
      </Section>

      <Section title="Vehicles">
        <div className="space-y-3">
          {vehicles.map((v, i) => (
            <div key={v.key} className="grid items-end gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-12">
              <Field label="Year" name={`vehicles.${i}.year`} defaultValue={String(v.year)} required inputMode="numeric" maxLength={4} className="sm:col-span-2" />
              <Field label="Make" name={`vehicles.${i}.make`} defaultValue={v.make} required className="sm:col-span-3" />
              <Field label="Model" name={`vehicles.${i}.model`} defaultValue={v.model} required className="sm:col-span-3" />
              <div className="sm:col-span-3">
                <Label htmlFor={`op-${v.key}`}>Runs?</Label>
                <select id={`op-${v.key}`} name={`vehicles.${i}.operable`} defaultValue={v.operable ? "yes" : "no"} className={inputClass}>
                  <option value="yes">Runs and drives</option>
                  <option value="no">Inoperable</option>
                </select>
              </div>
              <div className="sm:col-span-1">
                {vehicles.length > 1 && (
                  <button type="button" className="text-sm font-medium text-red-700 hover:underline" onClick={() => setVehicles((vs) => vs.filter((x) => x.key !== v.key))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {vehicles.length < 10 && (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setVehicles((vs) => [...vs, { year: "", make: "", model: "", operable: true, key: key() }])}>
              + Add vehicle
            </button>
          )}
        </div>
      </Section>

      {mode === "create" && (
        <Section title="Assignment">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="source">Lead source</Label>
              <select id="source" name="source" defaultValue={defaults.source ?? "phone"} className={inputClass}>
                {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="assigned_to">Assigned rep</Label>
              <select id="assigned_to" name="assigned_to" defaultValue={defaults.assigned_to ?? ""} className={inputClass}>
                <option value="">Unassigned</option>
                {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="note" optional>Call notes</Label>
            <textarea id="note" name="note" rows={3} className={inputClass} placeholder="What did the customer tell you?" />
          </div>
        </Section>
      )}

      <div className="flex gap-3">
        <SubmitButton pendingText={mode === "create" ? "Creating…" : "Saving…"}>{mode === "create" ? "Create lead" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, name, className, optional, ...rest }: React.ComponentProps<"input"> & { label: string; name: string; optional?: boolean }) {
  const id = `f-${name}`;
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional}>{label}</Label>
      <input id={id} name={name} className={`${inputClass} read-only:bg-slate-50`} {...rest} />
    </div>
  );
}

function StateSelect({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <div className="sm:col-span-2">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <select id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""} className={inputClass} required>
        <option value="" disabled>Select…</option>
        {US_STATES.map(([code, l]) => <option key={code} value={code}>{l}</option>)}
      </select>
    </div>
  );
}
