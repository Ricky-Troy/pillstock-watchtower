import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_stock_alerts",
  title: "List stock alerts",
  description: "List low-stock and out-of-stock alerts, newest first.",
  inputSchema: {
    status: z.enum(["ACTIVE", "RESOLVED"]).optional().describe("Alert status to show. Defaults to ACTIVE."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum alerts to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status = "ACTIVE", limit = 50 }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("alerts")
      .select("id, alert_type, status, message, created_at, resolved_at, medicine:medicines(name, current_stock, minimum_level, unit)")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError(error.message);
    const alerts = (data ?? []).map((a) => ({
      id: a.id,
      type: a.alert_type,
      status: a.status,
      message: a.message,
      created_at: a.created_at,
      resolved_at: a.resolved_at,
      medicine: a.medicine
        ? { name: a.medicine.name, current_stock: a.medicine.current_stock, minimum_level: a.medicine.minimum_level, unit: a.medicine.unit }
        : null,
    }));
    const text = alerts.length
      ? alerts.map((a) => `${a.type === "OUT_OF_STOCK" ? "OUT" : "LOW"}: ${a.medicine?.name ?? "Unknown"} — ${a.message}`).join("\n")
      : `No ${status.toLowerCase()} alerts.`;
    return { content: [{ type: "text", text }], structuredContent: { alerts } };
  },
});
