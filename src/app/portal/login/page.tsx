import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { getPortal } from "@/lib/portal";
import { Alert } from "@/components/ui";
import { PortalAuthShell } from "../portal-shell";
import { PortalLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Customer sign in", robots: { index: false } };

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; signed_out?: string }> }) {
  const { error, signed_out } = await searchParams;
  if (await getPortal()) redirect("/portal");
  return (
    <PortalAuthShell
      company={serverEnv.companyName}
      title="Sign in to your portal"
      footer={
        <>
          <p>
            New here? <Link href="/get-a-quote" className="font-semibold text-brand-700 hover:underline">Get a shipping quote</Link>. No account needed.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Staff and brokers: <Link href="/login" className="hover:underline">broker portal sign in</Link>
          </p>
        </>
      }
    >
      <div className="space-y-4">
        {signed_out && <Alert tone="success">You&apos;re signed out.</Alert>}
        {error === "link" && <Alert tone="warning">That quote link can&apos;t open the portal anymore. Sign in with your email instead.</Alert>}
        <p className="text-sm text-slate-600">
          See your quotes, bookings and shipment status, and message our team. Enter the email you used when you asked for a quote and we&apos;ll send you a sign-in link. There&apos;s no password.
        </p>
        <PortalLoginForm />
        <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
          Have a quote from us? You can also open the link in your quote email and choose <strong>Open my customer portal</strong>.
        </p>
      </div>
    </PortalAuthShell>
  );
}
