import type { Metadata } from "next";
import Link from "next/link";
import { serverEnv } from "@/lib/env";
import { isWellFormedToken } from "@/lib/tokens";
import { PortalAuthShell } from "../portal-shell";
import { ContinueForm } from "./continue-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Landing page for sign-in links. Signing in needs a button press (a POST),
 * because email security scanners open links automatically and would
 * otherwise use up one-time links before the customer does.
 */
export default async function PortalAuthPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && isWellFormedToken(token);
  return (
    <PortalAuthShell company={serverEnv.companyName} title={valid ? "Welcome back" : "This link isn't valid"}>
      {valid ? (
        <ContinueForm token={token} />
      ) : (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Check that you opened the whole link from your email.</p>
          <Link href="/portal/login" className="font-semibold text-brand-700 hover:underline">Request a new sign-in link</Link>
        </div>
      )}
    </PortalAuthShell>
  );
}
