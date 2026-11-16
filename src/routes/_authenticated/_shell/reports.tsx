import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Download, Printer, Trophy, ArrowLeftRight, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel, EmptyState } from "@/components/app/Panel";
import { StatCard } from "@/components/app/StatCard";
import { medicinesQuery, reportQuery } from "@/lib/queries";
import { formatMoney, formatNumber } from "@/lib/stock";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/_shell/reports")({
  loader: ({ context }) => context.queryClient.ensureQueryData(medicinesQuery(true)),
  head: () => ({
    meta: [
      { title: "Monthly stock reports — PharmaStock" },
      { name: "description", content: "Monthly stock received, issued and top-dispensed medicines by category." },
      { property: "og:title", content: "Monthly stock reports — PharmaStock" },
      { property: "og:description", content: "Monthly stock received, issued and top-dispensed medicines by category." },
    ],
  }),
  component: ReportsPage,
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

function ReportsPage() {
  const { data: medicines } = useSuspenseQuery(medicinesQuery(true));
  const [month, setMonth] = useState(currentMonth());
  const [category, setCategory] = useState("all");
  const categories = Array.from(new Set(medicines.map((m) => m.category))).sort();
  const monthStart = `${month}-01`;
  const { data, isPending } = useQuery(reportQuery(monthStart, category === "all" ? null : category));
  const rows = data?.rows ?? [];
  const daily = data?.daily ?? [];

  const received = rows.reduce((s, r) => s + Number(r.received), 0);
  const issued = rows.reduce((s, r) => s + Number(r.issued), 0);
  const txns = rows.reduce((s, r) => s + Number(r.transactions), 0);
  const value = rows.reduce((s, r) => s + Number(r.sales_value), 0);
  const top = rows.find((r) => Number(r.issued) > 0);
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  const chartRows = rows.slice(0, 10).map((r) => ({
    name: r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name,
    Issued: Number(r.issued),
    Received: Number(r.received),
  }));
  const dailyRows = daily.map((d) => ({
    day: new Date(`${d.day}T00:00:00`).getDate(),
    Issued: Number(d.issued),
    Received: Number(d.received),
  }));

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Stock usage summary for ${monthLabel}${category !== "all" ? ` · ${category}` : ""}`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  `stock-report-${month}.csv`,
                  ["Medicine", "Category", "Unit", "Received", "Issued", "Transactions", "Sales value (KES)"],
                  rows.map((r) => [r.name, r.category, r.unit, r.received, r.issued, r.transactions, Number(r.sales_value).toFixed(2)]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />
      <div className="no-print mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="month">Month</Label>
          <Input id="month" type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="sm:w-48" />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-52" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Stock received" value={formatNumber(received)} icon={ArrowDownToLine} tone="success" />
        <StatCard label="Stock issued" value={formatNumber(issued)} icon={ArrowUpFromLine} />
        <StatCard label="Transactions" value={formatNumber(txns)} icon={ArrowLeftRight} />
        <StatCard label="Sales value" value={formatMoney(value).replace("KES ", "")} hint="KES" icon={Wallet} tone="warning" />
        <div className="col-span-2 rounded-xl border bg-card p-4 shadow-xs sm:p-5 lg:col-span-1">
          <div className="flex items-start justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Most dispensed</div>
            <Trophy className="h-4 w-4 text-warning" />
          </div>
          <div className="mt-2 font-display text-base font-semibold leading-tight">{top?.name ?? "—"}</div>
          {top && <div className="mt-1 font-mono text-xs text-muted-foreground">{formatNumber(top.issued)} {top.unit} issued</div>}
        </div>
      </div>
      {isPending ? (
        <div className="rounded-xl border bg-card"><EmptyState>Loading report…</EmptyState></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-card"><EmptyState>No stock movement recorded for this period.</EmptyState></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Consumption by medicine" description="Top 10 by quantity issued">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -16, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Issued" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Received" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Daily movement" description="Units received and issued per day">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyRows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => `Day ${d}`} />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Issued" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Received" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <Panel title="Usage by medicine">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Medicine</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Sales value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.medicine_id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.category}</TableCell>
                      <TableCell className="text-right font-mono tabular">{formatNumber(r.received)}</TableCell>
                      <TableCell className="text-right font-mono tabular">{formatNumber(r.issued)}</TableCell>
                      <TableCell className="text-right font-mono tabular">{formatNumber(r.transactions)}</TableCell>
                      <TableCell className="text-right font-mono tabular">{formatMoney(r.sales_value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
