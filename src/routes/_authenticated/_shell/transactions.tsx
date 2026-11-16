import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel, EmptyState } from "@/components/app/Panel";
import { ReceiptDialog } from "@/components/app/Receipt";
import { TxnTypeBadge } from "@/components/app/StockTables";
import { meQuery, transactionsQuery, type Transaction } from "@/lib/queries";
import { formatDateTime, formatMoney } from "@/lib/stock";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/_shell/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — PharmaStock" },
      { name: "description", content: "History of every stock-in, stock-out and audit adjustment." },
      { property: "og:title", content: "Transactions — PharmaStock" },
      { property: "og:description", content: "History of every stock-in, stock-out and audit adjustment." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const [type, setType] = useState<"all" | Transaction["transaction_type"]>("all");
  const [mine, setMine] = useState(me?.role === "pharmacist");
  const [q, setQ] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const { data = [], isPending } = useQuery(
    transactionsQuery({ type: type === "all" ? undefined : type, userId: mine ? me?.userId : undefined, limit: 500 }),
  );

  const term = q.trim().toLowerCase();
  const rows = term
    ? data.filter((t) =>
        [t.medicine?.name ?? "", t.user_name, t.receipt_no ?? "", t.customer_name ?? "", t.supplier ?? "", t.notes ?? ""].some((v) =>
          v.toLowerCase().includes(term),
        ),
      )
    : data;

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every stock movement, newest first. Records cannot be edited or deleted."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "transactions.csv",
                ["Date", "Type", "Medicine", "Quantity", "Balance after", "Unit price", "Receipt", "Customer", "Supplier", "Recorded by", "Notes"],
                rows.map((t) => [
                  new Date(t.created_at).toISOString(),
                  t.transaction_type,
                  t.medicine?.name ?? "",
                  t.quantity,
                  t.balance_after,
                  t.unit_price,
                  t.receipt_no ?? "",
                  t.customer_name ?? "",
                  t.supplier ?? "",
                  t.user_name,
                  t.notes ?? "",
                ]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <Panel>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search medicine, receipt, customer, staff…" className="pl-9" aria-label="Search transactions" />
          </div>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="sm:w-44" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="IN">Stock in</SelectItem>
              <SelectItem value="OUT">Stock out</SelectItem>
              <SelectItem value="ADJUST">Adjustments</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={mine} onCheckedChange={setMine} /> Only mine
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Medicine</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Recorded by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(t.created_at)}</TableCell>
                  <TableCell><TxnTypeBadge type={t.transaction_type} /></TableCell>
                  <TableCell>
                    <div className="font-medium">{t.medicine?.name}</div>
                    {t.notes && <div className="max-w-xs truncate text-xs text-muted-foreground">{t.notes}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">
                    {t.transaction_type === "OUT" ? "−" : t.quantity > 0 ? "+" : ""}
                    {t.quantity}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular text-muted-foreground">{t.balance_after}</TableCell>
                  <TableCell className="text-xs">
                    {t.receipt_no ? (
                      <button className="font-mono text-primary hover:underline" onClick={() => setReceipt(t.receipt_no)}>
                        {t.receipt_no}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">{t.supplier ?? "—"}</span>
                    )}
                    {t.transaction_type === "OUT" && (
                      <div className="text-muted-foreground">{formatMoney(t.quantity * Number(t.unit_price))}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{t.user_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isPending && rows.length === 0 && <EmptyState>No transactions found.</EmptyState>}
          {isPending && <EmptyState>Loading…</EmptyState>}
        </div>
      </Panel>
      <ReceiptDialog receiptNo={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
