import type { Metadata } from "next";
import { serverEnv } from "@/lib/env";
import { Wordmark } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Wordmark name={serverEnv.companyName} className="justify-center text-ink" />
        <h1 className="heading-display mt-6 text-center text-2xl">Staff sign in</h1>
        <div className="mt-8 rounded-xl bg-white p-6 shadow-xs ring-1 ring-slate-200">
          <LoginForm next={next} initialError={error === "no_access" ? "Your account doesn't have CRM access. Ask an admin to enable it." : undefined} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Accounts are created by an admin. Customers don&apos;t need to sign in.
        </p>
      </div>
    </main>
  );
}
