import Link from "next/link";
import { displayName, requireCustomer } from "@/lib/auth";
import { COMPANY } from "@/lib/tms";

export const metadata = { title: { default: "Customer portal", template: "%s · Customer portal" }, robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireCustomer();
  const { data } = await supabase.rpc("portal_customer").maybeSingle<{ name: string; company: string | null }>();
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/portal" className="leading-tight">
            <p className="text-sm font-bold text-slate-900">{COMPANY.name}</p>
            <p className="text-xs text-slate-500">Customer portal{data ? ` · ${data.company ?? data.name}` : ""}</p>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">{displayName(profile)}</span>
            <form action="/auth/signout" method="post">
              <button className="font-semibold text-slate-600 hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 print:p-0">{children}</main>
    </div>
  );
}
