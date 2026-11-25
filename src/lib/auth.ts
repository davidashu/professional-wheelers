import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "sales";
export type StaffProfile = { id: string; email: string; full_name: string; role: Role; active: boolean };

/** Current user + profile, deduplicated per request. Verifies the JWT with Supabase Auth. */
export const getCurrentStaff = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle<StaffProfile>();
  return { supabase, user, profile: profile ?? null };
});

/** Server-side gate for every CRM page and action. */
export async function requireStaff() {
  const { supabase, user, profile } = await getCurrentStaff();
  if (!user) redirect("/login");
  if (!profile || !profile.active) redirect("/login?error=no_access");
  return { supabase, user, profile };
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
