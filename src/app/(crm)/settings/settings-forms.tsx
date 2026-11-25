"use client";

import { ActionForm } from "@/components/action-form";
import { Label, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Profile, Settings } from "@/lib/types";
import { addTeammate, updateSettings, updateTeamMember } from "./actions";

export function SettingsForm({ settings }: { settings: Settings }) {
  return (
    <ActionForm action={updateSettings} className="space-y-3">
      <div>
        <Label htmlFor="company_name">Company name (shown on customer quotes)</Label>
        <input id="company_name" name="company_name" defaultValue={settings.company_name} className={inputClass} required />
      </div>
      <div>
        <Label htmlFor="quote_validity_days">Default quote validity (days)</Label>
        <input id="quote_validity_days" name="quote_validity_days" type="number" min={1} max={90} defaultValue={settings.quote_validity_days} className={`${inputClass} max-w-32`} required />
      </div>
      <div>
        <Label htmlFor="default_quote_terms">Default customer-facing terms</Label>
        <textarea id="default_quote_terms" name="default_quote_terms" rows={6} defaultValue={settings.default_quote_terms} className={inputClass} required />
      </div>
      <div>
        <Label htmlFor="booking_agreement_text">Booking agreement (customers sign this after accepting)</Label>
        <textarea id="booking_agreement_text" name="booking_agreement_text" rows={8} defaultValue={settings.booking_agreement_text} className={inputClass} required />
        <p className="mt-1 text-xs text-slate-500">Each signed booking keeps an exact copy of the text the customer signed, so editing this doesn&apos;t change past agreements.</p>
      </div>
      <SubmitButton>Save defaults</SubmitButton>
    </ActionForm>
  );
}

export function TeamMemberForm({ member }: { member: Profile }) {
  return (
    <ActionForm action={updateTeamMember} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="user_id" value={member.id} />
      <label className="sr-only" htmlFor={`role-${member.id}`}>Role</label>
      <select id={`role-${member.id}`} name="role" defaultValue={member.role} className={`${inputClass} w-auto`}>
        <option value="sales">Sales</option>
        <option value="dispatch">Dispatch</option>
        <option value="admin">Admin</option>
      </select>
      <label className="sr-only" htmlFor={`active-${member.id}`}>Access</label>
      <select id={`active-${member.id}`} name="active" defaultValue={String(member.active)} className={`${inputClass} w-auto`}>
        <option value="true">Active</option>
        <option value="false">No access</option>
      </select>
      <SubmitButton size="sm" variant="secondary">Update</SubmitButton>
    </ActionForm>
  );
}

export function AddTeammateForm() {
  return (
    <ActionForm action={addTeammate} resetOnSuccess className="space-y-3">
      <p className="text-sm font-semibold text-slate-900">Add a teammate</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><Label htmlFor="t-name">Name</Label><input id="t-name" name="full_name" className={inputClass} required /></div>
        <div><Label htmlFor="t-email">Email</Label><input id="t-email" name="email" type="email" className={inputClass} required /></div>
        <div>
          <Label htmlFor="t-role">Role</Label>
          <select id="t-role" name="role" defaultValue="sales" className={inputClass}><option value="sales">Sales</option><option value="dispatch">Dispatch</option><option value="admin">Admin</option></select>
        </div>
        <div><Label htmlFor="t-pass">Temporary password</Label><input id="t-pass" name="password" type="password" minLength={12} autoComplete="new-password" className={inputClass} required /></div>
      </div>
      <SubmitButton variant="secondary">Add teammate</SubmitButton>
    </ActionForm>
  );
}
