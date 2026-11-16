import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AlertWithMedicine, Medicine, Transaction } from "@/lib/queries";
import { formatDateTime, formatMoney, getStockStatus, type StockStatus } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { EmptyState } from "./Panel";
import { StockBadge } from "./StockBadge";

export function TxnTypeBadge({ type }: { type: Transaction["transaction_type"] }) {
  if (type === "IN") return <Badge variant="success">Stock in</Badge>;
  if (type === "OUT") return <Badge variant="secondary">Stock out</Badge>;
  return <Badge variant="warning">Adjustment</Badge>;
}

export function InventoryTable({
  medicines,
  actions,
  showPrice = true,
}: {
  medicines: Medicine[];
  actions?: (m: Medicine) => ReactNode;
  showPrice?: boolean;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | StockStatus>("all");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => Array.from(new Set(medicines.map((m) => m.category))).sort(), [medicines]);

  const rows = medicines.filter((m) => {
    const term = q.trim().toLowerCase();
    if (term && ![m.name, m.generic_name ?? "", m.category].some((v) => v.toLowerCase().includes(term))) return false;
    if (category !== "all" && m.category !== category) return false;
    if (status !== "all" && getStockStatus(m.current_stock, m.minimum_level) !== status) return false;
    return true;
  });

  return (
    <div>
      <div className="no-print mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, generic name or category"
            className="pl-9"
            aria-label="Search medicines"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-44" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="sm:w-40" aria-label="Stock status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ok">In stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Medicine</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead className="text-right">Minimum</TableHead>
              {showPrice && <TableHead className="text-right">Unit price</TableHead>}
              <TableHead>Status</TableHead>
              {actions && <TableHead className="no-print text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id} className={cn(!m.is_active && "opacity-60")}>
                <TableCell>
                  <div className="font-medium">{m.name}</div>
                  {m.generic_name && <div className="text-xs text-muted-foreground">{m.generic_name}</div>}
                </TableCell>
                <TableCell className="text-muted-foreground">{m.category}</TableCell>
                <TableCell className="text-right font-mono tabular">
                  {m.current_stock} <span className="text-xs text-muted-foreground">{m.unit}</span>
                </TableCell>
                <TableCell className="text-right font-mono tabular text-muted-foreground">{m.minimum_level}</TableCell>
                {showPrice && <TableCell className="text-right font-mono tabular">{formatMoney(m.unit_price)}</TableCell>}
                <TableCell>
                  {m.is_active ? (
                    <StockBadge current={m.current_stock} minimum={m.minimum_level} />
                  ) : (
                    <Badge variant="muted">Archived</Badge>
                  )}
                </TableCell>
                {actions && <TableCell className="no-print text-right">{actions(m)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <EmptyState>No medicines match your filters.</EmptyState>}
      </div>
    </div>
  );
}

export function TransactionFeed({
  transactions,
  empty = "No transactions yet.",
  onReceipt,
}: {
  transactions: Transaction[];
  empty?: string;
  onReceipt?: (receiptNo: string) => void;
}) {
  if (transactions.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="divide-y">
      {transactions.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5">
          <TxnTypeBadge type={t.transaction_type} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{t.medicine?.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {t.user_name} · {formatDateTime(t.created_at)}
              {t.receipt_no && onReceipt && (
                <>
                  {" · "}
                  <button className="font-mono text-primary hover:underline" onClick={() => onReceipt(t.receipt_no!)}>
                    {t.receipt_no}
                  </button>
                </>
              )}
            </div>
          </div>
          <div
            className={cn(
              "font-mono text-sm font-semibold tabular",
              t.transaction_type === "IN" && "text-success",
              t.transaction_type === "OUT" && "text-foreground",
              t.transaction_type === "ADJUST" && "text-warning-foreground",
            )}
          >
            {t.transaction_type === "IN" ? "+" : t.transaction_type === "OUT" ? "−" : t.quantity > 0 ? "+" : ""}
            {t.transaction_type === "OUT" ? t.quantity : t.quantity}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AlertFeed({ alerts, empty = "No active alerts. Stock levels look healthy." }: { alerts: AlertWithMedicine[]; empty?: string }) {
  if (alerts.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={cn(
            "rounded-lg border-l-4 px-3 py-2",
            a.alert_type === "OUT_OF_STOCK" ? "border-l-destructive bg-danger-soft" : "border-l-warning bg-warning-soft",
          )}
        >
          <div className="text-sm font-medium text-foreground">{a.medicine?.name}</div>
          <div className="text-xs text-muted-foreground">{a.message}</div>
        </li>
      ))}
    </ul>
  );
}
