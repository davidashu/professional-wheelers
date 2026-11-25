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
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
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
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
              active ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <form action="/auth/signout" method="post" className="lg:hidden">
        <button className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-600">Sign out</button>
      </form>
    </nav>
  );
}
