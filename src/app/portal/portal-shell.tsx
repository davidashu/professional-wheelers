import Link from "next/link";
import type { ReactNode } from "react";
import { signOutOfPortal } from "./actions";
import { PortalNav } from "./portal-nav";

/** Frame for signed-in portal pages. */
export function PortalShell({
  company,
  customerName,
  unread,
  children,
}: {
  company: string;
  customerName: string;
  unread: number;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/portal" className="text-base font-bold tracking-tight text-brand-800">
            {company}
            <span className="ml-2 hidden align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline">Customer portal</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{customerName}</span>
            <form action={signOutOfPortal}>
              <button className="font-semibold text-slate-700 hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </div>
        <PortalNav unread={unread} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

/** Frame for the signed-out pages (sign in, link landing). */
export function PortalAuthShell({ company, title, children, footer }: { company: string; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-center text-sm font-bold tracking-tight text-brand-800">{company}</Link>
        <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Customer portal</p>
        <h1 className="mt-3 text-center text-2xl font-bold text-slate-900">{title}</h1>
        <div className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </main>
  );
}
