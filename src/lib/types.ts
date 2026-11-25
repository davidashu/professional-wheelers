import type { EmailStatus, LeadSource, LeadStatus, QuoteStatus, ShipmentStatus } from "./labels";

export type Profile = { id: string; email: string; full_name: string; role: "admin" | "sales"; active: boolean };

export type Customer = {
  id: string; name: string; email: string | null; phone: string | null; company: string | null;
  notes: string | null; created_at: string; updated_at: string;
};

export type Lead = {
  id: string; reference: string; customer_id: string; status: LeadStatus; source: LeadSource;
  assigned_to: string | null; contact_name: string; contact_email: string | null; contact_phone: string | null;
  contact_company: string | null; pickup_city: string; pickup_state: string; pickup_zip: string;
  delivery_city: string; delivery_state: string; delivery_zip: string; earliest_pickup_date: string;
  pickup_date_flexible: boolean; transport_type: "open" | "enclosed"; special_instructions: string | null;
  lost_reason: string | null; lost_at: string | null; created_at: string; updated_at: string;
};

export type Vehicle = {
  id: string; lead_id: string; position: number; year: number; make: string; model: string; operable: boolean;
};

export type Quote = {
  id: string; lead_id: string; version: number; status: QuoteStatus; carrier_pay: string; broker_fee: string;
  total: string; pickup_window_start: string; pickup_window_end: string; terms: string; internal_note: string | null;
  expires_at: string; link_id: string | null; token_hash: string | null; sent_at: string | null; sent_by: string | null;
  first_viewed_at: string | null; responded_at: string | null; decline_reason: string | null; created_at: string;
};

export type Booking = {
  id: string; reference: string; lead_id: string; quote_id: string; customer_id: string; status: ShipmentStatus;
  snapshot: BookingSnapshot; total_price: string;
  pickup_address: string | null; pickup_contact_name: string | null; pickup_contact_phone: string | null;
  delivery_address: string | null; delivery_contact_name: string | null; delivery_contact_phone: string | null;
  carrier_name: string | null; carrier_phone: string | null; carrier_assigned_at: string | null;
  picked_up_at: string | null; delivered_at: string | null; notes: string | null; created_at: string; updated_at: string;
  customer_details_submitted_at: string | null; agreement_text: string | null; agreement_signed_name: string | null;
  agreement_signed_at: string | null;
};

export type Place = { city: string; state: string; zip: string };
export type SnapshotVehicle = { year: number; make: string; model: string; operable: boolean };
export type BookingSnapshot = {
  reference: string; customer_name: string; pickup: Place; delivery: Place; transport_type: "open" | "enclosed";
  vehicles: SnapshotVehicle[]; quote_version: number; total: number; pickup_window_start: string;
  pickup_window_end: string; terms: string; accepted_at: string;
  contact: { name: string; email: string | null; phone: string | null; company: string | null };
};

export type FollowUp = {
  id: string; lead_id: string; assigned_to: string; due_at: string; note: string | null;
  completed_at: string | null; completed_by: string | null; created_at: string;
};

export type Note = { id: string; lead_id: string; author_id: string | null; body: string; created_at: string };

export type Activity = {
  id: number; lead_id: string | null; booking_id: string | null; quote_id: string | null; actor_id: string | null;
  actor_type: "staff" | "customer" | "system"; kind: string; message: string; metadata: Record<string, unknown>; created_at: string;
};

export type EmailDelivery = {
  id: string; quote_id: string | null; lead_id: string; to_email: string; subject: string;
  provider_message_id: string | null; status: EmailStatus; error: string | null; created_at: string; updated_at: string;
};

export type Settings = { company_name: string; default_quote_terms: string; quote_validity_days: number; booking_agreement_text: string };

export type PublicQuote = {
  state: "active" | "expired" | "accepted" | "declined" | "superseded" | "withdrawn";
  company_name: string; reference: string; version?: number; customer_name?: string;
  pickup?: Place; delivery?: Place; transport_type?: "open" | "enclosed"; vehicles?: SnapshotVehicle[];
  pickup_window_start?: string; pickup_window_end?: string; total?: number; terms?: string;
  expires_at?: string; sent_at?: string; responded_at?: string | null; booking_reference?: string | null;
  booking?: PublicBooking | null;
};

export type PublicBooking = {
  reference: string; details_submitted: boolean; submitted_at: string | null; agreement_text: string;
  signed_name: string | null; signed_at: string | null;
  pickup_address: string | null; pickup_contact_name: string | null; pickup_contact_phone: string | null;
  delivery_address: string | null; delivery_contact_name: string | null; delivery_contact_phone: string | null;
};

export type PortalShipment = {
  reference: string; created_at: string; status: LeadStatus; pickup: Place; delivery: Place;
  earliest_pickup_date: string; pickup_date_flexible: boolean; transport_type: "open" | "enclosed";
  vehicles: SnapshotVehicle[];
  quote: {
    version: number; state: "active" | "expired" | "accepted" | "declined"; total: number;
    pickup_window_start: string; pickup_window_end: string; expires_at: string; sent_at: string;
    responded_at: string | null; url: string | null;
  } | null;
  booking: {
    reference: string; status: ShipmentStatus; total_price: string; carrier_assigned_at: string | null;
    picked_up_at: string | null; delivered_at: string | null; details_submitted: boolean;
    signed_name: string | null; signed_at: string | null; pickup_address: string | null; delivery_address: string | null;
  } | null;
};

export type PortalOverview = {
  company_name: string;
  customer: { name: string; email: string | null; phone: string | null; company: string | null };
  unread_messages: number;
  shipments: PortalShipment[];
};

export type PortalMessage = {
  id: string; body: string; from: "customer" | "staff"; staff_name: string | null; reference: string | null;
  created_at: string; read_at: string | null;
};

export type Message = {
  id: string; customer_id: string; lead_id: string | null; sender_type: "customer" | "staff"; sender_id: string | null;
  body: string; created_at: string; read_at: string | null; email_status: "sent" | "failed" | "not_configured" | null;
  email_error: string | null;
};
