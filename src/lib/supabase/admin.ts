import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS, so it is used ONLY for the narrow public
 * flows (submit request, view/respond to a quote link, email webhooks), each
 * of which calls a single security-definer database function.
 */
export function createAdminClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
