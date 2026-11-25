"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Button, Label, inputClass } from "@/components/ui";
import { TASK_PRIORITY } from "@/lib/tms";
import { claimTask, completeTask, createTask } from "./actions";

export type AssigneeOption = { value: string; label: string };

export function NewTaskForm({ assignees, customerId, loadId, defaultAssignee }: {
  assignees: AssigneeOption[]; customerId?: string; loadId?: string; defaultAssignee?: string;
}) {
  return (
    <ActionForm action={createTask} resetOnSuccess className="grid gap-3 sm:grid-cols-6">
      {customerId && <input type="hidden" name="customer_id" value={customerId} />}
      {loadId && <input type="hidden" name="load_id" value={loadId} />}
      <div className="sm:col-span-6">
        <Label htmlFor={`t-title-${customerId ?? loadId ?? "g"}`}>Task</Label>
        <input id={`t-title-${customerId ?? loadId ?? "g"}`} name="title" required maxLength={200} className={inputClass} placeholder="Call about next month's lanes" />
      </div>
      <div className="sm:col-span-6">
        <Label htmlFor={`t-body-${customerId ?? loadId ?? "g"}`} optional>Details</Label>
        <textarea id={`t-body-${customerId ?? loadId ?? "g"}`} name="body" rows={2} className={inputClass} />
      </div>
      <div className="sm:col-span-3">
        <Label htmlFor={`t-assignee-${customerId ?? loadId ?? "g"}`}>Assign to</Label>
        <select id={`t-assignee-${customerId ?? loadId ?? "g"}`} name="assignee" defaultValue={defaultAssignee ?? ""} required className={inputClass}>
          <option value="">Choose…</option>
          <optgroup label="Position (anyone in it can take it)">
            {assignees.filter((a) => a.value.startsWith("role:")).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </optgroup>
          <optgroup label="Person">
            {assignees.filter((a) => a.value.startsWith("user:")).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </optgroup>
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`t-due-${customerId ?? loadId ?? "g"}`} optional>Due</Label>
        <input id={`t-due-${customerId ?? loadId ?? "g"}`} name="due_on" type="date" className={inputClass} />
      </div>
      <div className="sm:col-span-1">
        <Label htmlFor={`t-pri-${customerId ?? loadId ?? "g"}`}>Priority</Label>
        <select id={`t-pri-${customerId ?? loadId ?? "g"}`} name="priority" defaultValue="normal" className={`${inputClass} capitalize`}>
          {TASK_PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="sm:col-span-6"><SubmitButton size="sm">Add task</SubmitButton></div>
    </ActionForm>
  );
}

export function TaskActions({ taskId, customerId, loadId, canClaim, isOpen, needsOutcome }: {
  taskId: string; customerId: string | null; loadId: string | null; canClaim: boolean; isOpen: boolean; needsOutcome: boolean;
}) {
  const [completing, setCompleting] = useState(false);
  const hidden = (
    <>
      <input type="hidden" name="task_id" value={taskId} />
      {customerId && <input type="hidden" name="customer_id" value={customerId} />}
      {loadId && <input type="hidden" name="load_id" value={loadId} />}
    </>
  );
  if (!isOpen) {
    return (
      <ActionForm action={completeTask} showSuccess={false}>
        {hidden}
        <input type="hidden" name="status" value="open" />
        <SubmitButton size="sm" variant="ghost">Reopen</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-2">
      {canClaim && (
        <ActionForm action={claimTask} showSuccess={false}>
          {hidden}
          <SubmitButton size="sm" variant="secondary">Take it</SubmitButton>
        </ActionForm>
      )}
      {!completing ? (
        <Button size="sm" variant="secondary" type="button" onClick={() => setCompleting(true)}>Complete…</Button>
      ) : (
        <ActionForm action={completeTask} className="flex w-full flex-wrap items-end gap-2">
          {hidden}
          <div className="min-w-60 flex-1">
            <Label htmlFor={`outcome-${taskId}`} optional={!needsOutcome}>Outcome</Label>
            <input id={`outcome-${taskId}`} name="outcome" required={needsOutcome} className={inputClass} placeholder="What happened? What did they say?" />
          </div>
          <SubmitButton size="sm" name="status" value="done">Done</SubmitButton>
          <SubmitButton size="sm" variant="ghost" name="status" value="cancelled">Cancel task</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
