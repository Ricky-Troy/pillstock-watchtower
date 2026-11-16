import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MedicinePicker } from "@/components/app/MedicinePicker";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel, EmptyState } from "@/components/app/Panel";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import { auditsQuery, medicinesQuery, meQuery } from "@/lib/queries";
import { computeDiscrepancy, DISCREPANCY_LABEL, formatDateTime, type DiscrepancyStatus } from "@/lib/stock";
import { useInvalidateStock } from "@/lib/use-invalidate";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_shell/audit")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(medicinesQuery()),
      context.queryClient.ensureQueryData(auditsQuery),
    ]),
  head: () => ({
    meta: [
      { title: "Stock audit — PharmaStock" },
      { name: "description", content: "Count shelf stock and reconcile it against recorded balances." },
      { property: "og:title", content: "Stock audit — PharmaStock" },
      { property: "og:description", content: "Count shelf stock and reconcile it against recorded balances." },
    ],
  }),
  component: AuditPage,
});

const DISC_STYLE: Record<DiscrepancyStatus, string> = {
  balanced: "bg-success-soft text-success border-success/30",
  surplus: "bg-warning-soft text-warning-foreground border-warning/40",
  shortage: "bg-danger-soft text-destructive border-destructive/30",
};

function DiscrepancyBadge({ status }: { status: DiscrepancyStatus }) {
  const variant = status === "balanced" ? "success" : status === "surplus" ? "warning" : "danger";
  return <Badge variant={variant}>{DISCREPANCY_LABEL[status]}</Badge>;
}

function AuditPage() {
  const { data: medicines } = useSuspenseQuery(medicinesQuery());
  const { data: audits } = useSuspenseQuery(auditsQuery);
  const { data: me } = useSuspenseQuery(meQuery);
  const isAdmin = me?.role === "admin";
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const [physical, setPhysical] = useState("");
  const [notes, setNotes] = useState("");
  const invalidate = useInvalidateStock();
  const selected = medicines.find((m) => m.id === medicineId);
  const hasCount = physical !== "" && Number.isInteger(Number(physical)) && Number(physical) >= 0;
  const disc = selected && hasCount ? computeDiscrepancy(selected.current_stock, Number(physical)) : null;

  const record = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("record_audit", {
        _medicine_id: medicineId!,
        _physical_quantity: Number(physical),
        _notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Audit recorded", { description: `${selected?.name}: ${disc ? DISCREPANCY_LABEL[disc.status] : ""}` });
      setPhysical("");
      setNotes("");
      setMedicineId(null);
      await invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const apply = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("apply_audit_adjustment", { _audit_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Stock adjusted to match the count");
      await invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!medicineId) { toast.error("Choose a medicine"); return; }
    if (!hasCount) { toast.error("Enter the physical count (0 or more)"); return; }
    record.mutate();
  }

  return (
    <>
      <PageHeader title="Stock audit" description="Count what's physically on the shelf. The system compares it with the recorded balance." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Panel title="Physical count">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="audit-medicine">Medicine</Label>
              <MedicinePicker id="audit-medicine" medicines={medicines} value={medicineId} onChange={setMedicineId} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Recorded quantity</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted px-3 font-mono tabular">
                  {selected ? `${selected.current_stock} ${selected.unit}` : "—"}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="physical">Physical count</Label>
                <Input id="physical" type="number" min={0} value={physical} onChange={(e) => setPhysical(e.target.value)} className="h-10 font-mono" disabled={!selected} required />
              </div>
            </div>
            <div
              className={cn(
                "rounded-lg border px-4 py-3 transition-colors",
                disc ? DISC_STYLE[disc.status] : "border-dashed text-muted-foreground",
              )}
              aria-live="polite"
            >
              <div className="text-xs font-medium uppercase tracking-wider">Discrepancy</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-semibold tabular">
                  {disc ? (disc.value > 0 ? `+${disc.value}` : disc.value) : "—"}
                </span>
                {disc && <span className="text-sm font-medium">{DISCREPANCY_LABEL[disc.status]}</span>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-notes">Notes</Label>
              <Textarea id="audit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shelf location, possible cause…" maxLength={500} rows={2} />
            </div>
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Save audit
            </Button>
          </form>
        </Panel>
        <Panel title="Audit register" description={isAdmin ? "Apply an adjustment to correct recorded stock after investigating." : "Latest counts first"}>
          {audits.length === 0 ? (
            <EmptyState>No audits recorded yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-right">Recorded</TableHead>
                    <TableHead className="text-right">Physical</TableHead>
                    <TableHead className="text-right">Diff</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audits.map((a) => {
                    const { status } = computeDiscrepancy(a.recorded_quantity, a.physical_quantity);
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="font-medium">{a.medicine?.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.user_name} · {formatDateTime(a.created_at)}
                          </div>
                          {a.notes && <div className="max-w-xs truncate text-xs text-muted-foreground">{a.notes}</div>}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular">{a.recorded_quantity}</TableCell>
                        <TableCell className="text-right font-mono tabular">{a.physical_quantity}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono font-semibold tabular",
                            status === "shortage" && "text-destructive",
                            status === "surplus" && "text-warning-foreground",
                            status === "balanced" && "text-success",
                          )}
                        >
                          {a.discrepancy > 0 ? `+${a.discrepancy}` : a.discrepancy}
                        </TableCell>
                        <TableCell><DiscrepancyBadge status={status} /></TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {a.discrepancy === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : a.adjusted ? (
                              <span className="text-xs text-muted-foreground">Applied by {a.adjusted_by_name}</span>
                            ) : (
                              <Button size="sm" variant="outline" disabled={apply.isPending} onClick={() => apply.mutate(a.id)}>
                                Apply adjustment
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
