import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-8 w-8", className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-sidebar-primary" />
      <path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" className="fill-sidebar" />
    </svg>
  );
}

export function Brand({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="leading-tight">
        <div className="font-display text-lg font-semibold text-sidebar-foreground">PharmaStock</div>
        {subtitle && <div className="text-[11px] uppercase tracking-[0.14em] text-sidebar-muted">Medicine stock system</div>}
      </div>
    </div>
  );
}
