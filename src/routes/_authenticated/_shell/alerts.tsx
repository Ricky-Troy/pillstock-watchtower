import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, PackageX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/Panel";
import { StatCard } from "@/components/app/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import { alertsQuery, meQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/stock";
import { useInvalidateStock } from "@/lib/use-invalidate";
import { cn } from "@/lib/utils";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";

export const Route = createFileRoute("/_authenticated/_shell/alerts")({
  loader: ({ context }) => context.queryClient.ensureQueryData(alertsQuery),
  head: () => ({
    meta: [
      { title: "Stock alerts — PharmaStock" },
      { name: "description", content: "Automatic low-stock and out-of-stock alerts for every medicine." },
      { property: "og:title", content: "Stock alerts — PharmaStock" },
      { property: "og:description", content: "Automatic low-stock and out-of-stock alerts for every medicine." },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { data: alerts } = useSuspenseQuery(alertsQuery);
  const { data: me } = useSuspenseQuery(meQuery);
  const [tab, setTab] = useState<"ACTIVE" | "RESOLVED">("ACTIVE");
  const invalidate = useInvalidateStock();
  const active = alerts.filter((a) => a.status === "ACTIVE");
  const resolved = alerts.filter((a) => a.status === "RESOLVED");
  const list = (tab === "ACTIVE" ? active : resolved).sort((a, b) =>
    tab === "ACTIVE" && a.alert_type !== b.alert_type ? (a.alert_type === "OUT_OF_STOCK" ? -1 : 1) : 0,
  );
  const canRestock = me?.role === "admin" || me?.role === "storekeeper";

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("resolve_alert", { _alert_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Alert marked resolved");
      await invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  useWebMCP({
    name: "list_visible_alerts",
    description: "List the stock alerts currently shown on the Alerts page (active or resolved tab).",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () =>
      runWebMCPTool("list_visible_alerts", () =>
        list.length === 0
          ? `No ${tab === "ACTIVE" ? "active" : "resolved"} alerts shown.`
          : list
              .map((a) => `${a.alert_type === "OUT_OF_STOCK" ? "OUT" : "LOW"}: ${a.medicine?.name ?? "Unknown"} — ${a.message}`)
              .join("\n"),
      ),
  });

  useWebMCP({
    name: "show_alert_tab",
    description: "Switch the Alerts page between active and resolved alerts.",
    inputSchema: {
      type: "object",
      properties: { tab: { type: "string", enum: ["ACTIVE", "RESOLVED"], description: "Which alerts to show." } },
      required: ["tab"],
    },
    execute: ({ tab: next }: { tab: string }) =>
      runWebMCPTool("show_alert_tab", () => {
        if (next !== "ACTIVE" && next !== "RESOLVED") throw new Error("Unknown tab; expected ACTIVE or RESOLVED.");
        setTab(next);
        return `Showing ${next.toLowerCase()} alerts.`;
      }),
  });

  return (
    <>
      <PageHeader title="Alerts" description="Raised automatically when a medicine reaches its minimum level or runs out. Restocking above the minimum clears them." />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Out of stock" value={active.filter((a) => a.alert_type === "OUT_OF_STOCK").length} icon={PackageX} tone="danger" />
        <StatCard label="Low-stock warnings" value={active.filter((a) => a.alert_type === "LOW_STOCK").length} icon={AlertTriangle} tone="warning" />
        <StatCard label="Resolved" value={resolved.length} icon={CheckCircle2} tone="success" />
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="ACTIVE">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="RESOLVED">Resolved ({resolved.length})</TabsTrigger>
        </TabsList>
      </Tabs>
      {list.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState>{tab === "ACTIVE" ? "No active alerts. Stock levels look healthy." : "No resolved alerts yet."}</EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a) => {
            const out = a.alert_type === "OUT_OF_STOCK";
            return (
              <article
                key={a.id}
                className={cn(
                  "flex gap-3 rounded-xl border bg-card p-4 shadow-xs",
                  a.status === "ACTIVE" && (out ? "border-l-4 border-l-destructive" : "border-l-4 border-l-warning"),
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    a.status === "RESOLVED" ? "bg-muted text-muted-foreground" : out ? "bg-danger-soft text-destructive" : "bg-warning-soft text-warning-foreground",
                  )}
                >
                  {out ? <PackageX className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-sans text-sm font-semibold">{a.medicine?.name}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{a.message}</p>
                  {a.status === "RESOLVED" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Resolved {a.resolved_at ? formatDateTime(a.resolved_at) : ""} by {a.resolved_by_name ?? "—"}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(a.id)}>
                        Mark resolved
                      </Button>
                      {canRestock && (
                        <Button size="sm" asChild>
                          <Link to="/stock-in" search={{ medicine: a.medicine_id }}>
                            Restock
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
