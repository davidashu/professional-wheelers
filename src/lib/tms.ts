import type { Tone } from "@/components/ui";

// ---------------------------------------------------------------------------
// Customer status bar (what the customer sees)
// ---------------------------------------------------------------------------
export const CUSTOMER_STATUSES = [
  "confirmed", "dispatched", "pickup_delayed", "picked_up", "running_late", "pod_received", "pod_issue",
  "delivered", "invoiced", "payment_due", "paid", "customer_paid", "load_issue", "cancelled",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  confirmed: "Confirmed",
  dispatched: "Dispatched",
  pickup_delayed: "Pick up delayed",
  picked_up: "Picked up",
  running_late: "Running late",
  pod_received: "POD received",
  pod_issue: "POD issue",
  delivered: "Delivered",
  invoiced: "Invoiced to customer",
  payment_due: "Payment due",
  paid: "Paid (carrier)",
  customer_paid: "Customer paid",
  load_issue: "Load issue",
  cancelled: "Cancelled",
};

export const CUSTOMER_STATUS_TONE: Record<CustomerStatus, Tone> = {
  confirmed: "blue", dispatched: "violet", pickup_delayed: "amber", picked_up: "violet", running_late: "amber",
  pod_received: "teal", pod_issue: "red", delivered: "green", invoiced: "teal", payment_due: "amber",
  paid: "green", customer_paid: "green", load_issue: "red", cancelled: "gray",
};

/** Main path shown as the progress bar; side states (delays, issues) show on the step they belong to. */
export const CUSTOMER_PATH: CustomerStatus[] = [
  "confirmed", "dispatched", "picked_up", "delivered", "invoiced", "customer_paid",
];
export const CUSTOMER_STEP_OF: Record<CustomerStatus, CustomerStatus> = {
  confirmed: "confirmed", dispatched: "dispatched", pickup_delayed: "dispatched", picked_up: "picked_up",
  running_late: "picked_up", pod_received: "delivered", pod_issue: "delivered", delivered: "delivered",
  invoiced: "invoiced", payment_due: "invoiced", paid: "invoiced", customer_paid: "customer_paid",
  load_issue: "confirmed", cancelled: "confirmed",
};
export const CUSTOMER_PROBLEM: CustomerStatus[] = ["pickup_delayed", "running_late", "pod_issue", "payment_due", "load_issue"];
export const NEEDS_CARRIER: CustomerStatus[] = [
  "dispatched", "pickup_delayed", "picked_up", "running_late", "pod_received", "pod_issue", "delivered",
];
export const NEEDS_ISSUE_NOTE: CustomerStatus[] = ["pod_issue", "load_issue"];

// ---------------------------------------------------------------------------
// Carrier status bar
// ---------------------------------------------------------------------------
export const CARRIER_STATUSES = [
  "not_assigned", "assigned", "rate_con_signed", "picked_up", "delivered", "invoice_received", "issue", "paid",
] as const;
export type CarrierStatus = (typeof CARRIER_STATUSES)[number];

export const CARRIER_STATUS_LABEL: Record<CarrierStatus, string> = {
  not_assigned: "No carrier",
  assigned: "Carrier assigned",
  rate_con_signed: "Rate con signed",
  picked_up: "Picked up",
  delivered: "Delivered",
  invoice_received: "Carrier invoice received",
  issue: "Issue / claim",
  paid: "Paid to carrier",
};
export const CARRIER_STATUS_TONE: Record<CarrierStatus, Tone> = {
  not_assigned: "gray", assigned: "blue", rate_con_signed: "violet", picked_up: "violet", delivered: "teal",
  invoice_received: "amber", issue: "red", paid: "green",
};
export const CARRIER_PATH: CarrierStatus[] = [
  "assigned", "rate_con_signed", "picked_up", "delivered", "invoice_received", "paid",
];

// ---------------------------------------------------------------------------
// Quote orders
// ---------------------------------------------------------------------------
export const QUOTE_ORDER_STATUSES = ["new", "quoted", "approved", "too_high", "too_low", "cancelled"] as const;
export type QuoteOrderStatus = (typeof QUOTE_ORDER_STATUSES)[number];
export const QUOTE_ORDER_LABEL: Record<QuoteOrderStatus, string> = {
  new: "Posted", quoted: "Quoted", approved: "Approved", too_high: "Too high", too_low: "Too low", cancelled: "Cancelled",
};
export const QUOTE_ORDER_TONE: Record<QuoteOrderStatus, Tone> = {
  new: "blue", quoted: "teal", approved: "green", too_high: "amber", too_low: "amber", cancelled: "gray",
};

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export const EQUIPMENT = [
  "open_car", "enclosed_car", "dry_van", "reefer", "flatbed", "ltl", "heavy_haul", "drayage", "air", "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  open_car: "Car haul (open)", enclosed_car: "Car haul (enclosed)", dry_van: "Dry van", reefer: "Reefer",
  flatbed: "Flatbed", ltl: "LTL", heavy_haul: "Heavy haul", drayage: "Drayage", air: "Air charter", other: "Other",
};

export const PAY_TERMS = ["quick_pay", "net_15", "net_30", "other"] as const;
export type PayTerms = (typeof PAY_TERMS)[number];
export const PAY_TERMS_LABEL: Record<PayTerms, string> = {
  quick_pay: "Quick pay (same day)", net_15: "Net 15", net_30: "Net 30", other: "Other",
};

export const CARRIER_STANDING = ["active", "pending", "do_not_use"] as const;
export type CarrierStanding = (typeof CARRIER_STANDING)[number];
export const CARRIER_STANDING_LABEL: Record<CarrierStanding, string> = {
  active: "Active", pending: "Pending vetting", do_not_use: "Do not use",
};

export const TASK_PRIORITY = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];
export const TASK_PRIORITY_TONE: Record<TaskPriority, Tone> = { low: "gray", normal: "blue", high: "amber", urgent: "red" };

export const ROLE_LABEL = { admin: "Admin", sales: "Sales", dispatch: "Dispatch", customer: "Customer" } as const;
export type AppRole = keyof typeof ROLE_LABEL;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
export type Load = {
  id: string; load_number: string; customer_id: string; customer_ref: string | null;
  sales_rep_id: string | null; dispatcher_id: string | null; carrier_id: string | null; equipment: Equipment;
  origin_location_id: string | null; origin_name: string | null; origin_address: string | null; origin_city: string | null;
  origin_state: string | null; origin_zip: string | null; origin_contact: string | null; origin_phone: string | null;
  dest_location_id: string | null; dest_name: string | null; dest_address: string | null; dest_city: string | null;
  dest_state: string | null; dest_zip: string | null; dest_contact: string | null; dest_phone: string | null;
  pickup_date: string | null; pickup_window: string | null; delivery_date: string | null; delivery_window: string | null;
  picked_up_at: string | null; delivered_at: string | null; service_date: string | null;
  commodity: string | null; weight_lbs: number | null; miles: number | null;
  customer_rate: string; carrier_rate: string; quick_pay_pct: string; carrier_pay_terms: PayTerms;
  adjustments: string; adjustments_note: string | null; quick_pay_fee: string; profit: string;
  customer_status: CustomerStatus; carrier_status: CarrierStatus; cancel_reason: string | null;
  competitor_price: string | null; issue_note: string | null; carrier_invoice_number: string | null;
  carrier_paid_at: string | null; special_instructions: string | null; internal_notes: string | null;
  booking_id: string | null; lane_request_id: string | null; created_at: string; updated_at: string;
};

export type LoadVehicle = {
  id: string; load_id: string; position: number; vin: string | null; year: number | null; make: string | null;
  model: string | null; operable: boolean; notes: string | null;
};

export type Carrier = {
  id: string; name: string; mc_number: string | null; dot_number: string | null; email: string | null; phone: string | null;
  contact_name: string | null; standing: CarrierStanding; standing_reason: string | null;
  auto_liability_amount: string | null; cargo_amount: string | null; insurance_expires_on: string | null;
  agreement_signed_on: string | null; lanes: string | null; notes: string | null; created_at: string;
};

export type Invoice = {
  id: string; invoice_number: string; load_id: string; customer_id: string; amount: string; issued_on: string;
  due_on: string; status: "open" | "paid" | "void"; paid_on: string | null; sent_at: string | null; notes: string | null;
  created_at: string;
};

export type QuoteOrder = {
  id: string; reference: string; customer_id: string; requested_by: string | null;
  origin_city: string; origin_state: string; origin_zip: string | null;
  dest_city: string; dest_state: string; dest_zip: string | null; equipment: Equipment; description: string;
  pickup_date: string | null; notes: string | null; status: QuoteOrderStatus; quoted_rate: string | null;
  quote_note: string | null; quoted_by: string | null; quoted_at: string | null; responded_at: string | null;
  response_note: string | null; target_rate: string | null; load_id: string | null; created_by: string | null;
  created_at: string;
};

export type Task = {
  id: string; title: string; body: string | null; customer_id: string | null; load_id: string | null;
  assigned_user_id: string | null; assigned_role: AppRole | null; due_at: string | null; priority: TaskPriority;
  status: "open" | "done" | "cancelled"; source: "manual" | "sequence"; sequence_rule_key: string | null;
  sequence_period: string | null; completed_at: string | null; completed_by: string | null; outcome: string | null;
  created_by: string | null; created_at: string;
};

export type SequenceRule = {
  key: string; name: string; description: string; months: number; min_drop: string; max_drop: string | null;
  min_total_drop: string | null; severity: number; active: boolean; task_priority: TaskPriority; due_days: number;
  task_title: string; task_body: string;
};

export type CustomerLocation = {
  id: string; customer_id: string; name: string; address: string | null; city: string | null; state: string | null;
  zip: string | null; contact_name: string | null; contact_phone: string | null; hours: string | null; notes: string | null;
};

export function place(city: string | null, state: string | null, name?: string | null) {
  const cs = [city, state].filter(Boolean).join(", ");
  return name ? (cs ? `${name} (${cs})` : name) : cs || "—";
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Professional Wheelers' minimums for carriers.
const MIN_AUTO = 1_000_000;
const MIN_CARGO = 100_000;

export function carrierWarnings(c: Carrier, today = new Date().toISOString().slice(0, 10)) {
  const w: string[] = [];
  if (!c.insurance_expires_on) w.push("No insurance on file");
  else if (c.insurance_expires_on < today) w.push("Insurance expired");
  if (c.auto_liability_amount !== null && Number(c.auto_liability_amount) < MIN_AUTO) w.push("Auto liability under $1M");
  if (c.cargo_amount !== null && Number(c.cargo_amount) < MIN_CARGO) w.push("Cargo under $100K");
  if (!c.agreement_signed_on) w.push("No signed agreement");
  return w;
}


/** Shown on invoices and the customer portal. */
export const COMPANY = {
  name: "Professional Wheelers LLC",
  cityState: "Sandy, UT",
  mc: "1549297",
  dot: "4075532",
} as const;

/** A load as the customer portal sees it (portal_loads): no carrier pay or profit. */
export type PortalLoad = {
  id: string; load_number: string; customer_ref: string | null; equipment: Equipment;
  origin_name: string | null; origin_city: string | null; origin_state: string | null;
  dest_name: string | null; dest_city: string | null; dest_state: string | null;
  pickup_date: string | null; delivery_date: string | null; picked_up_at: string | null; delivered_at: string | null;
  customer_status: CustomerStatus; customer_rate: string;
  vehicles: Array<{ vin: string | null; year: number | null; make: string | null; model: string | null }>;
  created_at: string;
};
