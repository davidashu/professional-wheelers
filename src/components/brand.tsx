import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";

/** Placeholder logo mark: a car on a rounded tile. Swap for the real logo when available. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cx("h-7 w-7 shrink-0", className)}>
      <rect x="1" y="1" width="22" height="22" rx="6" className="fill-accent-600" />
      <path
        d="M5 15.5h14M7 15.5l1.6-4.2c.3-.8 1-1.3 1.9-1.3h3c.9 0 1.6.5 1.9 1.3l1.6 4.2"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8.5" cy="16.5" r="1.4" fill="white" />
      <circle cx="15.5" cy="16.5" r="1.4" fill="white" />
    </svg>
  );
}

export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cx("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-base font-extrabold leading-none tracking-tight">{name}</span>
    </span>
  );
}

const TRUST = ["Licensed & insured broker", "No payment to get a quote", "A real person prices every request"];

export function TrustStrip({ className }: { className?: string }) {
  return (
    <ul className={cx("flex flex-wrap gap-2", className)} aria-label="Why customers choose us">
      {TRUST.map((t) => (
        <li key={t} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
          {t}
        </li>
      ))}
    </ul>
  );
}

/**
 * Frame for customer-facing pages: white header with the company name, an
 * optional hero, page content, and a footer with a quiet staff sign-in link.
 */
export function PublicShell({
  company,
  hero,
  children,
  width = "max-w-2xl",
}: {
  company: string;
  hero?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white text-ink">
        <div className={cx("mx-auto flex items-center justify-between gap-3 px-4 py-3", width)}>
          <Wordmark name={company} />
          <span className="hidden text-xs text-slate-500 sm:inline">Licensed &amp; insured auto transport broker</span>
        </div>
      </header>
      {hero && (
        <div className="border-b border-brand-100 bg-brand-50 text-ink">
          <div className={cx("mx-auto px-4 pb-8 pt-6 sm:pb-10 sm:pt-10", width)}>{hero}</div>
        </div>
      )}
      <main className={cx("mx-auto w-full flex-1 px-4 pb-16 pt-6", width)}>{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className={cx("mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500", width)}>
          <span>© {company}. We never sell your information.</span>
          <Link href="/login" className="font-medium text-slate-500 hover:text-brand-700 hover:underline">
            Staff sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
