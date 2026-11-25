"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function PortalNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  const items = [
    { href: "/portal", label: "My shipments", exact: true },
    { href: "/portal/messages", label: "Messages", badge: unread },
  ];
  return (
    <nav aria-label="Portal" className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-2 sm:px-4">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
              active ? "border-brand-700 text-brand-800" : "border-transparent text-slate-600 hover:text-slate-900",
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="rounded-full bg-brand-700 px-1.5 py-0.5 text-xs font-semibold leading-none text-white" aria-label={`${item.badge} unread`}>
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
      <Link href="/get-a-quote" className="ml-auto whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
        + New quote
      </Link>
    </nav>
  );
}
