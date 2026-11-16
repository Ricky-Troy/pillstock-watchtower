import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { Panel } from "@/components/app/Panel";
import { PasswordChecklist, PasswordInput } from "@/components/auth/PasswordField";
import { meQuery, staffQuery, type StaffMember } from "@/lib/queries";
import { isStrongPassword } from "@/lib/password";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { createStaffUser, resetStaffPassword, setStaffActive, updateStaffUser } from "@/lib/staff.functions";
import { formatDateTime } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/_shell/users")({
  loader: ({ context }) => context.queryClient.ensureQueryData(staffQuery),
  head: () => ({
    meta: [
      { title: "Manage users — PharmaStock" },
      { name: "description", content: "Create staff accounts, assign roles and deactivate access." },
      { property: "og:title", content: "Manage users — PharmaStock" },
      { property: "og:description", content: "Create staff accounts, assign roles and deactivate access." },
    ],
  }),
  component: UsersPage,
});

function serverError(err: unknown) {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as { message?: string }[];
      if (parsed[0]?.message) return parsed[0].message;
    } catch {
      /* not a validation error */
    }
    return err.message;
  }
  return "Something went wrong.";
}

const ROLES: Role[] = ["admin", "pharmacist", "storekeeper"];

function UsersPage() {
  const { data: staff } = useSuspenseQuery(staffQuery);
  const { data: me } = useSuspenseQuery(meQuery);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });
  const update = useServerFn(updateStaffUser);
  const setActive = useServerFn(setStaffActive);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeRole(u: StaffMember, role: Role) {
    setBusyId(u.id);
    try {
      const res = await update({ data: { user_id: u.id, full_name: u.full_name, role } });
      if (!res.ok) toast.error(res.error);
      else toast.success(`${u.full_name} is now ${ROLE_LABEL[role]}`);
      await refresh();
    } catch (e) {
      toast.error(serverError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(u: StaffMember, active: boolean) {
    setBusyId(u.id);
    try {
      const res = await setActive({ data: { user_id: u.id, active } });
      if (!res.ok) toast.error(res.error);
      else toast.success(active ? `${u.full_name} reactivated` : `${u.full_name} deactivated`);
      await refresh();
    } catch (e) {
      toast.error(serverError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Manage users" description="Only administrators can see this page. Deactivated staff can no longer sign in." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Panel title="Add staff member" className="h-fit">
          <CreateUserForm onCreated={refresh} />
        </Panel>
        <Panel title="Staff accounts" description={`${staff.filter((s) => s.is_active).length} active of ${staff.length}`}>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((u) => {
                  const self = u.id === me?.userId;
                  return (
                    <TableRow key={u.id} className={u.is_active ? "" : "opacity-60"}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {u.full_name}
                          {self && <Badge variant="muted">You</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          @{u.username} · {u.email}
                        </div>
                        <div className="text-xs text-muted-foreground">Added {formatDateTime(u.created_at)}</div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.role ?? ""}
                          onValueChange={(v) => changeRole(u, v as Role)}
                          disabled={busyId === u.id}
                        >
                          <SelectTrigger className="h-8 w-40" aria-label={`Role for ${u.full_name}`}>
                            <SelectValue placeholder="No role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.is_active}
                          disabled={self || busyId === u.id}
                          onCheckedChange={(v) => toggleActive(u, v)}
                          aria-label={`${u.is_active ? "Deactivate" : "Activate"} ${u.full_name}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
                          <KeyRound className="h-4 w-4" /> Reset
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </div>
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const empty = { full_name: "", username: "", email: "", password: "", role: "pharmacist" as Role };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createStaffUser);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(form.password)) { toast.error("Password doesn't meet the rules"); return; }
    setBusy(true);
    try {
      const res = await create({ data: form });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${form.full_name} can now sign in as @${form.username.trim().toLowerCase()}`);
      setForm(empty);
      onCreated();
    } catch (err) {
      toast.error(serverError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nu-name">Full name</Label>
        <Input id="nu-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required maxLength={100} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="nu-username">Username</Label>
          <Input id="nu-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required maxLength={32} autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
            <SelectTrigger aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="nu-email">Email</Label>
        <Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={255} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nu-password">Temporary password</Label>
        <PasswordInput id="nu-password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} autoComplete="new-password" />
        <PasswordChecklist password={form.password} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create account
      </Button>
    </form>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: StaffMember | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = useServerFn(resetStaffPassword);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!isStrongPassword(password)) { toast.error("Password doesn't meet the rules"); return; }
    setBusy(true);
    try {
      const res = await reset({ data: { user_id: user.id, password } });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Password reset for ${user.full_name}`);
        setPassword("");
        onClose();
      }
    } catch (err) {
      toast.error(serverError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">Set a new password for {user?.full_name}. Share it with them securely.</p>
          <div className="space-y-2">
            <Label htmlFor="rp-password">New password</Label>
            <PasswordInput id="rp-password" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordChecklist password={password} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Set password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
