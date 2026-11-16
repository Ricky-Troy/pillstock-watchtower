import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordChecklist, PasswordInput } from "@/components/auth/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { isStrongPassword } from "@/lib/password";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — PharmaStock" },
      { name: "description", content: "Set a new password for your PharmaStock staff account." },
      { property: "og:title", content: "Choose a new password — PharmaStock" },
      { property: "og:description", content: "Set a new password for your PharmaStock staff account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      setReady((r) => r ?? (s.session ? true : isRecovery ? null : false));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isStrongPassword(password)) { setError("Choose a stronger password"); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    await supabase.rpc("log_auth_event", { _event: "PASSWORD_RESET" });
    await supabase.auth.signOut();
    toast.success("Password updated", { description: "Sign in with your new password." });
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AuthLayout>
      {ready === false ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Link expired</h1>
          <p className="text-sm text-muted-foreground">This reset link is invalid or has expired. Request a new one.</p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Choose a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">You'll sign in with it next time.</p>
          </div>
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordChecklist password={password} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={busy || ready === null}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
