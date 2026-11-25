"use client";

import { useActionState } from "react";
import { requestPortalLink, type PortalFormState } from "../actions";
import { Alert, Label, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function PortalLoginForm() {
  const [state, action] = useActionState<PortalFormState, FormData>(requestPortalLink, null);
  if (state?.ok) {
    return (
      <Alert tone="success" title="Check your email">
        {state.message}
      </Alert>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && <Alert tone="warning">{state.message}</Alert>}
      <div>
        <Label htmlFor="email">Email address</Label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className={inputClass} />
      </div>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton className="w-full" size="lg" pendingText="Sending…">Email me a sign-in link</SubmitButton>
    </form>
  );
}
