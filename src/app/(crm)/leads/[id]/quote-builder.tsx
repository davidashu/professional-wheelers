"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Label, buttonClass, inputClass } from "@/components/ui";
import { money } from "@/lib/format";
import { parseMoney, quoteTotals } from "@/lib/pricing";
import { discardDraft, saveQuote } from "../quote-actions";

type Defaults = {
  carrier_pay: string; broker_fee: string; pickup_window_start: string; pickup_window_end: string;
  expires_on: string; terms: string; internal_note: string;
};

export function QuoteBuilder({
  leadId, defaults, hasDraft, nextVersion, hasActiveQuote, emailConfigured, customerEmail, draftId,
}: {
  leadId: string; defaults: Defaults; hasDraft: boolean; nextVersion: number; hasActiveQuote: boolean;
  emailConfigured: boolean; customerEmail: string | null; draftId: string | null;
}) {
  const [carrier, setCarrier] = useState(defaults.carrier_pay);
  const [fee, setFee] = useState(defaults.broker_fee);
  const [link, setLink] = useState<string | null>(null);
  const c = parseMoney(carrier) ?? 0;
  const f = parseMoney(fee) ?? 0;
  const t = quoteTotals({ carrierPay: c, brokerFee: f });
  const canEmail = emailConfigured && Boolean(customerEmail);

  return (
    <div>
      <ActionForm action={saveQuote} onSuccess={(r) => setLink(r.data?.link ?? null)} className="space-y-4">
        {({ pending }) => (
          <>
            <input type="hidden" name="lead_id" value={leadId} />
            <p className="text-sm text-slate-600">
              {hasDraft ? `Editing draft v${nextVersion}.` : `This will be quote v${nextVersion}.`}{" "}
              {hasActiveQuote && "Sending it replaces the current quote; the old link stops accepting responses."}
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="carrier_pay">Estimated carrier pay</Label>
                <MoneyInput id="carrier_pay" name="carrier_pay" value={carrier} onChange={setCarrier} />
              </div>
              <div>
                <Label htmlFor="broker_fee">Brokerage fee</Label>
                <MoneyInput id="broker_fee" name="broker_fee" value={fee} onChange={setFee} />
              </div>
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200" aria-live="polite">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer total</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900" data-testid="quote-total">{money(t.total)}</p>
                <p className="text-xs font-semibold text-emerald-700" data-testid="gross-profit">
                  Est. gross profit {money(t.grossProfit)} ({t.marginPercent}%)
                </p>
                <p className="text-[11px] text-slate-500">Internal only</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="pickup_window_start">Pickup window from</Label>
                <input id="pickup_window_start" name="pickup_window_start" type="date" defaultValue={defaults.pickup_window_start} className={inputClass} required />
              </div>
              <div>
                <Label htmlFor="pickup_window_end">Pickup window to</Label>
                <input id="pickup_window_end" name="pickup_window_end" type="date" defaultValue={defaults.pickup_window_end} className={inputClass} required />
              </div>
              <div>
                <Label htmlFor="expires_on">Quote valid through</Label>
                <input id="expires_on" name="expires_on" type="date" defaultValue={defaults.expires_on} className={inputClass} required />
              </div>
            </div>
            <div>
              <Label htmlFor="terms">Terms shown to the customer</Label>
              <textarea id="terms" name="terms" rows={4} defaultValue={defaults.terms} className={inputClass} required />
            </div>
            <div>
              <Label htmlFor="internal_note" optional>Internal pricing note</Label>
              <input id="internal_note" name="internal_note" defaultValue={defaults.internal_note} className={inputClass} placeholder="Never shown to the customer" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" name="intent" value="send" className={buttonClass("primary")} disabled={pending}>
                {pending ? "Working…" : hasActiveQuote ? "Send revised quote & get link" : "Send quote & get link"}
              </button>
              <button
                type="submit"
                name="intent"
                value="send_email"
                className={buttonClass("secondary")}
                disabled={pending || !canEmail}
                title={!emailConfigured ? "Email provider isn't configured" : !customerEmail ? "No customer email" : undefined}
              >
                Send & email customer
              </button>
              <button type="submit" name="intent" value="draft" className={buttonClass("ghost")} disabled={pending}>
                Save draft
              </button>
            </div>
            {!canEmail && (
              <p className="text-xs text-slate-500">
                {!emailConfigured ? "Email isn't set up (RESEND_API_KEY / EMAIL_FROM). " : "No email on file. "}
                Copy the link and send it by text or your own email.
              </p>
            )}
          </>
        )}
      </ActionForm>
      {link && (
        <div className="mt-3 rounded-md bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <p className="mb-2 text-sm font-semibold text-emerald-900">Customer link</p>
          <CopyLink url={link} />
        </div>
      )}
      {draftId && (
        <ActionForm action={discardDraft} className="mt-2" showSuccess={false}>
          <input type="hidden" name="quote_id" value={draftId} />
          <input type="hidden" name="lead_id" value={leadId} />
          <button type="submit" className="text-xs font-medium text-slate-500 hover:text-red-700 hover:underline">Discard draft</button>
        </ActionForm>
      )}
    </div>
  );
}

function MoneyInput({ id, name, value, onChange }: { id: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">$</span>
      <input
        id={id}
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className={`${inputClass} pl-7 tabular-nums`}
        placeholder="0.00"
        required
      />
    </div>
  );
}
