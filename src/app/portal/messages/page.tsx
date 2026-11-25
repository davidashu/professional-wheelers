import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { portalSessionHash, requirePortal } from "@/lib/portal";
import type { PortalMessage } from "@/lib/types";
import { Card } from "@/components/ui";
import { ChatThread, type ChatItem } from "@/components/chat-thread";
import { AutoRefresh } from "@/components/auto-refresh";
import { PortalShell } from "../portal-shell";
import { PortalComposer } from "./composer";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PortalMessagesPage({ searchParams }: { searchParams: Promise<{ about?: string }> }) {
  const { about } = await searchParams;
  const hash = await portalSessionHash();
  if (!hash) redirect("/portal/login");
  // Load (and mark read) first so the unread badge below is already up to date.
  const { data, error } = await createAdminClient().rpc("portal_messages", { p_session_hash: hash, p_mark_read: true });
  if (error) throw new Error("Couldn't load your messages. Please try again.");
  if (!data) redirect("/portal/login");
  const portal = await requirePortal();
  const messages = data as PortalMessage[];
  const items: ChatItem[] = messages.map((m) => ({
    id: m.id,
    mine: m.from === "customer",
    author: m.from === "customer" ? "You" : `${m.staff_name ?? "Our team"} · ${portal.company_name}`,
    body: m.body,
    createdAt: m.created_at,
    reference: m.reference,
    status: m.from === "customer" ? (m.read_at ? "Seen" : "Sent") : null,
  }));
  const references = portal.shipments.map((s) => ({
    reference: s.reference,
    label: `${s.reference} · ${s.pickup.city} → ${s.delivery.city}`,
  }));
  const preselect = references.some((r) => r.reference === about) ? about : "";

  return (
    <PortalShell company={portal.company_name} customerName={portal.customer.name} unread={portal.unread_messages}>
      <AutoRefresh seconds={15} />
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Messages</h1>
        <p className="mt-1 text-sm text-slate-600">Chat with our team about pricing, pickup dates or your shipment. We usually reply within one business day.</p>
      </div>
      <Card className="flex flex-col">
        <ChatThread
          items={items}
          emptyTitle="No messages yet"
          emptyBody="Ask us anything about your quote or shipment. Your message goes straight to our team."
        />
        <div className="border-t border-slate-100 p-4">
          <PortalComposer references={references} preselect={preselect ?? ""} />
        </div>
      </Card>
    </PortalShell>
  );
}
