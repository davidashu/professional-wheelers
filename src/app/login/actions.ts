"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type Role } from "@/lib/auth";

export type LoginState = { error?: string; email?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
  next: z.string().optional(),
});

function safeNext(next: string | undefined, home: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return home;
  // Customers only ever land in the portal; staff never land there.
  if (home === "/portal" && !next.startsWith("/portal")) return home;
  if (home !== "/portal" && next.startsWith("/portal")) return home;
  return next;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password.", email: String(formData.get("email") ?? "") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return { error: "That email and password don't match an account.", email: parsed.data.email };
  }
  const { data: profile } = await supabase.from("profiles").select("active, role").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "Your account doesn't have access yet. Ask an admin to enable it.", email: parsed.data.email };
  }
  redirect(safeNext(parsed.data.next, homeFor(profile.role as Role)));
}
