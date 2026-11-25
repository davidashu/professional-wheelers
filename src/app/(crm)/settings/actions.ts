"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation";

const settingsSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required").max(120),
  default_quote_terms: z.string().trim().min(1, "Terms are required").max(5000),
  quote_validity_days: z.coerce.number().int().min(1, "At least 1 day").max(90, "At most 90 days"),
  booking_agreement_text: z.string().trim().min(1, "Agreement text is required").max(20000),
});

export async function updateSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const parsed = settingsSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the settings.", fieldErrors(parsed.error));
  const { error } = await supabase.from("app_settings").update(parsed.data).eq("id", 1);
  if (error) return fail(dbMessage(error));
  revalidatePath("/settings");
  return ok("Settings saved.");
}

const memberSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(["admin", "sales", "dispatch"]),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function updateTeamMember(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();
  const parsed = memberSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid request.");
  if (parsed.data.user_id === user.id) return fail("You can't change your own role or access.");
  const { error, count } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role, active: parsed.data.active }, { count: "exact" })
    .eq("id", parsed.data.user_id);
  if (error) return fail(dbMessage(error));
  if (!count) return fail("Teammate not found.");
  revalidatePath("/settings");
  return ok("Teammate updated.");
}

const inviteSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  role: z.enum(["admin", "sales", "dispatch"]),
  password: z.string().min(12, "Temporary password must be at least 12 characters").max(72),
});

export async function addTeammate(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the teammate details.", fieldErrors(parsed.error));
  const d = parsed.data;
  // Role lives in app_metadata, which only the service role can set; the
  // on_auth_user_created trigger turns it into an active staff profile.
  const { error } = await createAdminClient().auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    app_metadata: { role: d.role },
    user_metadata: { full_name: d.full_name },
  });
  if (error) {
    return fail(/already|exists|registered/i.test(error.message) ? "A user with that email already exists." : `Couldn't add teammate: ${error.message}`);
  }
  revalidatePath("/settings");
  return ok(`${d.full_name} can now sign in with the temporary password. Ask them to change it.`);
}
