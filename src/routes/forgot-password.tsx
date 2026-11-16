import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — PharmaStock" },
      { name: "description", content: "Get a secure link to reset your PharmaStock staff password." },
      { property: "og:title", content: "Reset your password — PharmaStock" },
      { property: "og:description", content: "Get a secure link to reset your PharmaStock staff password." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthLayout>
      {sent ? (
        <div className="space-y-4">
          <MailCheck className="h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            If <span className="font-medium text-foreground">{email}</span> belongs to a staff account, a reset link is on
            its way. The link expires after a short time.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Forgot password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter the email registered to your staff account.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
          </Button>
          <Link to="/auth" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
