import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Loader2, Minus, Plus, ReceiptText, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel, EmptyState } from "@/components/app/Panel";
import { ReceiptDialog } from "@/components/app/Receipt";
import { StockBadge } from "@/components/app/StockBadge";
import { TransactionFeed } from "@/components/app/StockTables";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import { medicinesQuery, meQuery, transactionsQuery } from "@/lib/queries";
import { formatMoney } from "@/lib/stock";
import { useInvalidateStock } from "@/lib/use-invalidate";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_shell/stock-out")({
  loader: ({ context }) => context.queryClient.ensureQueryData(medicinesQuery()),
  head: () => ({
    meta: [
      { title: "Record stock out — PharmaStock" },
      { name: "description", content: "Dispense medicines, deduct stock and issue sales receipts." },
      { property: "og:title", content: "Record stock out — PharmaStock" },
      { property: "og:description", content: "Dispense medicines, deduct stock and issue sales receipts." },
    ],
  }),
  component: StockOutPage,
});

type CartLine = { medicineId: string; quantity: number };

function StockOutPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: medicines } = useSuspenseQuery(medicinesQuery());
  const { data: mine } = useSuspenseQuery(transactionsQuery({ type: "OUT", userId: me?.userId, limit: 12 }));
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const invalidate = useInvalidateStock();

  const term = q.trim().toLowerCase();
  const results = term
    ? medicines
        .filter((m) => [m.name, m.generic_name ?? "", m.category].some((v) => v.toLowerCase().includes(term)))
        .slice(0, 8)
    : [];

  const byId = new Map(medicines.map((m) => [m.id, m]));
  const lines = cart.map((l) => ({ ...l, medicine: byId.get(l.medicineId)! })).filter((l) => l.medicine);
  const total = lines.reduce((s, l) => s + l.quantity * Number(l.medicine.unit_price), 0);
  const overLimit = lines.some((l) => l.quantity > l.medicine.current_stock);

  function add(id: string) {
    const m = byId.get(id);
    if (!m) return;
    if (m.current_stock <= 0) {
      toast.error(`${m.name} is out of stock`);
      return;
    }
    setCart((c) => {
      const existing = c.find((l) => l.medicineId === id);
      if (existing) return c.map((l) => (l.medicineId === id ? { ...l, quantity: Math.min(l.quantity + 1, m.current_stock) } : l));
      return [...c, { medicineId: id, quantity: 1 }];
    });
    setQ("");
  }

  function setQty(id: string, qty: number) {
    setCart((c) => c.map((l) => (l.medicineId === id ? { ...l, quantity: Math.max(1, Math.floor(qty) || 1) } : l)));
  }

  const sale = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("record_sale", {
        _items: lines.map((l) => ({ medicine_id: l.medicineId, quantity: l.quantity })),
        _customer_name: customer,
        _notes: notes,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (receiptNo) => {
      toast.success("Sale recorded", { description: `Receipt ${receiptNo}` });
      setCart([]);
      setCustomer("");
      setNotes("");
      setReceipt(receiptNo);
      await invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Record stock out" description="Search a medicine, add it to the sale and complete to deduct stock and issue a receipt." />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Find medicine">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) {
                    e.preventDefault();
                    add(results[0].id);
                  }
                }}
                placeholder="Start typing a name, generic name or category…"
                className="h-11 pl-9"
                aria-label="Search medicines"
                autoFocus
              />
            </div>
            {term && (
              <ul className="mt-3 divide-y rounded-lg border">
                {results.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No match.</li>}
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => add(m.id)}
                      disabled={m.current_stock <= 0}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.category} · {formatMoney(m.unit_price)} / {m.unit}
                        </div>
                      </div>
                      <span className="font-mono text-xs tabular text-muted-foreground">{m.current_stock} left</span>
                      <StockBadge current={m.current_stock} minimum={m.minimum_level} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="My recent sales">
            <TransactionFeed transactions={mine} onReceipt={setReceipt} empty="No sales recorded yet." />
          </Panel>
        </div>

        <Panel title="Current sale" description={`${lines.length} item${lines.length === 1 ? "" : "s"}`} className="h-fit lg:sticky lg:top-6">
          {lines.length === 0 ? (
            <EmptyState>
              <ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Search and add medicines to start a sale.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {lines.map((l) => {
                const over = l.quantity > l.medicine.current_stock;
                return (
                  <li key={l.medicineId} className="py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{l.medicine.name}</div>
                        <div className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
                          {over ? `Only ${l.medicine.current_stock} available` : `${l.medicine.current_stock} ${l.medicine.unit} available`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Remove ${l.medicine.name}`}
                        onClick={() => setCart((c) => c.filter((x) => x.medicineId !== l.medicineId))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Decrease" onClick={() => setQty(l.medicineId, l.quantity - 1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => setQty(l.medicineId, Number(e.target.value))}
                        className="h-8 w-16 text-center font-mono"
                        aria-label="Quantity"
                      />
                      <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Increase" onClick={() => setQty(l.medicineId, l.quantity + 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="ml-auto font-mono text-sm tabular">{formatMoney(l.quantity * Number(l.medicine.unit_price))}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customer">Customer / ward</Label>
                <Input id="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Optional" maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-notes">Notes</Label>
                <Input id="sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Prescription no., remarks" maxLength={300} />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-mono text-2xl font-semibold tabular">{formatMoney(total)}</span>
            </div>
            <Button className="h-11 w-full" disabled={lines.length === 0 || overLimit || sale.isPending} onClick={() => sale.mutate()}>
              {sale.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
              Complete sale & issue receipt
            </Button>
          </div>
        </Panel>
      </div>
      <ReceiptDialog receiptNo={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
