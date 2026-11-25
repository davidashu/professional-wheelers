"use client";

import Link from "next/link";
import { useActionState } from "react";
import { redeemPortalLink, type PortalFormState } from "../actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ContinueForm({ token }: { token: string }) {
  const [state, action] = useActionState<PortalFormState, FormData>(redeemPortalLink, null);
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && (
        <Alert tone="warning">
          {state.message} <Link href="/portal/login" className="font-semibold underline">Get a new link</Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-slate-600">Press continue to open your customer portal on this device.</p>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">Continue to my portal</SubmitButton>
    </form>
  );
}
