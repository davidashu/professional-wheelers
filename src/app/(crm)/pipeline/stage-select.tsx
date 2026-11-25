"use client";

import { ActionForm } from "@/components/action-form";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/labels";
import { setStage } from "../leads/actions";

export function PipelineStageSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const stages: LeadStatus[] = ["new", "contacted", "pricing", "quote_sent"];
  return (
    <ActionForm action={setStage} showSuccess={false} className="mt-2 text-xs">
      <input type="hidden" name="lead_id" value={leadId} />
      <label className="sr-only" htmlFor={`stage-${leadId}`}>Move to stage</label>
      <select
        id={`stage-${leadId}`}
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded border-0 bg-slate-50 py-1 text-xs ring-1 ring-inset ring-slate-200"
      >
        {stages.map((s) => <option key={s} value={s}>Move to: {LEAD_STATUS_LABEL[s]}</option>)}
      </select>
    </ActionForm>
  );
}
