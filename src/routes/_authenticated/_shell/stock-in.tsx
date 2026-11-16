import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MedicinePicker } from "@/components/app/MedicinePicker";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel, EmptyState } from "@/components/app/Panel";
import { StockBadge } from "@/components/app/StockBadge";
import { TransactionFeed } from "@/components/app/StockTables";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import { medicinesQuery, transactionsQuery } from "@/lib/queries";
import { getStockStatus } from "@/lib/stock";
import { useInvalidateStock } from "@/lib/use-invalidate";

type Search = { medicine?: string };

export const Route = createFileRoute("/_authenticated/_shell/stock-in")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    medicine: typeof s.medicine === "string" ? s.medicine : undefined,
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(medicinesQuery()),
      context.queryClient.ensureQueryData(transactionsQuery({ type: "IN", limit: 15 })),
    ]),
  head: () => ({
    meta: [
      { title: "Record stock in — PharmaStock" },
      { name: "description", content: "Record incoming medicine consignments from suppliers." },
      { property: "og:title", content: "Record stock in — PharmaStock" },
      { property: "og:description", content: "Record incoming medicine consignments from suppliers." },
    ],
  }),
  component: StockInPage,
});

function StockInPage() {
  const search = Route.useSearch();
  const { data: medicines } = useSuspenseQuery(medicinesQuery());
  const { data: recent } = useSuspenseQuery(transactionsQuery({ type: "IN", limit: 15 }));
  const [medicineId, setMedicineId] = useState<string | null>(search.medicine ?? null);
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const invalidate = useInvalidateStock();
  const selected = medicines.find((m) => m.id === medicineId);
  const needs = medicines.filter((m) => getStockStatus(m.current_stock, m.minimum_level) !== "ok");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("record_stock_in", {
        _medicine_id: medicineId!,
        _quantity: Number(quantity),
        _supplier: supplier,
        _notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Stock received", {
        description: `${quantity} ${selected?.unit ?? ""} of ${selected?.name} added.`,
      });
      setQuantity("");
      setNotes("");
      await invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!medicineId) return toast.error("Choose a medicine");
    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) return toast.error("Quantity must be a whole number above zero");
    mutation.mutate();
  }

  return (
    <>
      <PageHeader title="Record stock in" description="Log consignments received from manufacturers or distributors. Balances update immediately." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="New consignment">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="medicine">Medicine</Label>
              <MedicinePicker id="medicine" medicines={medicines} value={medicineId} onChange={setMedicineId} />
              {selected && (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Current balance</span>
                  <span className="font-mono font-semibold tabular">
                    {selected.current_stock} {selected.unit}
                  </span>
                  <span className="text-muted-foreground">· minimum {selected.minimum_level}</span>
                  <span className="ml-auto">
                    <StockBadge current={selected.current_stock} minimum={selected.minimum_level} />
                  </span>
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity received{selected ? ` (${selected.unit})` : ""}</Label>
                <Input id="qty" type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="font-mono" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input id="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. KEMSA, Dawa Ltd" maxLength={120} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice number, batch, delivery remarks…" maxLength={500} />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Record stock in
            </Button>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel title="Items requiring replenishment">
            {needs.length === 0 ? (
              <EmptyState>Nothing below its minimum level.</EmptyState>
            ) : (
              <ul className="divide-y">
                {needs.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setMedicineId(m.id)}
                      className="flex w-full items-center gap-3 py-2 text-left hover:text-primary"
                    >
                      <span className="flex-1 truncate text-sm">{m.name}</span>
                      <span className="font-mono text-xs tabular text-muted-foreground">
                        {m.current_stock}/{m.minimum_level}
                      </span>
                      <StockBadge current={m.current_stock} minimum={m.minimum_level} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Recent stock-ins">
            <TransactionFeed transactions={recent} empty="No consignments recorded yet." />
          </Panel>
        </div>
      </div>
    </>
  );
}
