"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Label, inputClass } from "@/components/ui";
import { TASK_PRIORITY, type SequenceRule } from "@/lib/tms";
import { runSequencesNow, updateRule } from "./actions";

const asPct = (v: string | null) => (v === null ? "" : String(Math.round(Number(v) * 10000) / 100));

export function RuleForm({ rule }: { rule: SequenceRule }) {
  const id = (n: string) => `r-${rule.key}-${n}`;
  return (
    <ActionForm action={updateRule} className="space-y-3">
      <input type="hidden" name="key" value={rule.key} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={id("name")}>Name</Label><input id={id("name")} name="name" defaultValue={rule.name} className={inputClass} /></div>
        <div>
          <Label htmlFor={id("active")}>Status</Label>
          <select id={id("active")} name="active" defaultValue={String(rule.active)} className={inputClass}>
            <option value="true">On</option><option value="false">Off</option>
          </select>
        </div>
      </div>
      <div><Label htmlFor={id("description")} optional>Description</Label><input id={id("description")} name="description" defaultValue={rule.description} className={inputClass} /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><Label htmlFor={id("months")}>Months in a row</Label><input id={id("months")} name="months" type="number" min={1} max={6} defaultValue={rule.months} className={inputClass} /></div>
        <div><Label htmlFor={id("min")}>Each month down at least (%)</Label><input id={id("min")} name="min_drop" inputMode="decimal" defaultValue={asPct(rule.min_drop)} className={inputClass} /></div>
        <div><Label htmlFor={id("max")} optional>…and less than (%)</Label><input id={id("max")} name="max_drop" inputMode="decimal" defaultValue={asPct(rule.max_drop)} className={inputClass} /></div>
        <div><Label htmlFor={id("total")} optional>Combined drop at least (%)</Label><input id={id("total")} name="min_total_drop" inputMode="decimal" defaultValue={asPct(rule.min_total_drop)} className={inputClass} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={id("priority")}>Task priority</Label>
          <select id={id("priority")} name="task_priority" defaultValue={rule.task_priority} className={inputClass}>
            {TASK_PRIORITY.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
        </div>
        <div><Label htmlFor={id("due")}>Due in (days)</Label><input id={id("due")} name="due_days" type="number" min={0} max={30} defaultValue={rule.due_days} className={inputClass} /></div>
      </div>
      <div><Label htmlFor={id("title")}>Task title</Label><input id={id("title")} name="task_title" defaultValue={rule.task_title} className={inputClass} /></div>
      <div>
        <Label htmlFor={id("body")}>Task text</Label>
        <textarea id={id("body")} name="task_body" rows={6} defaultValue={rule.task_body} className={inputClass} />
        <p className="mt-1 text-xs text-slate-500">Use {"{customer}"}, {"{drop}"} (combined drop) and {"{history}"} (month by month profit).</p>
      </div>
      <SubmitButton size="sm">Save rule</SubmitButton>
    </ActionForm>
  );
}

export function RunNowForm() {
  return (
    <ActionForm action={runSequencesNow} className="flex flex-wrap items-end gap-2">
      <div>
        <Label htmlFor="as_of" optional>Run as of</Label>
        <input id="as_of" name="as_of" type="date" className={`${inputClass} w-auto`} />
      </div>
      <SubmitButton size="sm" variant="secondary">Run now</SubmitButton>
    </ActionForm>
  );
}
