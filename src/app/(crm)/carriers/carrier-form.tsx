"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Label, inputClass } from "@/components/ui";
import { CARRIER_STANDING, CARRIER_STANDING_LABEL, type Carrier } from "@/lib/tms";
import { createCarrier, updateCarrier } from "./actions";

function F({ name, label, value, type = "text", optional, placeholder }: {
  name: string; label: string; value?: string | null; type?: string; optional?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <Label htmlFor={`c-${name}`} optional={optional}>{label}</Label>
      <input id={`c-${name}`} name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} className={inputClass} />
    </div>
  );
}

export function CarrierForm({ carrier, readOnly }: { carrier?: Carrier; readOnly?: boolean }) {
  return (
    <ActionForm action={carrier ? updateCarrier : createCarrier} className="space-y-4">
      {carrier && <input type="hidden" name="carrier_id" value={carrier.id} />}
      <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
        <F name="name" label="Company name" value={carrier?.name} />
        <F name="contact_name" label="Contact / dispatcher" value={carrier?.contact_name} optional />
        <F name="mc_number" label="MC #" value={carrier?.mc_number} optional />
        <F name="dot_number" label="DOT #" value={carrier?.dot_number} optional />
        <F name="phone" label="Phone" value={carrier?.phone} type="tel" optional />
        <F name="email" label="Email" value={carrier?.email} type="email" optional />
        <div>
          <Label htmlFor="c-standing">Standing</Label>
          <select id="c-standing" name="standing" defaultValue={carrier?.standing ?? "pending"} className={inputClass}>
            {CARRIER_STANDING.map((s) => <option key={s} value={s}>{CARRIER_STANDING_LABEL[s]}</option>)}
          </select>
        </div>
        <F name="standing_reason" label="Why (claims, late, etc.)" value={carrier?.standing_reason} optional />
        <F name="auto_liability_amount" label="Auto liability ($)" value={carrier?.auto_liability_amount} optional placeholder="1000000" />
        <F name="cargo_amount" label="Cargo ($)" value={carrier?.cargo_amount} optional placeholder="100000" />
        <F name="insurance_expires_on" label="Insurance expires" value={carrier?.insurance_expires_on} type="date" optional />
        <F name="agreement_signed_on" label="Broker–carrier agreement signed" value={carrier?.agreement_signed_on} type="date" optional />
        <div className="sm:col-span-2"><F name="lanes" label="Lanes they run" value={carrier?.lanes} optional placeholder="WA → UT, CA → AZ" /></div>
        <div className="sm:col-span-2">
          <Label htmlFor="c-notes" optional>Notes</Label>
          <textarea id="c-notes" name="notes" rows={3} defaultValue={carrier?.notes ?? ""} className={inputClass} />
        </div>
      </fieldset>
      {!readOnly && <SubmitButton>{carrier ? "Save carrier" : "Add carrier"}</SubmitButton>}
    </ActionForm>
  );
}
