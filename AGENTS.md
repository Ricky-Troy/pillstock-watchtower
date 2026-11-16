<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Every stock change goes through the security-definer SQL functions (record_stock_in, record_sale, record_audit, apply_audit_adjustment); clients have no write grants on stock columns, transactions, alerts or audits — keeps balances atomic and auditable.
- Alerts are created/resolved only by the `evaluate_medicine_alerts` trigger on medicines — one source of truth for thresholds.
- Role checks live in SQL (`has_role`, `has_any_role`, `is_staff`, active accounts only); UI route gating uses `canAccess` in src/lib/roles.ts, which must mirror the SQL rules.
- Staff accounts are created/edited only by admin server functions in src/lib/staff.functions.ts (service-role client loaded inside handlers after an admin check); login resolves usernames server-side in src/lib/auth.functions.ts so emails never reach the browser.
- Signed-in pages live under src/routes/_authenticated/_shell/ (sidebar layout + role gate in `_shell.tsx` beforeLoad).
- Pure business rules (stock status, discrepancy, password policy, role access) live in src/lib/*.ts with tests in src/test/.
