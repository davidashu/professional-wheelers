"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { optText, optUuid } from "@/lib/form";
import { TASK_PRIORITY } from "@/lib/tms";
import { fieldErrors } from "@/lib/validation";

const newTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: optText(10000),
  assignee: z.string().min(1, "Choose who it's for"),
  due_on: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Choose a date"),
  priority: z.enum(TASK_PRIORITY).default("normal"),
  customer_id: optUuid,
  load_id: optUuid,
});

function revalidateTaskViews(customerId: string | null, loadId: string | null) {
  revalidatePath("/tasks");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  if (loadId) revalidatePath(`/loads/${loadId}`);
}

export async function createTask(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireInternal();
  const parsed = newTaskSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the task.", fieldErrors(parsed.error));
  const { assignee, due_on, ...t } = parsed.data;
  // assignee is "user:<uuid>" or "role:<sales|dispatch|admin>"
  const [kind, value] = assignee.split(":");
  const assigned =
    kind === "role" && ["admin", "sales", "dispatch"].includes(value ?? "")
      ? { assigned_role: value, assigned_user_id: null }
      : kind === "user" && z.uuid().safeParse(value).success
        ? { assigned_user_id: value, assigned_role: null }
        : null;
  if (!assigned) return fail("Choose who it's for.");
  const { error } = await supabase.from("tasks").insert({
    ...t,
    ...assigned,
    // End of the business day in Utah.
    due_at: due_on ? `${due_on}T17:00:00-07:00` : null,
    created_by: user.id,
  });
  if (error) return fail(dbMessage(error, "Couldn't create the task."));
  revalidateTaskViews(t.customer_id, t.load_id);
  return ok("Task created.");
}

const idSchema = z.object({ task_id: z.uuid(), customer_id: optUuid, load_id: optUuid });

export async function claimTask(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireInternal();
  const parsed = idSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid task.");
  const { error, count } = await supabase
    .from("tasks")
    .update({ assigned_user_id: user.id }, { count: "exact" })
    .eq("id", parsed.data.task_id)
    .is("assigned_user_id", null);
  if (error) return fail(dbMessage(error));
  if (!count) return fail("Someone already took this task.");
  revalidateTaskViews(parsed.data.customer_id, parsed.data.load_id);
  return ok("It's yours.");
}

export async function completeTask(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireInternal();
  const parsed = idSchema
    .extend({ outcome: optText(2000), status: z.enum(["done", "cancelled", "open"]).default("done") })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid task.");
  const { task_id, outcome, status } = parsed.data;
  const { data: task } = await supabase.from("tasks").select("source").eq("id", task_id).maybeSingle();
  if (task?.source === "sequence" && status === "done" && !outcome) {
    return fail("Write down what the customer said before completing this call task.", { outcome: "Outcome is required" });
  }
  const { error, count } = await supabase.from("tasks").update({ status, outcome }, { count: "exact" }).eq("id", task_id);
  if (error) return fail(dbMessage(error));
  if (!count) return fail("You can't change this task.");
  revalidateTaskViews(parsed.data.customer_id, parsed.data.load_id);
  return ok(status === "open" ? "Task reopened." : "Task updated.");
}
