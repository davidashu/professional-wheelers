import type { Metadata } from "next";
import Link from "next/link";
import { serverEnv } from "@/lib/env";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: { absolute: `${serverEnv.companyName} · Vehicle shipping` } };

export default function Home() {
  const company = serverEnv.companyName;
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <span className="text-base font-bold tracking-tight text-brand-800">{company}</span>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/portal/login" className="text-slate-700 hover:text-slate-900">Customer login</Link>
            <Link href="/login" className="text-slate-700 hover:text-slate-900">Broker login</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Ship your vehicle with a team that answers.</h1>
          <p className="mt-3 text-lg text-slate-600">
            Tell us what you&apos;re shipping and where. We review every request, find a licensed and insured carrier, and send you a firm price.
          </p>
          <div className="mt-6">
            <LinkButton href="/get-a-quote" size="lg">Get a free quote</LinkButton>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <PortalCard
            href="/portal/login"
            eyebrow="For customers"
            title="Customer portal"
            body="Review and accept quotes, add pickup and delivery details, track your shipment and message our team."
            cta="Customer login"
            testId="customer-portal-entry"
          />
          <PortalCard
            href="/login"
            eyebrow="For our team"
            title="Broker portal"
            body="Leads, pipeline, quotes, bookings and customer messages for brokerage staff."
            cta="Broker login"
            testId="broker-portal-entry"
          />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-slate-500">© {new Date().getFullYear()} {company}</div>
      </footer>
    </div>
  );
}

function PortalCard({ href, eyebrow, title, body, cta, testId }: { href: string; eyebrow: string; title: string; body: string; cta: string; testId: string }) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex flex-col rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-600"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">{eyebrow}</span>
      <span className="mt-1 text-xl font-bold text-slate-900">{title}</span>
      <span className="mt-2 flex-1 text-sm text-slate-600">{body}</span>
      <span className="mt-4 text-sm font-semibold text-brand-700 group-hover:text-brand-800">{cta} →</span>
    </Link>
  );
}
