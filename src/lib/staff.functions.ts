import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { passwordSchema, usernameSchema } from "./password";

const roleSchema = z.enum(["admin", "pharmacist", "storekeeper"]);

type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

async function requireAdmin(context: AuthedContext) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Only administrators can manage users.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: me } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).single();
  const log = (action: string, details: string) =>
    supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      user_name: me?.full_name ?? "Administrator",
      action,
      details,
    });
  return { supabaseAdmin, log };
}

async function countActiveAdmins(supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"]) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, profiles!inner(is_active)")
    .eq("role", "admin")
    .eq("profiles.is_active", true);
  return data?.length ?? 0;
}

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        full_name: z.string().trim().min(2, "Enter a full name").max(100),
        username: usernameSchema,
        email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
        password: passwordSchema,
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, log } = await requireAdmin(context);

    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .maybeSingle();
    if (taken) return { ok: false as const, error: "That username is already taken." };

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, full_name: data.full_name },
    });
    if (error || !created.user) {
      const msg = error?.message?.includes("already been registered")
        ? "That email is already registered."
        : (error?.message ?? "Could not create the account.");
      return { ok: false as const, error: msg };
    }
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: created.user.id, username: data.username, full_name: data.full_name, email: data.email });
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: data.role });
    await log("USER_CREATED", `Created ${data.full_name} (@${data.username}) as ${data.role}`);
    return { ok: true as const };
  });

export const updateStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        full_name: z.string().trim().min(2).max(100),
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, log } = await requireAdmin(context);
    const { data: current } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id);
    const wasAdmin = current?.some((r) => r.role === "admin") ?? false;
    if (wasAdmin && data.role !== "admin" && (await countActiveAdmins(supabaseAdmin)) <= 1) {
      return { ok: false as const, error: "You can't remove the last active administrator." };
    }
    await supabaseAdmin.from("profiles").update({ full_name: data.full_name }).eq("id", data.user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    await log("USER_UPDATED", `Updated ${data.full_name}: role ${data.role}`);
    return { ok: true as const };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx: AuthedContext = context;
    if (data.user_id === ctx.userId && !data.active) {
      return { ok: false as const, error: "You can't deactivate your own account." };
    }
    const { supabaseAdmin, log } = await requireAdmin(ctx);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, username")
      .eq("id", data.user_id)
      .single();
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    await supabaseAdmin.from("profiles").update({ is_active: data.active }).eq("id", data.user_id);
    await log(
      data.active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      `${data.active ? "Reactivated" : "Deactivated"} ${profile?.full_name ?? "user"} (@${profile?.username ?? "?"})`,
    );
    return { ok: true as const };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid(), password: passwordSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, log } = await requireAdmin(context);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) return { ok: false as const, error: error.message };
    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", data.user_id).single();
    await log("PASSWORD_RESET_BY_ADMIN", `Reset password for ${profile?.full_name ?? "user"}`);
    return { ok: true as const };
  });
