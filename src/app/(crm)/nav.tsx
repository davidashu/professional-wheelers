"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/customers", label: "Customers" },
  { href: "/bookings", label: "Bookings" },
  { href: "/messages", label: "Messages" },
];

export function Nav({ isAdmin, unreadMessages = 0 }: { isAdmin: boolean; unreadMessages?: number }) {
  const pathname = usePathname();
  const all = isAdmin ? [...items, { href: "/settings", label: "Settings" }] : items;
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
      {all.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
              active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
            )}
          >
            {item.label}
            {item.href === "/messages" && unreadMessages > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white" aria-label={`${unreadMessages} unread`}>
                {unreadMessages}
              </span>
            )}
          </Link>
        );
      })}
      <form action="/auth/signout" method="post" className="lg:hidden">
        <button className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-300">Sign out</button>
      </form>
    </nav>
  );
}
