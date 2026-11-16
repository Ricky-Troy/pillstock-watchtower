import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  BellRing,
  ClipboardCheck,
  PackageCheck,
  PackagePlus,
  PackageX,
  Pill,
  ShoppingCart,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel, EmptyState } from "@/components/app/Panel";
import { ReceiptDialog } from "@/components/app/Receipt";
import { StatCard } from "@/components/app/StatCard";
import { StockBadge } from "@/components/app/StockBadge";
import { AlertFeed, InventoryTable, TransactionFeed } from "@/components/app/StockTables";
import { alertsQuery, auditsQuery, medicinesQuery, meQuery, transactionsQuery, type Me } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/roles";
import { getStockStatus, startOfToday } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/_shell/dashboard")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(medicinesQuery()),
      context.queryClient.ensureQueryData(alertsQuery),
    ]),
  head: () => ({
    meta: [
      { title: "Dashboard — PharmaStock" },
      { name: "description", content: "Live overview of medicine stock, alerts and today's transactions." },
      { property: "og:title", content: "Dashboard — PharmaStock" },
      { property: "og:description", content: "Live overview of medicine stock, alerts and today's transactions." },
    ],
  }),
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { data: me } = useSuspenseQuery(meQuery);
  if (!me?.role) return null;
  return (
    <>
      <PageHeader
        title={`${greeting()}, ${me.profile?.full_name.split(" ")[0] ?? ""}`}
        description={`${ROLE_LABEL[me.role]} dashboard · ${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />
      {me.role === "admin" && <AdminDashboard />}
      {me.role === "pharmacist" && <PharmacistDashboard me={me} />}
      {me.role === "storekeeper" && <StorekeeperDashboard />}
    </>
  );
}

function useStockSummary() {
  const { data: medicines } = useSuspenseQuery(medicinesQuery());
  const { data: alerts } = useSuspenseQuery(alertsQuery);
  const low = medicines.filter((m) => getStockStatus(m.current_stock, m.minimum_level) === "low");
  const out = medicines.filter((m) => getStockStatus(m.current_stock, m.minimum_level) === "out");
  const active = alerts.filter((a) => a.status === "ACTIVE");
  return { medicines, low, out, active };
}

function AdminDashboard() {
  const { medicines, low, out, active } = useStockSummary();
  const since = startOfToday().toISOString();
  const { data: today } = useSuspenseQuery(transactionsQuery({ since, limit: 1000 }));
  const { data: recent } = useSuspenseQuery(transactionsQuery({ limit: 8 }));
  const [receipt, setReceipt] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total medicines" value={medicines.length} icon={Pill} />
        <StatCard label="Low stock" value={low.length} icon={AlertTriangle} tone="warning" hint="At or below minimum level" />
        <StatCard label="Out of stock" value={out.length} icon={PackageX} tone="danger" />
        <StatCard label="Transactions today" value={today.length} icon={ArrowLeftRight} tone="success" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Recent transactions"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/transactions">View all</Link>
            </Button>
          }
        >
          <TransactionFeed transactions={recent} onReceipt={setReceipt} />
        </Panel>
        <Panel
          title="Active alerts"
          description={`${active.length} need attention`}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/alerts">Manage</Link>
            </Button>
          }
        >
          <AlertFeed alerts={active.slice(0, 6)} />
        </Panel>
      </div>
      <Panel title="Inventory status" description="Current balance of every medicine">
        <InventoryTable medicines={medicines} />
      </Panel>
      <ReceiptDialog receiptNo={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function PharmacistDashboard({ me }: { me: Me }) {
  const { medicines, active } = useStockSummary();
  const since = startOfToday().toISOString();
  const { data: outsToday } = useSuspenseQuery(transactionsQuery({ type: "OUT", since, limit: 1000 }));
  const { data: myRecent } = useSuspenseQuery(transactionsQuery({ userId: me.userId, limit: 8 }));
  const myToday = outsToday.filter((t) => t.user_id === me.userId);
  const available = medicines.filter((m) => m.current_stock > 0).length;
  const [receipt, setReceipt] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stock-outs today" value={outsToday.length} icon={ShoppingCart} />
        <StatCard label="Active alerts" value={active.length} icon={BellRing} tone="warning" />
        <StatCard label="Available medicines" value={available} icon={PackageCheck} tone="success" hint={`of ${medicines.length} in catalogue`} />
        <StatCard label="My transactions today" value={myToday.length} icon={UserCheck} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/stock-out">
            <ShoppingCart className="h-4 w-4" /> Record a sale
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/reports">View reports</Link>
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="My recent transactions">
          <TransactionFeed transactions={myRecent} onReceipt={setReceipt} empty="You haven't recorded any sales yet." />
        </Panel>
        <Panel title="Low-stock alerts" actions={<Button asChild variant="ghost" size="sm"><Link to="/alerts">All alerts</Link></Button>}>
          <AlertFeed alerts={active.slice(0, 6)} />
        </Panel>
      </div>
      <Panel title="Stock lookup" description="Check availability before dispensing">
        <InventoryTable medicines={medicines} />
      </Panel>
      <ReceiptDialog receiptNo={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function StorekeeperDashboard() {
  const { medicines, low, out, active } = useStockSummary();
  const since = startOfToday().toISOString();
  const { data: insToday } = useSuspenseQuery(transactionsQuery({ type: "IN", since, limit: 1000 }));
  const { data: recentIns } = useSuspenseQuery(transactionsQuery({ type: "IN", limit: 8 }));
  const { data: audits } = useSuspenseQuery(auditsQuery);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const auditsThisMonth = audits.filter((a) => new Date(a.created_at) >= monthStart).length;
  const replenish = [...out, ...low];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stock-ins today" value={insToday.length} icon={PackagePlus} tone="success" />
        <StatCard label="Active alerts" value={active.length} icon={BellRing} tone="warning" />
        <StatCard label="Medicines catalogued" value={medicines.length} icon={Pill} />
        <StatCard label="Audits this month" value={auditsThisMonth} icon={ClipboardCheck} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/stock-in">
            <PackagePlus className="h-4 w-4" /> Record stock in
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/audit">Start a stock audit</Link>
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Needs replenishment" description="Out of stock first, then low stock">
          {replenish.length === 0 ? (
            <EmptyState>Everything is above its minimum level.</EmptyState>
          ) : (
            <ul className="divide-y">
              {replenish.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{m.current_stock}</span> {m.unit} left · minimum{" "}
                      <span className="font-mono">{m.minimum_level}</span>
                    </div>
                  </div>
                  <StockBadge current={m.current_stock} minimum={m.minimum_level} />
                  <Button asChild size="sm" variant="outline">
                    <Link to="/stock-in" search={{ medicine: m.id }}>
                      Restock
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent stock-ins">
          <TransactionFeed transactions={recentIns} empty="No consignments recorded yet." />
        </Panel>
      </div>
    </div>
  );
}
