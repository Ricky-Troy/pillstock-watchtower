import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "monthly_stock_report",
  title: "Monthly stock report",
  description: "Per-medicine received, issued and sales value (KES) for one month. Administrators and pharmacists only.",
  inputSchema: {
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM").describe("Month as YYYY-MM, e.g. 2026-11."),
    category: z.string().trim().min(1).max(100).optional().describe("Only this medicine category."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ month, category }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("monthly_report", {
      _month_start: `${month}-01`,
      ...(category ? { _category: category } : {}),
    });
    if (error) throw new ToolError(error.message);
    const rows = (data ?? []).map((r) => ({
      medicine: r.name,
      category: r.category,
      unit: r.unit,
      received: Number(r.received),
      issued: Number(r.issued),
      sales_value_kes: Number(r.sales_value),
      transactions: Number(r.transactions),
    }));
    const total = rows.reduce((s, r) => s + r.sales_value_kes, 0);
    const text = rows.length
      ? `Total sales ${month}: KES ${total.toFixed(2)}\n` + rows.map((r) => `${r.medicine}: in ${r.received}, out ${r.issued}, KES ${r.sales_value_kes.toFixed(2)}`).join("\n")
      : `No stock movement in ${month}.`;
    return { content: [{ type: "text", text }], structuredContent: { month, total_sales_kes: total, rows } };
  },
});
