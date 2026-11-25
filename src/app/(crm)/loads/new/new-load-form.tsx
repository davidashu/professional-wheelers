"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Label, inputClass } from "@/components/ui";
import { createLoad } from "../actions";
import { LoadFields } from "../load-fields";

export function NewLoadForm({ customers, defaultCustomer }: {
  customers: Array<{ id: string; name: string; company: string | null }>; defaultCustomer: string;
}) {
  return (
    <ActionForm action={createLoad} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="customer_id">Customer</Label>
          <select id="customer_id" name="customer_id" required defaultValue={defaultCustomer} className={inputClass}>
            <option value="">Choose…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.company ? `${c.company} (${c.name})` : c.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="customer_rate">Customer rate ($)</Label>
          <input id="customer_rate" name="customer_rate" inputMode="decimal" className={inputClass} />
        </div>
        <div>
          <Label htmlFor="carrier_rate" optional>Carrier rate ($)</Label>
          <input id="carrier_rate" name="carrier_rate" inputMode="decimal" className={inputClass} />
        </div>
      </div>
      <LoadFields />
      <div>
        <Label htmlFor="vehicles" optional>Vehicles, one per line</Label>
        <textarea id="vehicles" name="vehicles" rows={3} className={`${inputClass} font-mono`} placeholder={"KNDC3DLC1R5215758 2024 Kia EV6\n2021 Ford F-150"} />
      </div>
      <SubmitButton pendingText="Creating…">Create load</SubmitButton>
    </ActionForm>
  );
}
