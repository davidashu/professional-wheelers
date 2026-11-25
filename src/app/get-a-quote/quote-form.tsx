"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import { submitQuoteRequest, type QuoteRequestState } from "./actions";
import { Alert, FieldError, Label, buttonClass, cx, inputClass } from "@/components/ui";
import { US_STATES } from "@/lib/us-states";

type Vehicle = { key: string };
const newVehicle = (): Vehicle => ({ key: Math.random().toString(36).slice(2) });

export function QuoteForm({
  initialFormToken,
  submissionKey,
  minDate,
}: {
  initialFormToken: string;
  submissionKey: string;
  minDate: string;
}) {
  const [state, formAction] = useActionState<QuoteRequestState, FormData>(submitQuoteRequest, {
    status: "idle",
    formToken: initialFormToken,
  });
  const [isPending, startTransition] = useTransition();
  const [vehicles, setVehicles] = useState<Vehicle[]>([newVehicle()]);
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // When the server sends back errors, jump to the first step that has one.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "error") {
      const keys = Object.keys(state.errors);
      const first = STEPS.findIndex((st) => keys.some((k) => st.fields.some((f) => k === f || k.startsWith(f + "."))));
      if (first >= 0) setStep(first);
    }
  }

  const goTo = (next: number) => {
    setStep(next);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Checks the required fields on the current step before moving on. */
  const continueFrom = (current: number) => {
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${current}"]`);
    const fields = panel ? Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select, textarea")) : [];
    const invalid = fields.find((f) => !f.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    goTo(current + 1);
  };

  if (state.status === "success") {
    return (
      <div className="rounded-xl bg-white p-6 shadow-xs ring-1 ring-slate-200" role="status" aria-live="polite">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">
          ✓
        </div>
        <h2 className="heading-display mt-4 text-2xl">
          {state.duplicate ? "We already have your request" : "Request received"}
        </h2>
        <p className="mt-2 text-slate-600">
          {state.duplicate
            ? "This matches a request you sent recently, so we didn't create a second one. "
            : "Thanks! A transport specialist will review your details and email your quote. "}
          Please keep your reference number handy if you contact us.
        </p>
        <p className="mt-5 text-sm text-slate-500">Reference number</p>
        <p className="font-mono text-2xl font-bold tracking-wider text-brand-900" data-testid="reference">
          {state.reference}
        </p>
        <p className="mt-5 text-sm text-slate-500">
          We&apos;ll collect full pickup and delivery addresses once your shipment is booked.
        </p>
        <a href="/get-a-quote" className={buttonClass("secondary", "md", "mt-6")}>
          Request another quote
        </a>
      </div>
    );
  }

  const errors = state.status === "error" ? state.errors : {};
  const err = (k: string) => errors[k];

  return (
    <form
      ref={formRef}
      className="scroll-mt-4 space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (isPending) return; // ignore double taps while saving
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="submission_key" value={submissionKey} />
      <input type="hidden" name="form_token" value={state.formToken} />
      {/* Honeypot: hidden from people and screen readers */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <StepProgress step={step} />

      {state.status === "error" && <Alert title="We couldn't submit your request">{state.message}</Alert>}

      <div data-step="0" hidden={step !== 0} className="space-y-6">
        <Section title="Route" description="City and ZIP are enough for now. We'll get full addresses after you book.">
          <fieldset className="grid gap-4 sm:grid-cols-6">
            <legend className="mb-2 text-sm font-semibold text-slate-700 sm:col-span-6">Pickup</legend>
            <TextField name="pickup_city" label="City" autoComplete="address-level2" error={err("pickup_city")} className="sm:col-span-3" required />
            <StateField name="pickup_state" error={err("pickup_state")} />
            <TextField name="pickup_zip" label="ZIP code" inputMode="numeric" autoComplete="postal-code" maxLength={5} error={err("pickup_zip")} className="sm:col-span-1" required />
          </fieldset>
          <fieldset className="mt-6 grid gap-4 sm:grid-cols-6">
            <legend className="mb-2 text-sm font-semibold text-slate-700 sm:col-span-6">Delivery</legend>
            <TextField name="delivery_city" label="City" error={err("delivery_city")} className="sm:col-span-3" required />
            <StateField name="delivery_state" error={err("delivery_state")} />
            <TextField name="delivery_zip" label="ZIP code" inputMode="numeric" maxLength={5} error={err("delivery_zip")} className="sm:col-span-1" required />
          </fieldset>
        </Section>
        <Section title="Pickup date">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="earliest_pickup_date" label="Earliest available pickup date" type="date" min={minDate} error={err("earliest_pickup_date")} required />
            <RadioGroup
              name="pickup_date_flexible"
              label="Is this date flexible?"
              options={[["yes", "Yes, flexible"], ["no", "No, fixed date"]]}
              defaultValue="yes"
              error={err("pickup_date_flexible")}
            />
          </div>
        </Section>
        <Section title="Transport type">
          <RadioGroup
            name="transport_type"
            label="How should it ship?"
            options={[
              ["open", "Open carrier (most common, lower cost)"],
              ["enclosed", "Enclosed carrier (classic, luxury or low clearance)"],
            ]}
            defaultValue="open"
            stacked
            error={err("transport_type")}
          />
        </Section>
        <StepNav>
          <button type="button" className={buttonClass("primary", "lg", "flex-1")} onClick={() => continueFrom(0)}>
            Continue to vehicle
          </button>
        </StepNav>
      </div>

      <div data-step="1" hidden={step !== 1} className="space-y-6">
        <Section title="Vehicles">
          <div className="space-y-4">
            {vehicles.map((v, i) => (
              <div key={v.key} className="rounded-md border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Vehicle {i + 1}</p>
                  {vehicles.length > 1 && (
                    <button
                      type="button"
                      className="text-sm font-medium text-red-700 hover:underline"
                      onClick={() => setVehicles((vs) => vs.filter((x) => x.key !== v.key))}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-6">
                  <TextField name={`vehicles.${i}.year`} label="Year" inputMode="numeric" maxLength={4} error={err(`vehicles.${i}.year`)} className="sm:col-span-1" required />
                  <TextField name={`vehicles.${i}.make`} label="Make" placeholder="e.g. Toyota" error={err(`vehicles.${i}.make`)} className="sm:col-span-2" required />
                  <TextField name={`vehicles.${i}.model`} label="Model" placeholder="e.g. Camry" error={err(`vehicles.${i}.model`)} className="sm:col-span-3" required />
                  <div className="sm:col-span-6">
                    <RadioGroup
                      name={`vehicles.${i}.operable`}
                      label="Does it run and drive?"
                      options={[["yes", "Yes"], ["no", "No (needs a winch)"]]}
                      defaultValue="yes"
                      error={err(`vehicles.${i}.operable`)}
                    />
                  </div>
                </div>
              </div>
            ))}
            {err("vehicles") && <p className="text-sm text-red-700">{err("vehicles")}</p>}
            {vehicles.length < 10 && (
              <button
                type="button"
                className={buttonClass("secondary", "md", "w-full sm:w-auto")}
                onClick={() => setVehicles((vs) => [...vs, newVehicle()])}
              >
                + Add another vehicle
              </button>
            )}
          </div>
        </Section>
        <Section title="Anything we should know?">
          <div>
            <Label htmlFor="special_instructions" optional>
              Special instructions
            </Label>
            <textarea
              id="special_instructions"
              name="special_instructions"
              rows={3}
              maxLength={2000}
              placeholder="Oversized or modified vehicle, limited pickup access, narrow street, etc."
              className={inputClass}
              aria-invalid={Boolean(err("special_instructions"))}
            />
            <FieldError id="special_instructions-error" message={err("special_instructions")} />
          </div>
        </Section>
        <StepNav>
          <button type="button" className={buttonClass("secondary", "lg")} onClick={() => goTo(0)}>
            Back
          </button>
          <button type="button" className={buttonClass("primary", "lg", "flex-1")} onClick={() => continueFrom(1)}>
            Continue to contact
          </button>
        </StepNav>
      </div>

      <div data-step="2" hidden={step !== 2} className="space-y-6">
        <Section title="Your contact details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Full name" autoComplete="name" error={err("name")} className="sm:col-span-2" required />
            <TextField name="email" label="Email" type="email" autoComplete="email" inputMode="email" error={err("email")} required />
            <TextField name="phone" label="Phone" type="tel" autoComplete="tel" inputMode="tel" error={err("phone")} required />
            <TextField name="company" label="Company" autoComplete="organization" error={err("company")} optional className="sm:col-span-2" />
          </div>
        </Section>
        <StepNav>
          <button type="button" className={buttonClass("secondary", "lg")} onClick={() => goTo(1)}>
            Back
          </button>
          <button type="submit" disabled={isPending} className={buttonClass("primary", "lg", "flex-1")}>
            {isPending ? "Sending your request…" : "Request my quote"}
          </button>
        </StepNav>
        <p className="text-center text-xs text-slate-500">
          No price is shown instantly. Our team reviews your route and vehicle and emails a quote. We never sell your information.
        </p>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-xs ring-1 ring-slate-200 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TextField({
  name, label, error, className, optional, ...rest
}: React.ComponentProps<"input"> & { name: string; label: string; error?: string; optional?: boolean }) {
  const id = useId() + name;
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional}>{label}</Label>
      <input
        id={id}
        name={name}
        className={inputClass}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function StateField({ name, error }: { name: string; error?: string }) {
  const id = useId() + name;
  return (
    <div className="sm:col-span-2">
      <Label htmlFor={id}>State</Label>
      <select id={id} name={name} defaultValue="" className={inputClass} aria-invalid={Boolean(error)} required>
        <option value="" disabled>Select…</option>
        {US_STATES.map(([code, label]) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function RadioGroup({
  name, label, options, defaultValue, error, stacked,
}: {
  name: string; label: string; options: Array<[string, string]>; defaultValue: string; error?: string; stacked?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-slate-800">{label}</legend>
      <div className={cx("gap-2", stacked ? "grid" : "flex flex-wrap")}>
        {options.map(([value, text]) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 has-[:checked]:bg-accent-50 has-[:checked]:ring-2 has-[:checked]:ring-accent-500"
          >
            <input type="radio" name={name} value={value} defaultChecked={value === defaultValue} className="h-4 w-4 accent-accent-600" />
            {text}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}

const STEPS: Array<{ label: string; fields: string[] }> = [
  {
    label: "Route",
    fields: ["pickup_city", "pickup_state", "pickup_zip", "delivery_city", "delivery_state", "delivery_zip", "earliest_pickup_date", "pickup_date_flexible", "transport_type"],
  },
  { label: "Vehicle", fields: ["vehicles", "special_instructions"] },
  { label: "Contact", fields: ["name", "email", "phone", "company"] },
];

function StepProgress({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Form progress">
      {STEPS.map((st, i) => (
        <li key={st.label} aria-current={i === step ? "step" : undefined} className="text-xs font-semibold">
          <span className={cx("block h-1.5 rounded-full", i <= step ? "bg-accent-500" : "bg-slate-200")} />
          <span className={cx("mt-1.5 block", i <= step ? "text-ink" : "text-slate-500")}>
            {i + 1}. {st.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Step buttons. On phones they stick to the bottom of the screen. */
function StepNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      {children}
    </div>
  );
}
