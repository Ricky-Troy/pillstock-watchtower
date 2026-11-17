import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMedicines from "./tools/list-medicines";
import listAlerts from "./tools/list-alerts";
import listTransactions from "./tools/list-transactions";
import monthlyReport from "./tools/monthly-report";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "pillstock-watchtower",
  title: "Pillstock Watchtower",
  version: "0.1.0",
  instructions:
    "Read-only tools for a pharmacy medicine stock system (prices in KES). Look up medicines and stock levels, active low/out-of-stock alerts, recent stock transactions and monthly reports. Results follow the signed-in staff member's role permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMedicines, listAlerts, listTransactions, monthlyReport],
});
