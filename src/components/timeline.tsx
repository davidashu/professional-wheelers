import { displayName } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { Activity, Profile } from "@/lib/types";
import { EmptyState } from "./ui";

const dot: Record<string, string> = {
  customer: "bg-blue-500",
  staff: "bg-slate-400",
  system: "bg-amber-500",
};

export function Timeline({ activities, people }: { activities: Activity[]; people: Map<string, Profile> }) {
  if (activities.length === 0) return <EmptyState title="No activity yet" />;
  return (
    <ol className="relative space-y-4 p-4" data-testid="timeline">
      {activities.map((a) => {
        const who = a.actor_type === "customer" ? "Customer" : a.actor_type === "system" ? "System" : displayName(people.get(a.actor_id ?? ""));
        const excerpt = typeof a.metadata?.excerpt === "string" ? a.metadata.excerpt : null;
        return (
          <li key={a.id} className="flex gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot[a.actor_type] ?? "bg-slate-400"}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-slate-900">{a.message}</p>
              {excerpt && <p className="mt-0.5 truncate text-xs italic text-slate-500">“{excerpt}”</p>}
              <p className="text-xs text-slate-500">{who} · {formatDateTime(a.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
