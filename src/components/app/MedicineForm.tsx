import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Medicine } from "@/lib/queries";

export type MedicineInput = {
  name: string;
  generic_name: string | null;
  category: string;
  unit: string;
  minimum_level: number;
  unit_price: number;
};

export function MedicineForm({
  initial,
  categories,
  submitLabel,
  busy,
  onSubmit,
}: {
  initial?: Medicine;
  categories: string[];
  submitLabel: string;
  busy?: boolean;
  onSubmit: (input: MedicineInput) => Promise<boolean | void> | void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [generic, setGeneric] = useState(initial?.generic_name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "Strip");
  const [min, setMin] = useState(String(initial?.minimum_level ?? 10));
  const [price, setPrice] = useState(String(initial?.unit_price ?? ""));
  const listId = `categories-${initial?.id ?? "new"}`;

  async function handle(e: FormEvent) {
    e.preventDefault();
    const ok = await onSubmit({
      name: name.trim(),
      generic_name: generic.trim() || null,
      category: category.trim(),
      unit: unit.trim() || "Pack",
      minimum_level: Math.max(0, Math.floor(Number(min) || 0)),
      unit_price: Math.max(0, Number(price) || 0),
    });
    if (ok && !initial) {
      setName("");
      setGeneric("");
      setPrice("");
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`name-${listId}`}>Medicine name</Label>
        <Input id={`name-${listId}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amoxicillin 500mg Capsules" required maxLength={120} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`generic-${listId}`}>Generic name</Label>
          <Input id={`generic-${listId}`} value={generic} onChange={(e) => setGeneric(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`cat-${listId}`}>Category</Label>
          <Input id={`cat-${listId}`} list={listId} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Antibiotics" required maxLength={60} />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`unit-${listId}`}>Unit</Label>
          <Input id={`unit-${listId}`} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Strip" maxLength={30} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`min-${listId}`}>Minimum level</Label>
          <Input id={`min-${listId}`} type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} className="font-mono" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`price-${listId}`}>Price (KES)</Label>
          <Input id={`price-${listId}`} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="font-mono" required />
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
      </Button>
    </form>
  );
}
