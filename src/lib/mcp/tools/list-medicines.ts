import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getStockStatus } from "@/lib/stock";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_medicines",
  title: "List medicines",
  description: "List active medicines with current stock, minimum level, unit price (KES) and stock status.",
  inputSchema: {
    search: z.string().trim().max(100).optional().describe("Match medicine name, generic name or category."),
    status: z.enum(["all", "ok", "low", "out"]).optional().describe("Filter by stock status. Defaults to all."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum medicines to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status = "all", limit = 100 }, ctx) => {
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("medicines")
      .select("id, name, generic_name, category, unit, unit_price, current_stock, minimum_level")
      .eq("is_active", true)
      .order("name")
      .limit(500);
    if (search) {
      const s = search.replace(/[%,()*]/g, " ");
      q = q.or(`name.ilike.%${s}%,generic_name.ilike.%${s}%,category.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const medicines = (data ?? [])
      .map((m) => ({
        id: m.id,
        name: m.name,
        generic_name: m.generic_name,
        category: m.category,
        unit: m.unit,
        unit_price_kes: Number(m.unit_price),
        current_stock: m.current_stock,
        minimum_level: m.minimum_level,
        status: getStockStatus(m.current_stock, m.minimum_level),
      }))
      .filter((m) => status === "all" || m.status === status)
      .slice(0, limit);
    const text = medicines.length
      ? medicines.map((m) => `${m.name} — ${m.current_stock} ${m.unit} (min ${m.minimum_level}, ${m.status})`).join("\n")
      : "No medicines match.";
    return { content: [{ type: "text", text }], structuredContent: { medicines } };
  },
});
