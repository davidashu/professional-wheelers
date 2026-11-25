"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { dbMessage, fail, ok, type ActionResult } from "@/lib/actions";
import { bookingUpdateSchema, fieldErrors } from "@/lib/validation";

export async function updateBooking(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const parsed = bookingUpdateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Please fix the booking details.", fieldErrors(parsed.error));
  const { booking_id, ...b } = parsed.data;
  const nullify = (v: string) => (v.trim() === "" ? null : v.trim());
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: b.status,
      pickup_address: nullify(b.pickup_address),
      pickup_contact_name: nullify(b.pickup_contact_name),
      pickup_contact_phone: nullify(b.pickup_contact_phone),
      delivery_address: nullify(b.delivery_address),
      delivery_contact_name: nullify(b.delivery_contact_name),
      delivery_contact_phone: nullify(b.delivery_contact_phone),
      carrier_name: nullify(b.carrier_name),
      carrier_phone: nullify(b.carrier_phone),
      notes: nullify(b.notes),
    })
    .eq("id", booking_id)
    .select("lead_id")
    .maybeSingle();
  if (error) return fail(dbMessage(error, "Couldn't save the booking."));
  if (!data) return fail("Booking not found.");
  revalidatePath(`/bookings/${booking_id}`);
  revalidatePath("/bookings");
  revalidatePath(`/leads/${data.lead_id}`);
  revalidatePath("/dashboard");
  return ok("Booking saved.");
}
