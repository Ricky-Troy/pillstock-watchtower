import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { primaryRole, type Role } from "./roles";

export type Medicine = Database["public"]["Tables"]["medicines"]["Row"];
export type Alert = Database["public"]["Tables"]["alerts"]["Row"];
export type StockAudit = Database["public"]["Tables"]["stock_audits"]["Row"];
export type ActivityLog = Database["public"]["Tables"]["activity_logs"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Transaction = Database["public"]["Tables"]["stock_transactions"]["Row"] & {
  medicine: { name: string; unit: string; category: string } | null;
};

export type Me = {
  userId: string;
  profile: Profile | null;
  role: Role | null;
};

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  staleTime: 60_000,
  queryFn: async (): Promise<Me | null> => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const [profile, roles] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    ]);
    return {
      userId: data.user.id,
      profile: profile.data,
      role: profile.data?.is_active ? primaryRole((roles.data ?? []).map((r) => r.role)) : null,
    };
  },
});

export const medicinesQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: ["medicines", { includeArchived }],
    queryFn: async () => {
      let q = supabase.from("medicines").select("*").order("name");
      if (!includeArchived) q = q.eq("is_active", true);
      return check(await q) as Medicine[];
    },
  });

const TXN_SELECT = "*, medicine:medicines(name, unit, category)";

export type TransactionFilter = {
  type?: "IN" | "OUT" | "ADJUST" | undefined;
  userId?: string | undefined;
  since?: string | undefined;
  limit?: number | undefined;
};

export const transactionsQuery = (f: TransactionFilter = {}) =>
  queryOptions({
    queryKey: ["transactions", f],
    queryFn: async () => {
      let q = supabase
        .from("stock_transactions")
        .select(TXN_SELECT)
        .order("created_at", { ascending: false })
        .limit(f.limit ?? 200);
      if (f.type) q = q.eq("transaction_type", f.type);
      if (f.userId) q = q.eq("user_id", f.userId);
      if (f.since) q = q.gte("created_at", f.since);
      return check(await q) as unknown as Transaction[];
    },
  });

export const receiptQuery = (receiptNo: string) =>
  queryOptions({
    queryKey: ["transactions", "receipt", receiptNo],
    queryFn: async () =>
      check(
        await supabase
          .from("stock_transactions")
          .select(TXN_SELECT)
          .eq("receipt_no", receiptNo)
          .order("created_at"),
      ) as unknown as Transaction[],
  });

export const transactionCountQuery = (f: { type?: "IN" | "OUT"; userId?: string; since: string }) =>
  queryOptions({
    queryKey: ["transactions", "count", f],
    queryFn: async () => {
      let q = supabase
        .from("stock_transactions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", f.since);
      if (f.type) q = q.eq("transaction_type", f.type);
      if (f.userId) q = q.eq("user_id", f.userId);
      const res = await q;
      if (res.error) throw new Error(res.error.message);
      return res.count ?? 0;
    },
  });

export type AlertWithMedicine = Alert & {
  medicine: { name: string; current_stock: number; minimum_level: number; unit: string } | null;
};

export const alertsQuery = queryOptions({
  queryKey: ["alerts"],
  queryFn: async () =>
    check(
      await supabase
        .from("alerts")
        .select("*, medicine:medicines(name, current_stock, minimum_level, unit)")
        .order("created_at", { ascending: false })
        .limit(300),
    ) as unknown as AlertWithMedicine[],
});

export type AuditWithMedicine = StockAudit & { medicine: { name: string; unit: string; current_stock: number } | null };

export const auditsQuery = queryOptions({
  queryKey: ["audits"],
  queryFn: async () =>
    check(
      await supabase
        .from("stock_audits")
        .select("*, medicine:medicines(name, unit, current_stock)")
        .order("created_at", { ascending: false })
        .limit(200),
    ) as unknown as AuditWithMedicine[],
});

export type StaffMember = Profile & { role: Role | null };

export const staffQuery = queryOptions({
  queryKey: ["staff"],
  queryFn: async (): Promise<StaffMember[]> => {
    const [profiles, roles] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const list = check(profiles) as Profile[];
    const roleRows = check(roles) as { user_id: string; role: Role }[];
    return list.map((p) => ({
      ...p,
      role: primaryRole(roleRows.filter((r) => r.user_id === p.id).map((r) => r.role)),
    }));
  },
});

export const activityQuery = queryOptions({
  queryKey: ["activity"],
  queryFn: async () =>
    check(
      await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500),
    ) as ActivityLog[],
});

export const reportQuery = (monthStart: string, category: string | null) =>
  queryOptions({
    queryKey: ["transactions", "report", monthStart, category],
    queryFn: async () => {
      const [rows, daily] = await Promise.all([
        supabase.rpc("monthly_report", { _month_start: monthStart, ...(category ? { _category: category } : {}) }),
        supabase.rpc("daily_movement", { _month_start: monthStart, ...(category ? { _category: category } : {}) }),
      ]);
      return { rows: check(rows), daily: check(daily) };
    },
  });
