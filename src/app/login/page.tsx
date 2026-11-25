import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Broker portal sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-bold tracking-tight text-brand-800">Broker portal</p>
        <h1 className="mt-2 text-center text-2xl font-bold text-slate-900">Staff sign in</h1>
        <div className="mt-8 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <LoginForm next={next} initialError={error === "no_access" ? "Your account doesn't have CRM access. Ask an admin to enable it." : undefined} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Accounts are created by an admin. Customers: use the{" "}
          <Link href="/portal/login" className="font-medium text-brand-700 hover:underline">customer portal</Link>.
        </p>
      </div>
    </main>
  );
}
