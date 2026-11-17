import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = { data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null };
type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string; uri?: string } | null;
  redirect_uri?: string;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  scopes?: string[];
} | null;
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
// Typed wrapper for the beta auth.oauth namespace of the installed Supabase client.
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const SCOPE_LABEL: Record<string, string> = {
  openid: "Confirm who you are",
  email: "Share your email address",
  profile: "Share your basic profile",
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // SSR has no browser session and would redirect signed-in users.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its authorization code.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    return { email: data.session.user.email ?? "" };
  },
  loaderDeps: ({ search }) => ({ id: search.authorization_id }),
  loader: async ({ deps }) => {
    const { data, error } = await oauth().getAuthorizationDetails(deps.id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  head: () => ({
    meta: [
      { title: "Connect an assistant — PharmaStock" },
      { name: "description", content: "Approve or cancel an AI assistant's access to your PharmaStock account." },
      { property: "og:title", content: "Connect an assistant — PharmaStock" },
      { property: "og:description", content: "Approve or cancel an AI assistant's access to your PharmaStock account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  pendingComponent: () => (
    <AuthLayout>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading connection request…
      </div>
    </AuthLayout>
  ),
  errorComponent: ({ error }) => (
    <AuthLayout>
      <div role="alert" className="space-y-2">
        <h1 className="text-2xl font-semibold">Connection request unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This request may have expired or already been used. Start the connection again from your assistant.
        </p>
        <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    </AuthLayout>
  ),
  component: Consent,
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const { email } = Route.useRouteContext();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "An assistant";
  const redirectUri = details?.redirect_uri ?? details?.client?.redirect_uri ?? details?.client?.uri;
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(" ").filter(Boolean) : []);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    try {
      const { data, error: err } = approve
        ? await oauth().approveAuthorization(authorization_id)
        : await oauth().denyAuthorization(authorization_id);
      if (err) throw new Error(err.message);
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) throw new Error("No return address was provided for this connection.");
      window.location.href = target;
    } catch (e) {
      setBusy(null);
      setError(`${approve ? "Could not approve" : "Could not cancel"} the connection: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <AuthLayout>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Assistant connection</p>
          <h1 className="mt-1 text-2xl font-semibold">Connect {clientName} to PharmaStock</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This lets {clientName} use PharmaStock as you{email ? ` (${email})` : ""}.
          </p>
        </div>
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          <p>{clientName} will be able to look up medicines, stock levels, alerts, transactions and reports that your role can already see.</p>
          {scopes.length > 0 && (
            <ul className="space-y-1 text-muted-foreground">
              {scopes.map((s) => (
                <li key={s}>• {SCOPE_LABEL[s] ?? `Additional permission requested: ${s}`}</li>
              ))}
            </ul>
          )}
          {redirectUri && <p className="break-all text-xs text-muted-foreground">Returns to: {redirectUri}</p>}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            This does not bypass your role's permissions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="h-10 flex-1" disabled={busy !== null} onClick={() => decide(true)}>
            {busy === "approve" && <Loader2 className="h-4 w-4 animate-spin" />} Approve
          </Button>
          <Button variant="outline" className="h-10 flex-1" disabled={busy !== null} onClick={() => decide(false)}>
            {busy === "deny" && <Loader2 className="h-4 w-4 animate-spin" />} Cancel connection
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
