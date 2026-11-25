export type LeadStatus = "new" | "contacted" | "pricing" | "quote_sent" | "booked" | "lost";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "superseded" | "withdrawn";
export type ShipmentStatus = "awaiting_carrier" | "carrier_assigned" | "picked_up" | "delivered";
export type LeadSource = "web_form" | "phone" | "email" | "referral" | "repeat_customer" | "other";
export type EmailStatus = "pending" | "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed";

export const PIPELINE: LeadStatus[] = ["new", "contacted", "pricing", "quote_sent", "booked"];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New Request",
  contacted: "Contacted",
  pricing: "Pricing",
  quote_sent: "Quote Sent",
  booked: "Booked",
  lost: "Lost",
};

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  awaiting_carrier: "Awaiting Carrier",
  carrier_assigned: "Carrier Assigned",
  picked_up: "Picked Up",
  delivered: "Delivered",
};
export const SHIPMENT_ORDER: ShipmentStatus[] = ["awaiting_carrier", "carrier_assigned", "picked_up", "delivered"];

export const SOURCE_LABEL: Record<LeadSource, string> = {
  web_form: "Website form",
  phone: "Phone",
  email: "Email",
  referral: "Referral",
  repeat_customer: "Repeat customer",
  other: "Other",
};

export type QuoteDisplayState = QuoteStatus | "expired";
export const QUOTE_STATE_LABEL: Record<QuoteDisplayState, string> = {
  draft: "Draft",
  sent: "Awaiting reply",
  expired: "Expired",
  accepted: "Accepted",
  declined: "Declined",
  superseded: "Replaced",
  withdrawn: "Withdrawn",
};

export function quoteDisplayState(q: { status: QuoteStatus; expires_at: string }, now = Date.now()): QuoteDisplayState {
  if (q.status === "sent" && new Date(q.expires_at).getTime() <= now) return "expired";
  return q.status;
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  pending: "Sending",
  sent: "Accepted by provider",
  delivered: "Delivered",
  delayed: "Delayed",
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed",
};
