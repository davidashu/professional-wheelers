"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { TASK_PRIORITY } from "@/lib/tms";
import { fieldErrors } from "@/lib/validation";

const pct = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace("%", "")) : null))
    .refine((v) => (v === null ? !required : Number.isFinite(v) && v >= 0 && v <= 100), `${label} must be 0–100`)
    .transform((v) => (v === null ? null : Math.round(v * 100) / 10000));

const ruleSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{1,40}$/),
    name: z.string().trim().min(1, "Name is required").max(120),
    description: z.string().trim().max(1000),
    months: z.coerce.number().int().min(1, "1 to 6 months").max(6, "1 to 6 months"),
    min_drop: pct("Minimum drop", true),
    max_drop: pct("Maximum drop", false),
    min_total_drop: pct("Combined drop", false),
    active: z.enum(["true", "false"]).transform((v) => v === "true"),
    task_priority: z.enum(TASK_PRIORITY),
    due_days: z.coerce.number().int().min(0, "0 to 30 days").max(30, "0 to 30 days"),
    task_title: z.string().trim().min(1, "Title is required").max(200),
    task_body: z.string().trim().min(1, "Task text is required").max(5000),
  })
  .refine((d) => d.max_drop === null || d.min_drop === null || d.max_drop > d.min_drop, {
    path: ["max_drop"],
    message: "Must be above the minimum drop",
  });

export async function updateRule(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const parsed = ruleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the rule.", fieldErrors(parsed.error));
  const { key, ...rest } = parsed.data;
  const { error, count } = await supabase.from("sequence_rules").update(rest, { count: "exact" }).eq("key", key);
  if (error) return fail(dbMessage(error));
  if (!count) return fail("Rule not found.");
  revalidatePath("/sequences");
  return ok("Rule saved.");
}

export async function runSequencesNow(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const asOf = String(fd.get("as_of") ?? "").trim();
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return fail("Pick a valid date.");
  const { data, error } = await supabase.rpc("run_profit_sequences", asOf ? { p_as_of: asOf } : {});
  if (error) return fail(dbMessage(error));
  const r = data as { month: string; customers_checked: number; tasks_created: number };
  revalidatePath("/sequences");
  revalidatePath("/tasks");
  return ok(`Checked ${r.customers_checked} customers for ${r.month.slice(0, 7)}. Created ${r.tasks_created} call task${r.tasks_created === 1 ? "" : "s"}.`);
}
