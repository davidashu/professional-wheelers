"use client";

import { useState } from "react";
import { ActionForm } from "./action-form";
import { SubmitButton } from "./submit-button";
import { CopyLink } from "./copy-link";
import { inputClass } from "./ui";
import { createPortalLink, sendStaffMessage } from "@/app/(crm)/messages/actions";

export function StaffComposer({ customerId, leadId, canEmail }: { customerId: string; leadId: string | null; canEmail: boolean }) {
  return (
    <ActionForm action={sendStaffMessage} resetOnSuccess className="space-y-2">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="lead_id" value={leadId ?? ""} />
      <label htmlFor={`msg-${customerId}`} className="sr-only">Reply to customer</label>
      <textarea
        id={`msg-${customerId}`}
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder="Reply to the customer…"
        className={inputClass}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className={`flex items-center gap-2 text-sm ${canEmail ? "text-slate-700" : "text-slate-400"}`}>
          <input type="checkbox" name="notify" defaultChecked={canEmail} disabled={!canEmail} className="h-4 w-4 rounded border-slate-300" />
          Email the customer a notice
          {!canEmail && <span className="text-xs">(needs email setup and a customer email)</span>}
        </label>
        <SubmitButton size="sm" pendingText="Sending…">Send</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function PortalLinkButton({ customerId }: { customerId: string }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <ActionForm action={createPortalLink} onSuccess={(r) => setLink(r.data?.link ?? null)} showSuccess={false} className="space-y-2">
      <input type="hidden" name="customer_id" value={customerId} />
      {link ? (
        <div className="space-y-1">
          <CopyLink url={link} label="Copy portal link" testId="portal-link" ariaLabel="Customer portal sign-in link" />
          <p className="text-xs text-slate-500">Works for 7 days. Send it only to this customer.</p>
        </div>
      ) : (
        <SubmitButton variant="ghost" size="sm" pendingText="Creating…" className="px-0 text-brand-700">
          Get a portal sign-in link for this customer
        </SubmitButton>
      )}
    </ActionForm>
  );
}
