import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Settings } from "./types";

/** Throw on query errors so the page's error boundary shows a clear failure state. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Couldn't load ${what}: ${res.error.message}`);
  return res.data as T;
}

export async function getTeam(supabase: SupabaseClient): Promise<Profile[]> {
  const res = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active, customer_id")
    .neq("role", "customer")
    .order("full_name");
  return must(res, "team") as Profile[];
}

export function teamMap(team: Profile[]) {
  return new Map(team.map((p) => [p.id, p]));
}

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
  const res = await supabase
    .from("app_settings")
    .select("company_name, default_quote_terms, quote_validity_days, booking_agreement_text")
    .eq("id", 1)
    .single();
  return must(res, "settings") as Settings;
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Vehicle summary per lead: "2019 Porsche 911, 2020 Honda Civic" */
export async function vehicleSummaries(supabase: SupabaseClient, leadIds: string[]) {
  const map = new Map<string, string>();
  if (leadIds.length === 0) return map;
  const res = await supabase
    .from("lead_vehicles")
    .select("lead_id, year, make, model, position")
    .in("lead_id", leadIds)
    .order("position");
  for (const v of must(res, "vehicles") as Array<{ lead_id: string; year: number; make: string; model: string }>) {
    const s = `${v.year} ${v.make} ${v.model}`;
    map.set(v.lead_id, map.has(v.lead_id) ? `${map.get(v.lead_id)}, ${s}` : s);
  }
  return map;
}
