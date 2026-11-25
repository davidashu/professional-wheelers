"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Label, buttonClass, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LEAD_STATUS_LABEL, SOURCE_LABEL, type LeadSource, type LeadStatus } from "@/lib/labels";
import { addNote, assignLead, completeFollowUp, markLost, reopenLead, scheduleFollowUp, setStage, updateSource } from "../actions";

type Person = { id: string; name: string };

export function StageForm({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const stages: LeadStatus[] = ["new", "contacted", "pricing", "quote_sent"];
  return (
    <ActionForm action={setStage} showSuccess={false} className="flex items-center gap-2">
      <input type="hidden" name="lead_id" value={leadId} />
      <label htmlFor="stage" className="sr-only">Stage</label>
      <select id="stage" name="status" defaultValue={status} className={`${inputClass} w-auto`} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {stages.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
      </select>
    </ActionForm>
  );
}

const LOST_REASONS = ["Price too high", "Booked with another company", "Customer shipping later", "Decided not to ship", "Couldn't reach customer", "Outside our service area", "Other"];

export function LostForm({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" className={buttonClass("danger")} onClick={() => setOpen(true)}>Mark lost</button>;
  }
  return (
    <div className="w-full rounded-md bg-white p-3 shadow ring-1 ring-red-200 sm:w-96">
      <ActionForm action={markLost} className="space-y-3">
        <input type="hidden" name="lead_id" value={leadId} />
        <div>
          <Label htmlFor="reason">Why was this lead lost?</Label>
          <select id="reason" name="reason" defaultValue="" required className={inputClass}>
            <option value="" disabled>Choose a reason…</option>
            {LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="detail" optional>Details</Label>
          <input id="detail" name="detail" className={inputClass} maxLength={300} />
        </div>
        <p className="text-xs text-slate-500">Any active quote link stops accepting responses.</p>
        <div className="flex gap-2">
          <SubmitButton variant="danger" pendingText="Saving…">Mark lost</SubmitButton>
          <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </ActionForm>
    </div>
  );
}

export function ReopenButton({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={reopenLead} showSuccess={false}>
      <input type="hidden" name="lead_id" value={leadId} />
      <SubmitButton variant="secondary" pendingText="Reopening…">Reopen lead</SubmitButton>
    </ActionForm>
  );
}

export function AssignmentForm({ leadId, assignedTo, source, team }: { leadId: string; assignedTo: string | null; source: LeadSource; team: Person[] }) {
  return (
    <div className="space-y-3">
      <ActionForm action={assignLead}>
        <input type="hidden" name="lead_id" value={leadId} />
        <Label htmlFor="assigned_to">Assigned rep</Label>
        <select id="assigned_to" name="assigned_to" defaultValue={assignedTo ?? ""} className={inputClass} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          <option value="">Unassigned</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </ActionForm>
      <ActionForm action={updateSource}>
        <input type="hidden" name="lead_id" value={leadId} />
        <Label htmlFor="source">Lead source</Label>
        <select id="source" name="source" defaultValue={source} className={inputClass} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>
      </ActionForm>
    </div>
  );
}

function defaultDue() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
  return `${date}T10:00`;
}

export function FollowUpForm({ leadId, team, defaultRep }: { leadId: string; team: Person[]; defaultRep: string | null }) {
  return (
    <ActionForm action={scheduleFollowUp} resetOnSuccess className="space-y-2 rounded-md bg-slate-50 p-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule a follow-up</p>
      <div>
        <Label htmlFor="due_at">Due (Pacific time)</Label>
        <input id="due_at" name="due_at" type="datetime-local" defaultValue={defaultDue()} className={inputClass} required />
      </div>
      <div>
        <Label htmlFor="fu_rep">Rep</Label>
        <select id="fu_rep" name="assigned_to" defaultValue={defaultRep ?? team[0]?.id ?? ""} className={inputClass} required>
          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="fu_note" optional>What to do</Label>
        <input id="fu_note" name="note" className={inputClass} placeholder="e.g. Call to confirm dates" maxLength={1000} />
      </div>
      <SubmitButton size="sm" variant="secondary" pendingText="Scheduling…">Schedule follow-up</SubmitButton>
    </ActionForm>
  );
}

export function CompleteFollowUpButton({ id }: { id: string }) {
  return (
    <ActionForm action={completeFollowUp} showSuccess={false}>
      <input type="hidden" name="follow_up_id" value={id} />
      <SubmitButton size="sm" variant="secondary" pendingText="…">Done</SubmitButton>
    </ActionForm>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={addNote} resetOnSuccess showSuccess={false} className="space-y-2">
      <input type="hidden" name="lead_id" value={leadId} />
      <label htmlFor="note-body" className="sr-only">Note</label>
      <textarea id="note-body" name="body" rows={3} className={inputClass} placeholder="Add an internal note…" required maxLength={5000} />
      <SubmitButton size="sm" variant="secondary" pendingText="Adding…">Add note</SubmitButton>
    </ActionForm>
  );
}
