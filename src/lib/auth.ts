import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "sales" | "dispatch" | "customer";
export type StaffProfile = {
  id: string; email: string; full_name: string; role: Role; active: boolean; customer_id: string | null;
};

/** Where each role lands after signing in. */
export function homeFor(role: Role) {
  return role === "customer" ? "/portal" : role === "dispatch" ? "/loads" : "/dashboard";
}

/** Current user + profile, deduplicated per request. Verifies the JWT with Supabase Auth. */
export const getCurrentStaff = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active, customer_id")
    .eq("id", user.id)
    .maybeSingle<StaffProfile>();
  return { supabase, user, profile: profile ?? null };
});

async function requireActive() {
  const { supabase, user, profile } = await getCurrentStaff();
  if (!user) redirect("/login");
  if (!profile || !profile.active) redirect("/login?error=no_access");
  return { supabase, user, profile };
}

/** Anyone who works for the brokerage: admin, sales, dispatch (the staff app shell, TMS pages). */
export async function requireInternal() {
  const ctx = await requireActive();
  if (ctx.profile.role === "customer") redirect("/portal");
  return ctx;
}

/** CRM pages and actions: admin and sales. Dispatch is sent to the TMS. */
export async function requireStaff() {
  const ctx = await requireInternal();
  if (ctx.profile.role === "dispatch") redirect("/loads");
  return ctx;
}

/** Customer portal: customer logins only. */
export async function requireCustomer() {
  const ctx = await requireActive();
  if (ctx.profile.role !== "customer" || !ctx.profile.customer_id) redirect(homeFor(ctx.profile.role));
  return { ...ctx, customerId: ctx.profile.customer_id as string };
}

export async function requireAdmin() {
  const ctx = await requireStaff();
  if (ctx.profile.role !== "admin") redirect("/dashboard?error=admin_only");
  return ctx;
}

export function displayName(p: { full_name?: string | null; email?: string | null } | null | undefined) {
  if (!p) return "Unassigned";
  return p.full_name?.trim() || p.email || "Unknown";
}
