import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/lib/auth";
import { getTeam, must, teamMap } from "@/lib/data";
import { Card, CardHeader, PageHeader, cx } from "@/components/ui";
import { NewTaskForm } from "./task-forms";
import { TaskList, assigneeOptions, type TaskRow } from "./task-list";

export const metadata: Metadata = { title: "Tasks" };

const VIEWS = { mine: "Mine", position: "My position", all: "Everything I can see", done: "Completed" } as const;
type View = keyof typeof VIEWS;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase, profile } = await requireInternal();
  const { view: raw } = await searchParams;
  const view: View = raw && raw in VIEWS ? (raw as View) : "mine";

  let q = supabase
    .from("tasks")
    .select("*, customers(name, company), loads(load_number)")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (view === "done") q = q.neq("status", "open").order("completed_at", { ascending: false });
  else q = q.eq("status", "open");
  if (view === "mine") q = q.eq("assigned_user_id", profile.id);
  if (view === "position") q = q.is("assigned_user_id", null).eq("assigned_role", profile.role);

  const [tasksRes, team] = await Promise.all([q, getTeam(supabase)]);
  const tasks = must(tasksRes, "tasks") as TaskRow[];

  return (
    <div>
      <PageHeader title="Tasks" description="Every task across customers and loads. Tasks for a whole position can be taken by anyone in it." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Task views">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={`/tasks?view=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
              v === view ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
            )}
          >
            {VIEWS[v]}
          </Link>
        ))}
      </nav>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`${VIEWS[view]} · ${tasks.length}`} />
          <TaskList tasks={tasks} team={teamMap(team)} me={profile.id} myRole={profile.role} empty="Nothing here." />
        </Card>
        <Card>
          <CardHeader title="New task" />
          <div className="p-4"><NewTaskForm assignees={assigneeOptions(team)} defaultAssignee={`user:${profile.id}`} /></div>
        </Card>
      </div>
    </div>
  );
}
