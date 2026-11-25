"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Label, inputClass } from "@/components/ui";
import { addLocation, addPortalUser, removeLocation, setSalesRep } from "../actions";

export function SalesRepForm({ customerId, current, options, canReassign, me }: {
  customerId: string; current: string | null; options: Array<{ id: string; label: string }>; canReassign: boolean; me: string;
}) {
  if (!canReassign) {
    if (current) return null;
    return (
      <ActionForm action={setSalesRep}>
        <input type="hidden" name="customer_id" value={customerId} />
        <input type="hidden" name="sales_rep_id" value={me} />
        <SubmitButton size="sm" variant="secondary">Make me the sales rep</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={setSalesRep} className="flex items-end gap-2">
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="flex-1">
        <Label htmlFor="rep">Sales rep</Label>
        <select id="rep" name="sales_rep_id" defaultValue={current ?? ""} className={inputClass}>
          <option value="">Unassigned</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <SubmitButton size="md" variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

export function AddLocationForm({ customerId }: { customerId: string }) {
  return (
    <ActionForm action={addLocation} resetOnSuccess className="grid gap-2 sm:grid-cols-6">
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="sm:col-span-6"><Label htmlFor="l-name">Location name</Label><input id="l-name" name="name" required className={inputClass} placeholder="Ken Garff Kia Bell Road" /></div>
      <div className="sm:col-span-6"><Label htmlFor="l-address" optional>Street address</Label><input id="l-address" name="address" className={inputClass} /></div>
      <div className="sm:col-span-3"><Label htmlFor="l-city" optional>City</Label><input id="l-city" name="city" className={inputClass} /></div>
      <div className="sm:col-span-1"><Label htmlFor="l-state" optional>State</Label><input id="l-state" name="state" maxLength={2} className={`${inputClass} uppercase`} /></div>
      <div className="sm:col-span-2"><Label htmlFor="l-zip" optional>ZIP</Label><input id="l-zip" name="zip" className={inputClass} /></div>
      <div className="sm:col-span-3"><Label htmlFor="l-contact" optional>Contact</Label><input id="l-contact" name="contact_name" className={inputClass} /></div>
      <div className="sm:col-span-3"><Label htmlFor="l-phone" optional>Phone</Label><input id="l-phone" name="contact_phone" className={inputClass} /></div>
      <div className="sm:col-span-6"><Label htmlFor="l-hours" optional>Receiving hours / passkey notes</Label><input id="l-hours" name="hours" className={inputClass} placeholder="M–F 9am–4pm" /></div>
      <div className="sm:col-span-6"><SubmitButton size="sm" variant="secondary">Add location</SubmitButton></div>
    </ActionForm>
  );
}

export function RemoveLocationButton({ customerId, locationId }: { customerId: string; locationId: string }) {
  return (
    <ActionForm action={removeLocation} showSuccess={false}>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="location_id" value={locationId} />
      <SubmitButton size="sm" variant="ghost">Remove</SubmitButton>
    </ActionForm>
  );
}

export function AddPortalUserForm({ customerId }: { customerId: string }) {
  return (
    <ActionForm action={addPortalUser} resetOnSuccess className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="customer_id" value={customerId} />
      <div><Label htmlFor="pu-name">Name</Label><input id="pu-name" name="full_name" required className={inputClass} /></div>
      <div><Label htmlFor="pu-email">Email</Label><input id="pu-email" name="email" type="email" required className={inputClass} /></div>
      <div className="sm:col-span-2"><Label htmlFor="pu-pass">Temporary password (12+ characters)</Label><input id="pu-pass" name="password" type="password" autoComplete="new-password" required minLength={12} className={inputClass} /></div>
      <div className="sm:col-span-2"><SubmitButton size="sm" variant="secondary">Create portal login</SubmitButton></div>
    </ActionForm>
  );
}
