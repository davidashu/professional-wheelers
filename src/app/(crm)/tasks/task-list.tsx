import Link from "next/link";
import { displayName } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { ROLE_LABEL, type Task } from "@/lib/tms";
import type { Profile } from "@/lib/types";
import { Badge, EmptyState } from "@/components/ui";
import { PriorityBadge } from "@/components/tms-status";
import { TaskActions } from "./task-forms";

export type TaskRow = Task & {
  customers?: { name: string; company: string | null } | null;
  loads?: { load_number: string } | null;
};

export function TaskList({ tasks, team, me, myRole, showContext = true, empty = "No tasks" }: {
  tasks: TaskRow[]; team: Map<string, Profile>; me: string; myRole: string; showContext?: boolean; empty?: string;
}) {
  if (tasks.length === 0) return <EmptyState title={empty} />;
  const now = new Date();
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => {
        const overdue = t.status === "open" && t.due_at && new Date(t.due_at) < now;
        const assignee = t.assigned_user_id
          ? displayName(team.get(t.assigned_user_id))
          : `${ROLE_LABEL[t.assigned_role ?? "admin"]} (anyone)`;
        return (
          <li key={t.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className={t.status === "open" ? "font-medium text-slate-900" : "font-medium text-slate-500 line-through"}>{t.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <PriorityBadge priority={t.priority} />
                  {t.source === "sequence" && <Badge tone="violet">Profit alert</Badge>}
                  <span>For {assignee}</span>
                  {t.due_at && (
                    <span className={overdue ? "font-semibold text-red-700" : undefined}>
                      Due {formatDate(t.due_at)}{t.status === "open" ? ` (${relativeTime(t.due_at, now)})` : ""}
                    </span>
                  )}
                  {showContext && t.customers && t.customer_id && (
                    <Link href={`/customers/${t.customer_id}`} className="hover:underline">{t.customers.company || t.customers.name}</Link>
                  )}
                  {showContext && t.loads && t.load_id && (
                    <Link href={`/loads/${t.load_id}`} className="font-mono hover:underline">{t.loads.load_number}</Link>
                  )}
                </div>
                {t.body && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{t.body}</p>}
                {t.outcome && <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-sm text-slate-700"><span className="font-semibold">Outcome:</span> {t.outcome}</p>}
              </div>
              <TaskActions
                taskId={t.id}
                customerId={t.customer_id}
                loadId={t.load_id}
                isOpen={t.status === "open"}
                canClaim={t.status === "open" && !t.assigned_user_id && (t.assigned_role === myRole || myRole === "admin")}
                needsOutcome={t.source === "sequence"}
              />
            </div>
            {t.assigned_user_id === me && t.status === "open" && <span className="sr-only">Assigned to you</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function assigneeOptions(team: Profile[]) {
  return [
    { value: "role:sales", label: "Sales" },
    { value: "role:dispatch", label: "Dispatch" },
    { value: "role:admin", label: "Admin" },
    ...team.filter((p) => p.active && p.role !== "customer").map((p) => ({ value: `user:${p.id}`, label: `${displayName(p)} (${ROLE_LABEL[p.role]})` })),
  ];
}
