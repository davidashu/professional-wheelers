import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { getTeam, must, teamMap } from "@/lib/data";
import { serverEnv } from "@/lib/env";
import { relativeTime } from "@/lib/format";
import type { Customer, Lead } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, PageHeader, cx } from "@/components/ui";
import { StaffConversation } from "@/components/staff-conversation";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata: Metadata = { title: "Messages" };

type InboxRow = {
  customer_id: string; customer_name: string; customer_email: string | null; last_body: string;
  last_sender_type: "customer" | "staff"; last_at: string; unread: number | string;
};

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer: selectedParam } = await searchParams;
  const { supabase } = await requireStaff();
  const rows = must(await supabase.rpc("message_inbox", { p_limit: 200 }), "inbox") as InboxRow[];
  const selectedId = selectedParam && /^[0-9a-f-]{36}$/.test(selectedParam) ? selectedParam : rows[0]?.customer_id;

  let selected: Customer | null = null;
  let leads: Lead[] = [];
  if (selectedId) {
    selected = must(await supabase.from("customers").select("*").eq("id", selectedId).maybeSingle<Customer>(), "customer");
    if (selected) {
      leads = must(
        await supabase.from("leads").select("*").eq("customer_id", selectedId).order("created_at", { ascending: false }),
        "shipments",
      ) as Lead[];
    }
  }
  const team = await getTeam(supabase);
  const totalUnread = rows.reduce((n, r) => n + Number(r.unread), 0);

  return (
    <div>
      <PageHeader
        title="Messages"
        description={totalUnread > 0 ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"} from customers` : "Conversations with customers from the customer portal."}
      />
      {rows.length === 0 && !selected ? (
        <Card>
          <AutoRefresh seconds={30} />
          <EmptyState
            title="No conversations yet"
            body="When a customer writes from their portal, the conversation shows up here. You can also start one from any lead or customer page."
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Card className="overflow-hidden">
            <CardHeader title="Conversations" />
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto" data-testid="inbox">
              {rows.map((r) => {
                const unread = Number(r.unread);
                const active = r.customer_id === selectedId;
                return (
                  <li key={r.customer_id}>
                    <Link
                      href={`/messages?customer=${r.customer_id}`}
                      aria-current={active ? "true" : undefined}
                      className={cx("block px-4 py-3 hover:bg-slate-50", active && "bg-brand-50")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cx("truncate text-sm", unread ? "font-bold text-slate-900" : "font-medium text-slate-800")}>{r.customer_name}</span>
                        {unread > 0 ? <Badge tone="blue">{unread} new</Badge> : <span className="shrink-0 text-xs text-slate-500">{relativeTime(r.last_at)}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {r.last_sender_type === "staff" ? "You: " : ""}
                        {r.last_body}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          {selected ? (
            <Card>
              <CardHeader
                title={selected.name}
                description={[selected.email, selected.phone].filter(Boolean).join(" · ")}
                action={<Link href={`/customers/${selected.id}`} className="text-sm font-medium text-brand-700 hover:underline">Customer record</Link>}
              />
              {leads.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2 text-xs">
                  <span className="text-slate-500">Shipments:</span>
                  {leads.map((l) => (
                    <Link key={l.id} href={`/leads/${l.id}`} className="font-mono text-brand-700 hover:underline">{l.reference}</Link>
                  ))}
                </div>
              )}
              <StaffConversation
                supabase={supabase}
                customerId={selected.id}
                customerEmail={selected.email}
                leadId={leads.length === 1 ? leads[0]!.id : null}
                people={teamMap(team)}
                references={new Map(leads.map((l) => [l.id, l.reference]))}
                emailConfigured={serverEnv.emailConfigured}
              />
            </Card>
          ) : (
            <Card><EmptyState title="Conversation not found" /></Card>
          )}
        </div>
      )}
    </div>
  );
}
