export type StockStatus = "ok" | "low" | "out";

/** Out of stock at 0, low at or below the minimum level, otherwise sufficient. */
export function getStockStatus(currentStock: number, minimumLevel: number): StockStatus {
  if (currentStock <= 0) return "out";
  if (currentStock <= minimumLevel) return "low";
  return "ok";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  ok: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

export type DiscrepancyStatus = "balanced" | "surplus" | "shortage";

/** Discrepancy = physical count − recorded stock. */
export function computeDiscrepancy(recorded: number, physical: number) {
  const value = physical - recorded;
  const status: DiscrepancyStatus = value === 0 ? "balanced" : value > 0 ? "surplus" : "shortage";
  return { value, status };
}

export const DISCREPANCY_LABEL: Record<DiscrepancyStatus, string> = {
  balanced: "Balanced",
  surplus: "Surplus",
  shortage: "Shortage",
};

export function formatMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-KE");
}

export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
