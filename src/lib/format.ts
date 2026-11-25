export const money = (n: number | string | null | undefined) =>
  n == null || n === ""
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));

const TZ = "America/Los_Angeles";

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return "—";
  // Plain dates (YYYY-MM-DD) are calendar dates: don't shift them by time zone.
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC", ...opts }).format(
      new Date(Date.UTC(y!, m! - 1, day!)),
    );
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ, ...opts }).format(
    new Date(d),
  );
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ, timeZoneName: "short",
  }).format(new Date(d));
}

export function relativeTime(d: string | Date, now = new Date()) {
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const mins = Math.round(diff / 60000);
  if (abs < 3600000) return rtf.format(mins, "minute");
  const hours = Math.round(diff / 3600000);
  if (abs < 86400000) return rtf.format(hours, "hour");
  return rtf.format(Math.round(diff / 86400000), "day");
}

export const route = (a: { city: string; state: string }, b: { city: string; state: string }) =>
  `${a.city}, ${a.state} → ${b.city}, ${b.state}`;

export function pickupWindow(start: string | null, end: string | null) {
  if (!start) return "—";
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start, { year: undefined })} – ${formatDate(end)}`;
}

/** Value for <input type="date"> in business time. */
export function dateInputValue(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/** Request-time clock for Server Components (each request renders once). */
export function requestNow(): number {
  return Date.now();
}
