import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/auth";
import { must } from "@/lib/data";
import type { Message, Profile } from "@/lib/types";
import { ChatThread, type ChatItem } from "./chat-thread";
import { StaffComposer, PortalLinkButton } from "./staff-composer";
import { AutoRefresh } from "./auto-refresh";

/**
 * A customer's conversation for staff (RLS applies). Opening it marks the
 * customer's messages as read. Messages about other shipments of the same
 * customer are shown too, tagged with their reference.
 */
export async function StaffConversation({
  supabase,
  customerId,
  customerEmail,
  leadId,
  people,
  references,
  emailConfigured,
  refresh = true,
}: {
  supabase: SupabaseClient;
  customerId: string;
  customerEmail: string | null;
  leadId?: string | null;
  people: Map<string, Profile>;
  references: Map<string, string>;
  emailConfigured: boolean;
  refresh?: boolean;
}) {
  const res = await supabase
    .from("messages")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(200);
  const messages = (must(res, "messages") as Message[]).reverse();
  if (messages.some((m) => m.sender_type === "customer" && !m.read_at)) {
    await supabase.rpc("mark_customer_messages_read", { p_customer_id: customerId });
  }
  const items: ChatItem[] = messages.map((m) => ({
    id: m.id,
    mine: m.sender_type === "staff",
    author: m.sender_type === "staff" ? displayName(people.get(m.sender_id ?? "")) : "Customer",
    body: m.body,
    createdAt: m.created_at,
    reference: m.lead_id ? references.get(m.lead_id) ?? null : null,
    status:
      m.sender_type === "staff"
        ? [m.read_at ? "Seen by customer" : "Not seen yet", emailStatusText(m.email_status)].filter(Boolean).join(" · ")
        : null,
  }));
  return (
    <div>
      {refresh && <AutoRefresh seconds={20} />}
      <ChatThread
        items={items}
        emptyTitle="No messages yet"
        emptyBody="Messages you send appear in the customer's portal. Customers can write to you from there too."
        className="max-h-[28rem]"
      />
      <div className="space-y-3 border-t border-slate-100 p-4">
        <StaffComposer customerId={customerId} leadId={leadId ?? null} canEmail={emailConfigured && Boolean(customerEmail)} />
        <PortalLinkButton customerId={customerId} />
      </div>
    </div>
  );
}

function emailStatusText(s: Message["email_status"]) {
  if (s === "sent") return "email notice sent";
  if (s === "failed") return "email notice failed";
  return null;
}
