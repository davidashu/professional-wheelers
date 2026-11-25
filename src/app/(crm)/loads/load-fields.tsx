import { EQUIPMENT, EQUIPMENT_LABEL, type Load } from "@/lib/tms";
import { Label, inputClass } from "@/components/ui";

function F({ name, label, defaultValue, type = "text", placeholder, className }: {
  name: string; label: string; defaultValue?: string | number | null; type?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={name}>{label}</Label>
      <input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={inputClass} />
    </div>
  );
}

function Stop({ prefix, title, load }: { prefix: "origin" | "dest"; title: string; load?: Partial<Load> }) {
  const v = (k: string) => (load as Record<string, string | null> | undefined)?.[`${prefix}_${k}`] ?? "";
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-6">
        <F name={`${prefix}_name`} label="Name (store, auction, home)" defaultValue={v("name")} className="sm:col-span-3" />
        <F name={`${prefix}_address`} label="Street address" defaultValue={v("address")} className="sm:col-span-3" />
        <F name={`${prefix}_city`} label="City" defaultValue={v("city")} className="sm:col-span-3" />
        <F name={`${prefix}_state`} label="State" defaultValue={v("state")} placeholder="UT" className="sm:col-span-1" />
        <F name={`${prefix}_zip`} label="ZIP" defaultValue={v("zip")} className="sm:col-span-2" />
        <F name={`${prefix}_contact`} label="Contact" defaultValue={v("contact")} className="sm:col-span-3" />
        <F name={`${prefix}_phone`} label="Phone" defaultValue={v("phone")} type="tel" className="sm:col-span-3" />
      </div>
    </fieldset>
  );
}

export function LoadFields({ load }: { load?: Partial<Load> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="equipment">Equipment</Label>
          <select id="equipment" name="equipment" defaultValue={load?.equipment ?? "open_car"} className={inputClass}>
            {EQUIPMENT.map((e) => <option key={e} value={e}>{EQUIPMENT_LABEL[e]}</option>)}
          </select>
        </div>
        <F name="customer_ref" label="Customer PO / load #" defaultValue={load?.customer_ref} />
        <F name="commodity" label="Commodity" defaultValue={load?.commodity} placeholder="Vehicles, steel coils…" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Stop prefix="origin" title="Pickup" load={load} />
        <Stop prefix="dest" title="Delivery" load={load} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <F name="pickup_date" label="Pickup date" type="date" defaultValue={load?.pickup_date} />
        <F name="pickup_window" label="Pickup hours" defaultValue={load?.pickup_window} placeholder="M–F 9am–2pm" />
        <F name="delivery_date" label="Delivery date" type="date" defaultValue={load?.delivery_date} />
        <F name="delivery_window" label="Receiving hours" defaultValue={load?.delivery_window} />
        <F name="miles" label="Miles" defaultValue={load?.miles} />
        <F name="weight_lbs" label="Weight (lbs)" defaultValue={load?.weight_lbs} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <Label htmlFor="special_instructions">Instructions for carrier</Label>
          <textarea id="special_instructions" name="special_instructions" rows={3} defaultValue={load?.special_instructions ?? ""} className={inputClass} placeholder="Odometer photo at pickup, use third entrance…" />
        </div>
        <div>
          <Label htmlFor="internal_notes">Internal notes</Label>
          <textarea id="internal_notes" name="internal_notes" rows={3} defaultValue={load?.internal_notes ?? ""} className={inputClass} />
        </div>
      </div>
    </div>
  );
}
