import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordChecklist, PasswordInput } from "@/components/auth/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { createFirstAdmin, getSetupStatus, registerAccount, signInWithUsername } from "@/lib/auth.functions";
import { isStrongPassword } from "@/lib/password";
import { oauthReturnPath } from "@/lib/oauth-return-path";

const setupQuery = queryOptions({ queryKey: ["setup-status"], queryFn: () => getSetupStatus() });

export const Route = createFileRoute("/auth")({
  // Optional return path (e.g. an assistant connection consent page) to open after sign-in.
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s["next"] === "string" ? { next: s["next"] } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(setupQuery),
  head: () => ({
    meta: [
      { title: "Sign in — PharmaStock" },
      { name: "description", content: "Staff sign-in for the PharmaStock pharmacy medicine stock system." },
      { property: "og:title", content: "Sign in — PharmaStock" },
      { property: "og:description", content: "Staff sign-in for the PharmaStock pharmacy medicine stock system." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { data } = useSuspenseQuery(setupQuery);
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const returnTo = next ? oauthReturnPath(next) : null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      if (!s.session) return;
      if (returnTo && returnTo !== "/") navigate({ href: returnTo, replace: true });
      else navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate, returnTo]);

  const [mode, setMode] = useState<"login" | "register">("login");
  if (data.needsSetup) return <AuthLayout><SetupForm /></AuthLayout>;
  return (
    <AuthLayout>
      {mode === "login" ? <LoginForm returnTo={returnTo} /> : <RegisterForm onDone={() => setMode("login")} />}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Create account" : "Sign in"}
        </button>
      </p>
    </AuthLayout>
  );
}

function LoginForm({ returnTo }: { returnTo: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = useServerFn(signInWithUsername);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Enter your username and password");
      return;
    }
    setBusy(true);
    try {
      const res = await signIn({ data: { username, password } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (sessionError) throw sessionError;
      queryClient.removeQueries({ queryKey: ["me"] });
      if (returnTo && returnTo !== "/") navigate({ href: returnTo, replace: true });
      else navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("Could not sign in right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Staff sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use the username your administrator gave you.</p>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="h-10"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" value={password} onChange={setPassword} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="h-10 flex-1" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() => {
            setUsername("");
            setPassword("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SetupForm() {
  const [form, setForm] = useState({ full_name: "", username: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createFirstAdmin);
  const queryClient = useQueryClient();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isStrongPassword(form.password)) {
      setError("Choose a stronger password");
      return;
    }
    setBusy(true);
    try {
      const res = await create({ data: form });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Administrator created", { description: "Sign in with your new username." });
      await queryClient.invalidateQueries({ queryKey: ["setup-status"] });
    } catch (err) {
      setError(err instanceof Error ? firstZodMessage(err.message) : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">First-time setup</p>
        <h1 className="mt-1 text-2xl font-semibold">Create the administrator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This account manages medicines, staff and audits. It can only be created once.
        </p>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" className="h-10" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="su-username">Username</Label>
          <Input id="su-username" className="h-10" value={form.username} onChange={(e) => set("username")(e.target.value)} autoComplete="username" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-email">Email</Label>
          <Input id="su-email" type="email" className="h-10" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-password">Password</Label>
        <PasswordInput id="su-password" value={form.password} onChange={set("password")} autoComplete="new-password" />
        <PasswordChecklist password={form.password} />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create administrator
      </Button>
    </form>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ full_name: "", username: "", email: "", password: "", role: "pharmacist" as "pharmacist" | "storekeeper" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = useServerFn(registerAccount);
  const set = (k: "full_name" | "username" | "email" | "password") => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isStrongPassword(form.password)) {
      setError("Choose a stronger password");
      return;
    }
    setBusy(true);
    try {
      const res = await register({ data: form });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Account created", { description: "Sign in with your new username." });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? firstZodMessage(err.message) : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Register as a Pharmacist or Storekeeper.</p>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="rg-name">Full name</Label>
        <Input id="rg-name" className="h-10" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rg-username">Username</Label>
          <Input id="rg-username" className="h-10" value={form.username} onChange={(e) => set("username")(e.target.value)} autoComplete="username" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rg-email">Email</Label>
          <Input id="rg-email" type="email" className="h-10" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["pharmacist", "storekeeper"] as const).map((r) => (
            <Button key={r} type="button" variant={form.role === r ? "default" : "outline"} className="h-10 capitalize" onClick={() => setForm((f) => ({ ...f, role: r }))}>
              {r}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="rg-password">Password</Label>
        <PasswordInput id="rg-password" value={form.password} onChange={set("password")} autoComplete="new-password" />
        <PasswordChecklist password={form.password} />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
      </Button>
    </form>
  );
}

function firstZodMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { message?: string }[];
    return parsed[0]?.message ?? raw;
  } catch {
    return raw;
  }
}
