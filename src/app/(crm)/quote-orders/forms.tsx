"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Label, inputClass } from "@/components/ui";
import { EQUIPMENT, EQUIPMENT_LABEL } from "@/lib/tms";
import { postQuoteOrder, priceQuoteOrder, recordQuoteResponse } from "./actions";

export function LaneFields() {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-3"><Label htmlFor="origin_city">Pickup city</Label><input id="origin_city" name="origin_city" required className={inputClass} /></div>
      <div className="sm:col-span-1"><Label htmlFor="origin_state">State</Label><input id="origin_state" name="origin_state" required maxLength={2} className={`${inputClass} uppercase`} /></div>
      <div className="sm:col-span-2"><Label htmlFor="origin_zip" optional>ZIP</Label><input id="origin_zip" name="origin_zip" inputMode="numeric" className={inputClass} /></div>
      <div className="sm:col-span-3"><Label htmlFor="dest_city">Delivery city</Label><input id="dest_city" name="dest_city" required className={inputClass} /></div>
      <div className="sm:col-span-1"><Label htmlFor="dest_state">State</Label><input id="dest_state" name="dest_state" required maxLength={2} className={`${inputClass} uppercase`} /></div>
      <div className="sm:col-span-2"><Label htmlFor="dest_zip" optional>ZIP</Label><input id="dest_zip" name="dest_zip" inputMode="numeric" className={inputClass} /></div>
      <div className="sm:col-span-3">
        <Label htmlFor="equipment">Equipment</Label>
        <select id="equipment" name="equipment" defaultValue="open_car" className={inputClass}>
          {EQUIPMENT.map((e) => <option key={e} value={e}>{EQUIPMENT_LABEL[e]}</option>)}
        </select>
      </div>
      <div className="sm:col-span-3"><Label htmlFor="pickup_date" optional>Ready date</Label><input id="pickup_date" name="pickup_date" type="date" className={inputClass} /></div>
      <div className="sm:col-span-6"><Label htmlFor="description">What&apos;s moving</Label><textarea id="description" name="description" required rows={2} className={inputClass} placeholder="2024 Kia EV6, runs and drives" /></div>
      <div className="sm:col-span-6"><Label htmlFor="notes" optional>Notes</Label><input id="notes" name="notes" className={inputClass} /></div>
    </div>
  );
}

export function PostQuoteOrderForm({ customers }: { customers: Array<{ id: string; label: string }> }) {
  return (
    <ActionForm action={postQuoteOrder} resetOnSuccess className="space-y-3">
      <div>
        <Label htmlFor="qo-customer">Customer</Label>
        <select id="qo-customer" name="customer_id" required className={inputClass} defaultValue="">
          <option value="">Choose…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <LaneFields />
      <SubmitButton>Post quote order</SubmitButton>
    </ActionForm>
  );
}

export function PriceForm({ id, current }: { id: string; current: string | null }) {
  return (
    <ActionForm action={priceQuoteOrder} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="w-32"><Label htmlFor={`rate-${id}`}>Rate ($)</Label><input id={`rate-${id}`} name="rate" required defaultValue={current ?? ""} inputMode="decimal" className={inputClass} /></div>
      <div className="min-w-48 flex-1"><Label htmlFor={`qn-${id}`} optional>Note to customer</Label><input id={`qn-${id}`} name="note" className={inputClass} placeholder="Open carrier, 3–5 days" /></div>
      <SubmitButton size="md">{current ? "Re-quote" : "Send quote"}</SubmitButton>
    </ActionForm>
  );
}

export function ResponseForm({ id }: { id: string }) {
  const [loadId, setLoadId] = useState<string | null>(null);
  if (loadId) return <Link href={`/loads/${loadId}`} className="text-sm font-semibold text-brand-700 hover:underline">Open the new load →</Link>;
  return (
    <ActionForm action={recordQuoteResponse} className="flex flex-wrap items-end gap-2" onSuccess={(r) => r.data?.load_id && setLoadId(r.data.load_id)}>
      <input type="hidden" name="id" value={id} />
      <div className="w-40"><Label htmlFor={`note-${id}`} optional>Customer said</Label><input id={`note-${id}`} name="note" className={inputClass} /></div>
      <div className="w-28"><Label htmlFor={`target-${id}`} optional>Their price</Label><input id={`target-${id}`} name="target_rate" inputMode="decimal" className={inputClass} /></div>
      <SubmitButton size="sm" name="response" value="approved">Approved</SubmitButton>
      <SubmitButton size="sm" variant="secondary" name="response" value="too_high">Too high</SubmitButton>
      <SubmitButton size="sm" variant="secondary" name="response" value="too_low">Too low</SubmitButton>
      <SubmitButton size="sm" variant="ghost" name="response" value="cancelled">Cancelled</SubmitButton>
    </ActionForm>
  );
}
