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
      <div>
        <Label htmlFor="c-notes" optional>Notes</Label>
        <textarea id="c-notes" name="notes" rows={3} defaultValue={customer.notes ?? ""} className={inputClass} />
      </div>
      <SubmitButton>Save customer</SubmitButton>
    </ActionForm>
  );
}
