import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_transactions",
  title: "List stock transactions",
  description: "List recent stock-in, sale (stock-out) and audit adjustment transactions, newest first.",
  inputSchema: {
    type: z.enum(["IN", "OUT", "ADJUST"]).optional().describe("Only this transaction type. Omit for all."),
    days: z.number().int().min(1).max(366).optional().describe("Only transactions from the last N days (default 30)."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum transactions to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ type, days = 30, limit = 50 }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    let q = supabase
      .from("stock_transactions")
      .select("id, transaction_type, quantity, balance_after, unit_price, receipt_no, supplier, customer_name, user_name, created_at, medicine:medicines(name, unit)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (type) q = q.eq("transaction_type", type);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const transactions = (data ?? []).map((t) => ({
      id: t.id,
      type: t.transaction_type,
      medicine: t.medicine?.name ?? null,
      unit: t.medicine?.unit ?? null,
      quantity: t.quantity,
      balance_after: t.balance_after,
      unit_price_kes: Number(t.unit_price),
      receipt_no: t.receipt_no,
      supplier: t.supplier,
      customer_name: t.customer_name,
      recorded_by: t.user_name,
      created_at: t.created_at,
    }));
    const text = transactions.length
      ? transactions.map((t) => `${t.created_at.slice(0, 16)} ${t.type} ${t.quantity} × ${t.medicine ?? "?"} (balance ${t.balance_after}) by ${t.recorded_by}`).join("\n")
      : "No transactions in that period.";
    return { content: [{ type: "text", text }], structuredContent: { transactions } };
  },
});
