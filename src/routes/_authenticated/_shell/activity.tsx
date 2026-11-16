import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel, EmptyState } from "@/components/app/Panel";
import { activityQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/stock";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/_shell/activity")({
  loader: ({ context }) => context.queryClient.ensureQueryData(activityQuery),
  head: () => ({
    meta: [
      { title: "Activity log — PharmaStock" },
      { name: "description", content: "Tamper-resistant record of sign-ins, stock movements and admin actions." },
      { property: "og:title", content: "Activity log — PharmaStock" },
      { property: "og:description", content: "Tamper-resistant record of sign-ins, stock movements and admin actions." },
    ],
  }),
  component: ActivityPage,
});

function actionVariant(action: string) {
  if (action === "LOGIN_FAILED" || action.includes("DEACTIVATED") || action.includes("ARCHIVED")) return "danger" as const;
  if (action.startsWith("STOCK_IN") || action.includes("ADDED") || action.includes("CREATED")) return "success" as const;
  if (action.includes("AUDIT") || action.includes("ALERT")) return "warning" as const;
  if (action === "LOGIN" || action === "LOGOUT") return "muted" as const;
  return "secondary" as const;
}

function ActivityPage() {
  const { data: logs } = useSuspenseQuery(activityQuery);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = term
    ? logs.filter((l) => [l.user_name, l.action, l.details ?? ""].some((v) => v.toLowerCase().includes(term)))
    : logs;

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every sign-in, stock movement and administrative change. Entries cannot be edited or deleted."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "activity-log.csv",
                ["Time", "User", "Action", "Details"],
                rows.map((l) => [new Date(l.created_at).toISOString(), l.user_name, l.action, l.details ?? ""]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <Panel>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user, action or details…" className="pl-9" aria-label="Search activity" />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{formatDateTime(l.created_at)}</TableCell>
                  <TableCell className="text-sm">{l.user_name}</TableCell>
                  <TableCell>
                    <Badge variant={actionVariant(l.action)} className="font-mono text-[10px]">
                      {l.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && <EmptyState>No activity found.</EmptyState>}
        </div>
      </Panel>
    </>
  );
}
