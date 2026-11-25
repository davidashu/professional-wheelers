import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { must } from "@/lib/data";
import { relativeTime } from "@/lib/format";
import type { Customer } from "@/lib/types";
import { Card, EmptyState, PageHeader, buttonClass, inputClass, tableClass, tdClass, thClass } from "@/components/ui";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireStaff();
  const { q: raw } = await searchParams;
  // Strip characters that have meaning in PostgREST filter syntax.
  const q = (raw ?? "").replace(/[,()*%\\:"]/g, " ").trim().slice(0, 80);
  let query = supabase.from("customers").select("*").order("updated_at", { ascending: false }).limit(100);
  if (q) query = query.or(`name.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q}*,company.ilike.*${q}*`);
  const customers = must(await query, "customers") as Customer[];

  const ids = customers.map((c) => c.id);
  const leadsRes = ids.length ? await supabase.from("leads").select("customer_id, status, created_at").in("customer_id", ids) : { data: [], error: null };
  const stats = new Map<string, { shipments: number; booked: number; last: string }>();
  for (const l of must(leadsRes, "shipments") as Array<{ customer_id: string; status: string; created_at: string }>) {
    const s = stats.get(l.customer_id) ?? { shipments: 0, booked: 0, last: l.created_at };
    s.shipments += 1;
    if (l.status === "booked") s.booked += 1;
    if (l.created_at > s.last) s.last = l.created_at;
    stats.set(l.customer_id, s);
  }

  return (
    <div>
      <PageHeader title="Customers" description="One record per customer, with every shipment they've requested." />
      <form className="mb-4 flex gap-3" role="search">
        <label htmlFor="q" className="sr-only">Search customers</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name, email, phone or company…" className={`${inputClass} max-w-md`} />
        <button className={buttonClass("secondary")}>Search</button>
      </form>
      <Card>
        {customers.length === 0 ? (
          <EmptyState title={q ? "No customers match" : "No customers yet"} body={q ? "Try another name, email or phone number." : "Customers are created from quote requests and phone leads."} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-slate-50"><tr><th className={thClass}>Customer</th><th className={thClass}>Contact</th><th className={thClass}>Shipments</th><th className={thClass}>Last request</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => {
                  const s = stats.get(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className={tdClass}><Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.name}</Link>{c.company && <div className="text-xs text-slate-500">{c.company}</div>}</td>
                      <td className={tdClass}>{c.email ?? "—"}<div className="text-xs text-slate-500">{c.phone ?? ""}</div></td>
                      <td className={tdClass}>{s?.shipments ?? 0}{s && s.booked > 0 && <span className="text-xs text-emerald-700"> · {s.booked} booked</span>}</td>
                      <td className={tdClass}>{s ? relativeTime(s.last) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
