"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

type Item = { href: string; label: string; roles: Array<"admin" | "sales" | "dispatch">; section: "CRM" | "TMS" | "Admin" };

const items: Item[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "sales"], section: "CRM" },
  { href: "/tasks", label: "Tasks", roles: ["admin", "sales", "dispatch"], section: "CRM" },
  { href: "/customers", label: "Customers", roles: ["admin", "sales"], section: "CRM" },
  { href: "/leads", label: "Leads", roles: ["admin", "sales"], section: "CRM" },
  { href: "/pipeline", label: "Pipeline", roles: ["admin", "sales"], section: "CRM" },
  { href: "/follow-ups", label: "Follow-ups", roles: ["admin", "sales"], section: "CRM" },
  { href: "/quote-orders", label: "Quote orders", roles: ["admin", "sales"], section: "TMS" },
  { href: "/loads", label: "Loads", roles: ["admin", "sales", "dispatch"], section: "TMS" },
  { href: "/carriers", label: "Carriers", roles: ["admin", "sales", "dispatch"], section: "TMS" },
  { href: "/bookings", label: "Web bookings", roles: ["admin", "sales"], section: "TMS" },
  { href: "/sequences", label: "Sequences", roles: ["admin"], section: "Admin" },
  { href: "/settings", label: "Settings", roles: ["admin"], section: "Admin" },
];

export function Nav({ role }: { role: "admin" | "sales" | "dispatch" }) {
  const pathname = usePathname();
  const all = items.filter((i) => i.roles.includes(role));
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
              active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <form action="/auth/signout" method="post" className="lg:hidden">
        <button className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-300">Sign out</button>
      </form>
    </nav>
  );
}
