/** Quote math, shared by the quote builder UI and the server. Amounts in dollars. */
export type QuoteAmounts = { carrierPay: number; brokerFee: number };

export function toCents(n: number): number {
  return Math.round(n * 100);
}

export function quoteTotals({ carrierPay, brokerFee }: QuoteAmounts) {
  const carrier = toCents(carrierPay);
  const fee = toCents(brokerFee);
  const total = carrier + fee;
  return {
    total: total / 100,
    grossProfit: fee / 100,
    marginPercent: total > 0 ? Math.round((fee / total) * 1000) / 10 : 0,
  };
}

export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}
