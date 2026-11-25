"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitBookingDetails, type DetailsState } from "./actions";
import { Alert, FieldError, Label, buttonClass, inputClass } from "@/components/ui";
import type { Place, PublicBooking } from "@/lib/types";

export function BookingDetailsForm({ token, booking, pickup, delivery }: { token: string; booking: PublicBooking; pickup: Place; delivery: Place }) {
  const [state, action] = useActionState<DetailsState, FormData>(submitBookingDetails, null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const err = (k: string) => state?.errors?.[k];

  const field = (name: string, label: string, type = "text", autoComplete?: string) => (
    <div>
      <Label htmlFor={`bd-${name}`}>{label}</Label>
      <input id={`bd-${name}`} name={name} type={type} autoComplete={autoComplete} className={inputClass} aria-invalid={Boolean(err(name))} required />
      <FieldError id={`bd-${name}-error`} message={err(name)} />
    </div>
  );

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await action(fd);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div>
        <h2 className="text-lg font-bold text-slate-900">Complete your booking</h2>
        <p className="mt-1 text-sm text-slate-600">Tell us exactly where to pick up and deliver, who the driver should call, and sign the booking agreement.</p>
      </div>
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}

      <fieldset className="space-y-4 rounded-md p-4 ring-1 ring-slate-200">
        <legend className="px-1 text-sm font-semibold text-slate-800">Pickup in {pickup.city}, {pickup.state} {pickup.zip}</legend>
        {field("pickup_street", "Street address (with apt/suite)", "text", "shipping street-address")}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("pickup_contact_name", "Contact name at pickup")}
          {field("pickup_contact_phone", "Contact phone", "tel")}
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-md p-4 ring-1 ring-slate-200">
        <legend className="px-1 text-sm font-semibold text-slate-800">Delivery in {delivery.city}, {delivery.state} {delivery.zip}</legend>
        {field("delivery_street", "Street address (with apt/suite)")}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("delivery_contact_name", "Contact name at delivery")}
          {field("delivery_contact_phone", "Contact phone", "tel")}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="bd-notes" optional>Anything the driver should know?</Label>
        <textarea id="bd-notes" name="customer_notes" rows={2} maxLength={1000} className={inputClass} placeholder="Gate code, best time to call, parking…" />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Booking agreement</h3>
        <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200" tabIndex={0} data-testid="agreement-text">
          {booking.agreement_text}
        </div>
      </div>

      <div className="space-y-4">
        {field("signed_name", "Type your full name to sign", "text", "name")}
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="agree" className="mt-0.5 h-5 w-5 accent-brand-700" required />
          I agree to the booking agreement above and confirm the details I entered are correct.
        </label>
        {err("agree") && <p className="text-sm text-red-700">{err("agree")}</p>}
      </div>

      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending ? "Saving…" : "Sign and submit booking details"}
      </button>
    </form>
  );
}
