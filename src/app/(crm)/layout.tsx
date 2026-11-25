import { requireStaff, displayName } from "@/lib/auth";
import { Nav } from "./nav";

export const metadata = { robots: { index: false, follow: false } };

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireStaff();
  const { count: unread } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_type", "customer")
    .is("read_at", null);
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="border-b border-slate-800 bg-slate-900 text-slate-200 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <p className="text-sm font-bold tracking-tight text-white">Broker portal</p>
          <p className="hidden text-xs text-slate-400 lg:mt-0.5 lg:block">Brokerage workspace</p>
        </div>
        <Nav isAdmin={profile.role === "admin"} unreadMessages={unread ?? 0} />
        <div className="hidden border-t border-slate-800 px-4 py-4 lg:mt-auto lg:block">
          <p className="truncate text-sm font-medium text-white">{displayName(profile)}</p>
          <p className="text-xs capitalize text-slate-400">{profile.role}</p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="text-xs font-semibold text-slate-300 hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
