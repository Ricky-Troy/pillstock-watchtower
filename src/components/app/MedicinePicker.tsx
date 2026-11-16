import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Medicine } from "@/lib/queries";
import { getStockStatus } from "@/lib/stock";
import { cn } from "@/lib/utils";

export function MedicinePicker({
  medicines,
  value,
  onChange,
  placeholder = "Search medicine by name, generic or category…",
  id,
}: {
  medicines: Medicine[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = medicines.find((m) => m.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Type to search…" />
          <CommandList>
            <CommandEmpty>No medicine found.</CommandEmpty>
            <CommandGroup>
              {medicines.map((m) => {
                const status = getStockStatus(m.current_stock, m.minimum_level);
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.name} ${m.generic_name ?? ""} ${m.category} ${m.id}`}
                    onSelect={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-1 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.category}
                        {m.generic_name ? ` · ${m.generic_name}` : ""}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "font-mono text-xs tabular",
                        status === "out" && "text-destructive",
                        status === "low" && "text-warning-foreground",
                        status === "ok" && "text-muted-foreground",
                      )}
                    >
                      {m.current_stock} {m.unit}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
