"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendPortalMessage, type PortalFormState } from "../actions";
import { Alert, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function PortalComposer({ references, preselect }: { references: Array<{ reference: string; label: string }>; preselect: string }) {
  const [state, action] = useActionState<PortalFormState, FormData>(sendPortalMessage, null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state?.ok && textRef.current) {
      textRef.current.value = "";
      textRef.current.focus();
    }
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      {state && !state.ok && <Alert>{state.message}</Alert>}
      {references.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="reference" className="text-sm text-slate-600">About</label>
          <select id="reference" name="reference" defaultValue={preselect} className={`${inputClass} w-auto max-w-full`}>
            <option value="">General question</option>
            {references.map((r) => (
              <option key={r.reference} value={r.reference}>{r.label}</option>
            ))}
          </select>
        </div>
      )}
      <label htmlFor="body" className="sr-only">Message</label>
      <textarea
        ref={textRef}
        id="body"
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder="Write a message…"
        className={inputClass}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-xs text-slate-500 sm:block">Ctrl + Enter to send</p>
        <SubmitButton pendingText="Sending…" className="w-full sm:w-auto">Send message</SubmitButton>
      </div>
    </form>
  );
}
