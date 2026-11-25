"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { buttonClass } from "@/components/ui";
import type { QuoteDisplayState } from "@/lib/labels";
import { recordPhoneAcceptance, resendQuoteEmail, rotateQuoteLink, withdrawQuote } from "../quote-actions";

export function QuoteRowActions({
  quoteId, leadId, state, link, linkBroken, canEmail, leadOpen,
}: {
  quoteId: string; leadId: string; state: QuoteDisplayState; link: string | null; linkBroken: boolean;
  canEmail: boolean; leadOpen: boolean;
}) {
  const [newLink, setNewLink] = useState<string | null>(null);
  const shown = newLink ?? link;
  const hidden = (
    <>
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="lead_id" value={leadId} />
    </>
  );

  if (state !== "sent") {
    return leadOpen && (state === "expired" || state === "declined" || state === "withdrawn") ? (
      <div className="mt-3">
        <Link href={`/leads/${leadId}?revise=${quoteId}#quotes`} className={buttonClass("secondary", "sm")}>Revise this quote</Link>
      </div>
    ) : null;
  }

  return (
    <div className="mt-3 space-y-2">
      {shown ? <CopyLink url={shown} /> : linkBroken && <p className="text-xs text-amber-800">This link was created with a different secret. Issue a new link to share it.</p>}
      <div className="flex flex-wrap gap-2">
        {canEmail && shown && (
          <ActionForm action={resendQuoteEmail}>{hidden}<button className={buttonClass("secondary", "sm")}>Email link to customer</button></ActionForm>
        )}
        <ActionForm action={rotateQuoteLink} onSuccess={(r) => setNewLink(r.data?.link ?? null)}>
          {hidden}<button className={buttonClass("ghost", "sm")}>Issue new link</button>
        </ActionForm>
        <ActionForm action={recordPhoneAcceptance}>
          {hidden}<button className={buttonClass("ghost", "sm")}>Customer accepted by phone</button>
        </ActionForm>
        <ActionForm action={withdrawQuote}>
          {hidden}<button className={buttonClass("ghost", "sm", "text-red-700")}>Withdraw</button>
        </ActionForm>
      </div>
    </div>
  );
}
