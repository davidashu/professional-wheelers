"use client";

import { ActionForm } from "@/components/action-form";
import { Label, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SHIPMENT_LABEL, SHIPMENT_ORDER } from "@/lib/labels";
import type { Booking } from "@/lib/types";
import { updateBooking } from "../actions";

export function BookingForm({ booking: b }: { booking: Booking }) {
  const f = (name: keyof Booking, label: string, opts: { type?: string; span?: string } = {}) => (
    <div className={opts.span}>
      <Label htmlFor={`b-${name}`} optional>{label}</Label>
      <input id={`b-${name}`} name={name} type={opts.type ?? "text"} defaultValue={(b[name] as string | null) ?? ""} className={inputClass} />
    </div>
  );
  return (
    <ActionForm action={updateBooking} className="space-y-6">
      <input type="hidden" name="booking_id" value={b.id} />
      <div>
        <Label htmlFor="b-status">Shipment status</Label>
        <select id="b-status" name="status" defaultValue={b.status} className={`${inputClass} sm:max-w-xs`}>
          {SHIPMENT_ORDER.map((s) => <option key={s} value={s}>{SHIPMENT_LABEL[s]}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">Enter the carrier before moving past Awaiting Carrier.</p>
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Pickup</legend>
        {f("pickup_address", "Street address", { span: "sm:col-span-2" })}
        {f("pickup_contact_name", "Contact name")}
        {f("pickup_contact_phone", "Contact phone", { type: "tel" })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Delivery</legend>
        {f("delivery_address", "Street address", { span: "sm:col-span-2" })}
        {f("delivery_contact_name", "Contact name")}
        {f("delivery_contact_phone", "Contact phone", { type: "tel" })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Carrier</legend>
        {f("carrier_name", "Carrier company")}
        {f("carrier_phone", "Carrier phone", { type: "tel" })}
      </fieldset>
      <div>
        <Label htmlFor="b-notes" optional>Booking notes</Label>
        <textarea id="b-notes" name="notes" rows={3} defaultValue={b.notes ?? ""} className={inputClass} />
      </div>
      <SubmitButton>Save booking</SubmitButton>
    </ActionForm>
  );
}
