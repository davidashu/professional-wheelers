import { Badge, type Tone } from "./ui";
import {
  EMAIL_STATUS_LABEL, LEAD_STATUS_LABEL, QUOTE_STATE_LABEL, SHIPMENT_LABEL,
  type EmailStatus, type LeadStatus, type QuoteDisplayState, type ShipmentStatus,
} from "@/lib/labels";

const leadTone: Record<LeadStatus, Tone> = {
  new: "blue", contacted: "violet", pricing: "amber", quote_sent: "teal", booked: "green", lost: "gray",
};
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={leadTone[status]}>{LEAD_STATUS_LABEL[status]}</Badge>;
}

const quoteTone: Record<QuoteDisplayState, Tone> = {
  draft: "gray", sent: "teal", expired: "amber", accepted: "green", declined: "red", superseded: "gray", withdrawn: "gray",
};
export function QuoteStatusBadge({ state }: { state: QuoteDisplayState }) {
  return <Badge tone={quoteTone[state]}>{QUOTE_STATE_LABEL[state]}</Badge>;
}

const shipTone: Record<ShipmentStatus, Tone> = {
  awaiting_carrier: "amber", carrier_assigned: "blue", picked_up: "violet", delivered: "green",
};
export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge tone={shipTone[status]}>{SHIPMENT_LABEL[status]}</Badge>;
}

const emailTone: Record<EmailStatus, Tone> = {
  pending: "gray", sent: "blue", delivered: "green", delayed: "amber", bounced: "red", complained: "red", failed: "red",
};
export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge tone={emailTone[status]}>{EMAIL_STATUS_LABEL[status]}</Badge>;
}
