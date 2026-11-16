import { Badge } from "@/components/ui/badge";
import { getStockStatus, STOCK_STATUS_LABEL } from "@/lib/stock";

export function StockBadge({ current, minimum }: { current: number; minimum: number }) {
  const status = getStockStatus(current, minimum);
  const variant = status === "ok" ? "success" : status === "low" ? "warning" : "danger";
  return <Badge variant={variant}>{STOCK_STATUS_LABEL[status]}</Badge>;
}
