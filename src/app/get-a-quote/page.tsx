import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { issueFormToken } from "@/lib/spam";
import { todayIso } from "@/lib/validation";
import { QuoteForm } from "./quote-form";

export const metadata: Metadata = {
  title: "Get a Vehicle Shipping Quote",
  description: "Tell us about your vehicle and route. A transport specialist will review your request and send your price.",
};

export default async function GetAQuotePage() {
  await connection(); // per-request token and submission key
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <span className="text-base font-bold tracking-tight text-brand-800">{serverEnv.companyName}</span>
          <span className="text-xs text-slate-500">Licensed &amp; insured broker</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Get a Vehicle Shipping Quote</h1>
        <p className="mt-2 text-base text-slate-600">
          Tell us what you&apos;re shipping and where. A transport specialist reviews every request and sends you a
          price, usually within one business day. No account needed.
        </p>
        <QuoteForm
          initialFormToken={issueFormToken(serverEnv.appSecret)}
          submissionKey={randomUUID()}
          minDate={todayIso()}
        />
      </main>
    </div>
  );
}
