"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToQuote, type RespondState } from "./actions";
import { Alert, buttonClass, inputClass } from "@/components/ui";

export function RespondForms({ token }: { token: string }) {
  const [state, action] = useActionState<RespondState, FormData>(respondToQuote, null);
  const [pending, startTransition] = useTransition();
  const [declining, setDeclining] = useState(false);
  const router = useRouter();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return; // a double tap is ignored here and is harmless on the server anyway
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(fd);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {!declining ? (
        <form onSubmit={submit} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="action" value="accept" />
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" name="agree" required className="mt-0.5 h-5 w-5 accent-brand-700" />
            I&apos;ve read the terms above and want to book this shipment at the quoted price.
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:flex-1")}>
              {pending ? "Booking…" : "Accept quote and book"}
            </button>
            <button type="button" disabled={pending} onClick={() => setDeclining(true)} className={buttonClass("secondary", "lg")}>
              Decline
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="action" value="decline" />
          <label htmlFor="reason" className="block text-sm font-medium text-slate-800">
            Mind telling us why? <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea id="reason" name="reason" rows={3} maxLength={1000} className={inputClass} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={pending} className={buttonClass("danger", "lg")}>{pending ? "Saving…" : "Decline quote"}</button>
            <button type="button" onClick={() => setDeclining(false)} className={buttonClass("ghost", "lg")}>Back</button>
          </div>
        </form>
      )}
    </div>
  );
}
