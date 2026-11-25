"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Label, inputClass } from "@/components/ui";
import { LaneFields } from "../(crm)/quote-orders/forms";
import { answerQuote, requestQuote } from "./actions";

export function RequestQuoteForm() {
  return (
    <ActionForm action={requestQuote} resetOnSuccess className="space-y-3">
      <LaneFields />
      <SubmitButton>Post lane for a quote</SubmitButton>
    </ActionForm>
  );
}

export function AnswerQuoteForm({ id, canApprove }: { id: string; canApprove: boolean }) {
  return (
    <ActionForm action={answerQuote} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      {canApprove && (
        <>
          <div className="w-44"><Label htmlFor={`n-${id}`} optional>Comment</Label><input id={`n-${id}`} name="note" className={inputClass} /></div>
          <div className="w-28"><Label htmlFor={`t-${id}`} optional>Your price ($)</Label><input id={`t-${id}`} name="target_rate" inputMode="decimal" className={inputClass} /></div>
          <SubmitButton size="sm" name="response" value="approved">Approve</SubmitButton>
          <SubmitButton size="sm" variant="secondary" name="response" value="too_high">Too high</SubmitButton>
          <SubmitButton size="sm" variant="secondary" name="response" value="too_low">Too low</SubmitButton>
        </>
      )}
      <SubmitButton size="sm" variant="ghost" name="response" value="cancelled">Cancel</SubmitButton>
    </ActionForm>
  );
}
