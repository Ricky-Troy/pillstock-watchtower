import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { LogOut, Menu, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Brand } from "@/components/app/Brand";
import { supabase } from "@/integrations/supabase/client";
import { alertsQuery, meQuery } from "@/lib/queries";
import { canAccess, navForRole, ROLE_LABEL, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_shell")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role && !canAccess(me.role, location.pathname)) {
      toast.error("Access denied", { description: "That page isn't available for your role." });
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ShellLayout,
});

function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await supabase.rpc("log_auth_event", { _event: "LOGOUT" });
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

function useLiveUpdates() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`stock-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "medicines" }, () => {
        queryClient.invalidateQueries({ queryKey: ["medicines"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["alerts"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stock_transactions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

function ShellLayout() {
  const { data: me } = useSuspenseQuery(meQuery);
  const signOut = useSignOut();

  if (!me?.role || !me.profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-warning" />
          <h1 className="mt-4 text-xl font-semibold">Account not ready</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account has no role assigned or has been deactivated. Ask your pharmacy administrator to set it up.
          </p>
          <Button className="mt-6" variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <ShellFrame role={me.role} name={me.profile.full_name} username={me.profile.username} onSignOut={signOut} />;
}

function ShellFrame({
  role,
  name,
  username,
  onSignOut,
}: {
  role: Role;
  name: string;
  username: string;
  onSignOut: () => void;
}) {
  useLiveUpdates();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMobileOpen(false), [pathname]);

  const nav = (
    <SidebarNav role={role} name={name} username={username} pathname={pathname} onSignOut={onSignOut} />
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">{nav}</aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">{nav}</div>
        </SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-display font-semibold">PharmaStock</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  role,
  name,
  username,
  pathname,
  onSignOut,
}: {
  role: Role;
  name: string;
  username: string;
  pathname: string;
  onSignOut: () => void;
}) {
  const { data: alerts = [] } = useQuery(alertsQuery);
  const activeAlerts = alerts.filter((a) => a.status === "ACTIVE").length;
  const items = navForRole(role);

  return (
    <>
      <div className="px-5 py-5">
        <Brand />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />
              <span className="flex-1">{item.label}</span>
              {item.to === "/alerts" && activeAlerts > 0 && (
                <span className="rounded-full bg-destructive px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-destructive-foreground">
                  {activeAlerts}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent font-display text-sm font-semibold text-sidebar-primary">
            {name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-sidebar-foreground">{name}</div>
            <div className="truncate text-xs text-sidebar-muted">
              {ROLE_LABEL[role]} · @{username}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-3 w-full justify-start text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </>
  );
}
