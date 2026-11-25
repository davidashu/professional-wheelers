import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { must } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import type { SequenceRule } from "@/lib/tms";
import { Badge, Card, CardHeader, EmptyState, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { RuleForm, RunNowForm } from "./forms";

export const metadata: Metadata = { title: "Sequences" };

type Run = { id: number; evaluated_month: string; customers_checked: number; tasks_created: number; created_at: string; run_by: string | null };

export default async function SequencesPage() {
  const { supabase } = await requireAdmin();
  const [rulesRes, runsRes] = await Promise.all([
    supabase.from("sequence_rules").select("*").order("severity"),
    supabase.from("sequence_runs").select("id, evaluated_month, customers_checked, tasks_created, created_at, run_by").order("created_at", { ascending: false }).limit(12),
  ]);
  const rules = must(rulesRes, "sequence rules") as SequenceRule[];
  const runs = must(runsRes, "sequence runs") as Run[];

  return (
    <div>
      <PageHeader
        title="Profit-drop sequences"
        description="On the 1st of each month every customer's gross profit is compared month over month. When a rule matches, the customer's sales rep gets a call task (or the Admin position if there's no rep). One task per customer per month, from the most serious rule."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {rules.map((r, i) => (
            <Card key={r.key}>
              <CardHeader
                title={<span>{i + 1}. {r.name} {!r.active && <Badge tone="gray">Off</Badge>}</span>}
                description={r.description}
              />
              <div className="p-4"><RuleForm rule={r} /></div>
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Run now" description="Checks the last complete month before the date (today if blank). Safe to repeat: a customer never gets two tasks for the same month." />
            <div className="p-4"><RunNowForm /></div>
          </Card>
          <Card>
            <CardHeader title="Recent runs" />
            {runs.length === 0 ? <EmptyState title="No runs yet" /> : (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead className="bg-slate-50"><tr><th className={thClass}>Month</th><th className={thClass}>Checked</th><th className={thClass}>Tasks</th><th className={thClass}>When</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td className={tdClass}>{formatDate(r.evaluated_month, { month: "short", year: "numeric", day: undefined })}</td>
                        <td className={tdClass}>{r.customers_checked}</td>
                        <td className={tdClass}>{r.tasks_created}</td>
                        <td className={tdClass}>{formatDateTime(r.created_at)}{r.run_by ? "" : " (auto)"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
