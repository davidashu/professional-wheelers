import { requireStaff, displayName } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { Wordmark } from "@/components/brand";
import { Nav } from "./nav";

export const metadata = { robots: { index: false, follow: false } };

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="border-b border-slate-200 bg-white text-slate-700 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Wordmark name={serverEnv.companyName} className="text-ink" />
          <p className="hidden pl-9 text-xs text-slate-500 lg:mt-0.5 lg:block">Broker workspace</p>
        </div>
        <Nav isAdmin={profile.role === "admin"} />
        <div className="hidden border-t border-slate-200 px-4 py-4 lg:mt-auto lg:block">
          <p className="truncate text-sm font-semibold text-ink">{displayName(profile)}</p>
          <p className="text-xs capitalize text-slate-500">{profile.role}</p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="text-xs font-semibold text-slate-600 hover:text-brand-700">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
