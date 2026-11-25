import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings, getTeam } from "@/lib/data";
import { serverEnv } from "@/lib/env";
import { Badge, Card, CardHeader, PageHeader, tableClass, tdClass, thClass } from "@/components/ui";
import { AddTeammateForm, SettingsForm, TeamMemberForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireAdmin();
  const [settings, team] = await Promise.all([getSettings(supabase), getTeam(supabase)]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" description="Admin only. Quote defaults, team access and integrations." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Quote defaults" />
          <div className="p-4"><SettingsForm settings={settings} /></div>
        </Card>
        <Card>
          <CardHeader title="Integrations" />
          <div className="space-y-3 p-4 text-sm">
            <p className="flex items-center justify-between">Quote emails (Resend) {serverEnv.emailConfigured ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured</Badge>}</p>
            <p className="flex items-center justify-between">Delivery status webhook {serverEnv.resendWebhookSecret ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured</Badge>}</p>
            <p className="text-xs text-slate-500">
              Set RESEND_API_KEY and EMAIL_FROM to email quotes. Set RESEND_WEBHOOK_SECRET and point a Resend webhook at
              {" "}<code className="rounded bg-slate-100 px-1">{serverEnv.siteUrl}/api/webhooks/resend</code> to record delivered/bounced status.
              Without email, staff copy the quote link and send it themselves.
            </p>
          </div>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Team" description="Admins manage team and settings. Sales reps work their own customers, leads, quotes and loads. Dispatch works the loads assigned to them in the TMS." />
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead className="bg-slate-50"><tr><th className={thClass}>Name</th><th className={thClass}>Email</th><th className={thClass}>Role and access</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((m) => (
                <tr key={m.id}>
                  <td className={tdClass}>{m.full_name || "—"}</td>
                  <td className={tdClass}>{m.email}</td>
                  <td className={tdClass}>{m.id === user.id ? <span className="text-sm capitalize text-slate-600">{m.role} (you)</span> : <TeamMemberForm member={m} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 p-4"><AddTeammateForm /></div>
      </Card>
    </div>
  );
}
