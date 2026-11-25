import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { issueFormToken } from "@/lib/spam";
import { todayIso } from "@/lib/validation";
import { PublicShell, TrustStrip } from "@/components/brand";
import { QuoteForm } from "./quote-form";

export const metadata: Metadata = {
  title: "Get a Vehicle Shipping Quote",
  description: "Tell us about your vehicle and route. A transport specialist will review your request and send your price.",
};

export default async function GetAQuotePage() {
  await connection(); // per-request token and submission key
  return (
    <PublicShell
      company={serverEnv.companyName}
      hero={
        <>
          <h1 className="heading-display text-3xl sm:text-4xl">Get a Vehicle Shipping Quote</h1>
          <p className="mt-3 max-w-xl text-base text-slate-600">
            Tell us the route and vehicle. A transport specialist reviews every request and sends your price, usually
            within one business day. No account needed.
          </p>
          <TrustStrip className="mt-5" />
        </>
      }
    >
      <QuoteForm
        initialFormToken={issueFormToken(serverEnv.appSecret)}
        submissionKey={randomUUID()}
        minDate={todayIso()}
      />
    </PublicShell>
  );
}
