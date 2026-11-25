"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { fieldErrors, normalizePhone } from "@/lib/validation";

const schema = z.object({
  customer_id: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.union([z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), z.literal("")]),
  phone: z.string().trim().max(30),
  company: z.string().trim().max(120),
  notes: z.string().trim().max(5000),
});

export async function updateCustomer(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrors(parsed.error));
  const { customer_id, ...c } = parsed.data;
  const { error } = await supabase
    .from("customers")
    .update({
      name: c.name,
      email: c.email || null,
      phone: c.phone ? normalizePhone(c.phone) : null,
      company: c.company || null,
      notes: c.notes || null,
    })
    .eq("id", customer_id);
  if (error) {
    if (error.code === "23505") return fail("Another customer already uses that email. Search for them instead.");
    return fail(dbMessage(error));
  }
  revalidatePath(`/customers/${customer_id}`);
  revalidatePath("/customers");
  return ok("Customer saved.");
}
