import type { ReactNode } from "react";
import { BellRing, ClipboardCheck, PackageCheck } from "lucide-react";
import { Brand } from "@/components/app/Brand";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <div className="bg-cross-pattern absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative">
          <Brand />
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-sidebar-primary">Replace the bin card</p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-sidebar-foreground">
            Every strip, bottle and sachet — accounted for.
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-sidebar-muted">
            <li className="flex gap-3">
              <PackageCheck className="h-5 w-5 shrink-0 text-sidebar-primary" />
              Stock-in and dispensing update balances instantly, with no arithmetic by hand.
            </li>
            <li className="flex gap-3">
              <BellRing className="h-5 w-5 shrink-0 text-sidebar-primary" />
              Automatic alerts the moment a medicine reaches its reorder level.
            </li>
            <li className="flex gap-3">
              <ClipboardCheck className="h-5 w-5 shrink-0 text-sidebar-primary" />
              Physical stock audits with discrepancies calculated for you.
            </li>
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 rounded-xl bg-sidebar p-4 lg:hidden">
            <Brand subtitle={false} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
