"use client";

import { ActionForm } from "@/components/action-form";
import { Label, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Customer } from "@/lib/types";
import { updateCustomer } from "../actions";

export function CustomerForm({ customer }: { customer: Customer }) {
  return (
    <ActionForm action={updateCustomer} className="space-y-3">
      <input type="hidden" name="customer_id" value={customer.id} />
      {([
        ["name", "Name", customer.name, "text"],
        ["email", "Email", customer.email ?? "", "email"],
        ["phone", "Phone", customer.phone ?? "", "tel"],
        ["company", "Company", customer.company ?? "", "text"],
      ] as const).map(([name, label, value, type]) => (
        <div key={name}>
          <Label htmlFor={`c-${name}`}>{label}</Label>
          <input id={`c-${name}`} name={name} type={type} defaultValue={value} className={inputClass} required={name === "name"} />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="c-billing_email" optional>Billing email</Label>
          <input id="c-billing_email" name="billing_email" type="email" defaultValue={customer.billing_email ?? ""} className={inputClass} />
        </div>
        <div>
          <Label htmlFor="c-terms">Payment terms (days)</Label>
          <input id="c-terms" name="payment_terms_days" type="number" min={0} max={120} defaultValue={customer.payment_terms_days ?? 0} className={inputClass} />
        </div>
      </div>
      <div>
        <Label htmlFor="c-type" optional>Type</Label>
        <input id="c-type" name="customer_type" defaultValue={customer.customer_type ?? ""} placeholder="Dealer group, manufacturer, shipper…" className={inputClass} />
      </div>
      <div>
        <Label htmlFor="c-notes" optional>Notes</Label>
        <textarea id="c-notes" name="notes" rows={3} defaultValue={customer.notes ?? ""} className={inputClass} />
      </div>
      <SubmitButton>Save customer</SubmitButton>
    </ActionForm>
  );
}
