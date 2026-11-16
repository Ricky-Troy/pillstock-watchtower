import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MedicineForm, type MedicineInput } from "@/components/app/MedicineForm";
import { MedicinePicker } from "@/components/app/MedicinePicker";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel } from "@/components/app/Panel";
import { InventoryTable } from "@/components/app/StockTables";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import { medicinesQuery, type Medicine } from "@/lib/queries";
import { useInvalidateStock } from "@/lib/use-invalidate";

export const Route = createFileRoute("/_authenticated/_shell/stock")({
  loader: ({ context }) => context.queryClient.ensureQueryData(medicinesQuery(true)),
  head: () => ({
    meta: [
      { title: "Stock management — PharmaStock" },
      { name: "description", content: "Manage the medicine catalogue, thresholds and stock movements." },
      { property: "og:title", content: "Stock management — PharmaStock" },
      { property: "og:description", content: "Manage the medicine catalogue, thresholds and stock movements." },
    ],
  }),
  component: StockPage,
});

function StockPage() {
  const { data: all } = useSuspenseQuery(medicinesQuery(true));
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const invalidate = useInvalidateStock();
  const active = all.filter((m) => m.is_active);
  const categories = Array.from(new Set(all.map((m) => m.category))).sort();

  const add = useMutation({
    mutationFn: async (input: MedicineInput) => {
      const { error } = await supabase.from("medicines").insert(input);
      if (error) throw error;
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<MedicineInput> & { is_active?: boolean } }) => {
      const { error } = await supabase.from("medicines").update(input).eq("id", id);
      if (error) throw error;
    },
  });

  return (
    <>
      <PageHeader title="Stock management" description="Maintain the medicine catalogue and record stock movements." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Add medicine" description="New items start at zero stock — record a stock-in to add opening balance.">
          <MedicineForm
            categories={categories}
            submitLabel="Add medicine"
            busy={add.isPending}
            onSubmit={async (input) => {
              try {
                await add.mutateAsync(input);
                toast.success(`${input.name} added to the catalogue`);
                await invalidate();
                return true;
              } catch (e) {
                toast.error(errorMessage(e));
                return false;
              }
            }}
          />
        </Panel>
        <Panel title="Record transaction">
          <TransactionForm medicines={active} />
        </Panel>
      </div>
      <Panel
        className="mt-6"
        title="Medicine catalogue"
        description={`${active.length} active medicines`}
        actions={
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show archived
          </label>
        }
      >
        <InventoryTable
          medicines={showArchived ? all : active}
          actions={(m) => (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={m.is_active ? `Archive ${m.name}` : `Restore ${m.name}`}
                onClick={async () => {
                  try {
                    await update.mutateAsync({ id: m.id, input: { is_active: !m.is_active } });
                    toast.success(m.is_active ? `${m.name} archived` : `${m.name} restored`);
                    await invalidate();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                {m.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
              </Button>
            </div>
          )}
        />
      </Panel>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit medicine</DialogTitle>
          </DialogHeader>
          {editing && (
            <MedicineForm
              key={editing.id}
              initial={editing}
              categories={categories}
              submitLabel="Save changes"
              busy={update.isPending}
              onSubmit={async (input) => {
                try {
                  await update.mutateAsync({ id: editing.id, input });
                  toast.success("Medicine updated");
                  setEditing(null);
                  await invalidate();
                  return true;
                } catch (e) {
                  toast.error(errorMessage(e));
                  return false;
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TransactionForm({ medicines }: { medicines: Medicine[] }) {
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const invalidate = useInvalidateStock();
  const selected = medicines.find((m) => m.id === medicineId);

  const mutation = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (type === "IN") {
        const { error } = await supabase.rpc("record_stock_in", { _medicine_id: medicineId!, _quantity: qty, _notes: notes });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("record_sale", {
          _items: [{ medicine_id: medicineId!, quantity: qty }],
          _notes: notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(type === "IN" ? "Stock-in recorded" : "Stock-out recorded");
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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Transaction type</Label>
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => v && setType(v as "IN" | "OUT")}
          variant="outline"
          className="justify-start"
        >
          <ToggleGroupItem value="IN" className="px-4">Stock in</ToggleGroupItem>
          <ToggleGroupItem value="OUT" className="px-4">Stock out</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="space-y-2">
        <Label htmlFor="txn-medicine">Medicine</Label>
        <MedicinePicker id="txn-medicine" medicines={medicines} value={medicineId} onChange={setMedicineId} />
        {selected && (
          <p className="text-xs text-muted-foreground">
            Current balance: <span className="font-mono font-semibold text-foreground">{selected.current_stock}</span> {selected.unit}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="txn-qty">Quantity</Label>
        <Input id="txn-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="font-mono" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="txn-notes">Notes</Label>
        <Textarea id="txn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Record {type === "IN" ? "stock in" : "stock out"}
      </Button>
    </form>
  );
}
