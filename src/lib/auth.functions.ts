import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { passwordSchema, usernameSchema } from "./password";

const GENERIC_LOGIN_ERROR = "Invalid username or password";

function publishableClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Signs in with a username (or email) and password. Emails are resolved on the server only. */
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ username: z.string().trim().min(1).max(255), password: z.string().min(1).max(128) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ident = data.username.toLowerCase();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, is_active")
      .or(ident.includes("@") ? `email.eq.${ident}` : `username.eq.${ident}`)
      .maybeSingle();

    const logFailure = () =>
      supabaseAdmin.from("activity_logs").insert({
        user_id: profile?.id ?? null,
        user_name: profile?.full_name ?? "Unknown",
        action: "LOGIN_FAILED",
        details: `Failed sign-in attempt for "${ident.slice(0, 64)}"`,
      });

    if (!profile || !profile.is_active) {
      await logFailure();
      return { ok: false as const, error: GENERIC_LOGIN_ERROR };
    }

    const client = publishableClient();
    const { data: auth, error } = await client.auth.signInWithPassword({
      email: profile.email,
      password: data.password,
    });
    if (error || !auth.session) {
      await logFailure();
      return { ok: false as const, error: GENERIC_LOGIN_ERROR };
    }

    await supabaseAdmin.from("activity_logs").insert({
      user_id: profile.id,
      user_name: profile.full_name,
      action: "LOGIN",
      details: "Signed in",
    });

    return {
      ok: true as const,
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
    };
  });

/** True when no administrator exists yet, so the first one can be created. */
export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  return { needsSetup: (count ?? 0) === 0 };
});

const firstAdminSchema = z.object({
  full_name: z.string().trim().min(2, "Enter a full name").max(100),
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  password: passwordSchema,
});

/** Creates the very first administrator. Refuses once any administrator exists. */
export const createFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((input) => firstAdminSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { ok: false as const, error: "An administrator already exists. Please sign in." };

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
      return { ok: false as const, error: error?.message ?? "Could not create the account." };
    }

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: created.user.id, username: data.username, full_name: data.full_name, email: data.email });
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
    await supabaseAdmin.from("activity_logs").insert({
      user_id: created.user.id,
      user_name: data.full_name,
      action: "SETUP",
      details: "Created the first administrator account",
    });
    return { ok: true as const };
  });
