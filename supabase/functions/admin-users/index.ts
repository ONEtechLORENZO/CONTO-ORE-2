// ============================================================
//  admin-users — Supabase Edge Function
//  Lets an ADMIN create / reset / deactivate / delete logins.
//  The service-role key never leaves the server.
//
//  Deploy:  Supabase Dashboard → Edge Functions → Deploy a new function
//           name: admin-users   → paste this file → Deploy
//     or:   supabase functions deploy admin-users
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // Works with both key systems (all auto-injected by Supabase):
  //  - SUPABASE_SECRET_KEYS: JSON dictionary of new "secret" API keys
  //  - SUPABASE_SERVICE_ROLE_KEY: legacy service_role key (deprecated)
  let SERVICE_KEY = "";
  try {
    const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const first = Object.values(dict).find((v) => typeof v === "string" && v.startsWith("sb_secret_"));
    if (first) SERVICE_KEY = first as string;
  } catch { /* ignore */ }
  if (!SERVICE_KEY) SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SECRET_KEY") || "";
  if (!SERVICE_KEY) return json({ error: "Chiave server mancante: aggiungi SB_SECRET_KEY nei Secrets della funzione" }, 500);

  // Privileged client (never exposed to the browser)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Who is calling? Verify the caller's own access token.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non autenticato" }, 401);
  const { data: { user }, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !user) return json({ error: "Non autenticato" }, 401);

  const { data: me } = await admin
    .from("profiles").select("role, active").eq("id", user.id).single();
  if (!me || me.role !== "admin" || !me.active) {
    return json({ error: "Solo gli admin possono gestire gli utenti" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }

  try {
    switch (body.action) {
      // ---------------------------------------------------------
      case "create": {
        const username = String(body.username || "").trim().toUpperCase();
        const full_name = String(body.full_name || "").trim();
        const password = String(body.password || "");
        const role = body.role === "admin" ? "admin" : "member";
        const domain = String(body.email_domain || "onetech.local").trim();
        if (!/^[A-Z0-9_.-]{2,32}$/.test(username)) return json({ error: "Username non valido (solo lettere/numeri, 2-32 caratteri)" }, 400);
        if (!full_name) return json({ error: "Nome completo obbligatorio" }, 400);
        if (password.length < 6) return json({ error: "Password: minimo 6 caratteri" }, 400);

        const { data, error } = await admin.auth.admin.createUser({
          email: `${username.toLowerCase()}@${domain}`,
          password,
          email_confirm: true,
          user_metadata: {
            username, full_name, role,
            color_bg: body.color_bg, color_tx: body.color_tx,
          },
        });
        if (error) throw error;
        return json({ ok: true, id: data.user.id });
      }
      // ---------------------------------------------------------
      case "reset_password": {
        const password = String(body.password || "");
        if (!body.user_id) return json({ error: "user_id mancante" }, 400);
        if (password.length < 6) return json({ error: "Password: minimo 6 caratteri" }, 400);
        const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
        if (error) throw error;
        return json({ ok: true });
      }
      // ---------------------------------------------------------
      case "set_active": {
        if (!body.user_id) return json({ error: "user_id mancante" }, 400);
        if (body.user_id === user.id && body.active === false) return json({ error: "Non puoi disattivare te stesso" }, 400);
        const active = !!body.active;
        // Ban blocks login at the auth layer; profiles.active blocks data access via RLS.
        const { error: e1 } = await admin.auth.admin.updateUserById(body.user_id, {
          ban_duration: active ? "none" : "876000h",
        });
        if (e1) throw e1;
        const { error: e2 } = await admin.from("profiles").update({ active }).eq("id", body.user_id);
        if (e2) throw e2;
        return json({ ok: true });
      }
      // ---------------------------------------------------------
      case "set_role": {
        if (!body.user_id) return json({ error: "user_id mancante" }, 400);
        const role = body.role === "admin" ? "admin" : "member";
        if (body.user_id === user.id && role !== "admin") return json({ error: "Non puoi togliere il ruolo admin a te stesso" }, 400);
        const { error } = await admin.from("profiles").update({ role }).eq("id", body.user_id);
        if (error) throw error;
        return json({ ok: true });
      }
      // ---------------------------------------------------------
      case "delete": {
        if (!body.user_id) return json({ error: "user_id mancante" }, 400);
        if (body.user_id === user.id) return json({ error: "Non puoi eliminare te stesso" }, 400);
        // Cascades: auth.users → profiles → time_entries
        const { error } = await admin.auth.admin.deleteUser(body.user_id);
        if (error) throw error;
        return json({ ok: true });
      }
      // ---------------------------------------------------------
      default:
        return json({ error: "Azione sconosciuta" }, 400);
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = /already|exists|registered/i.test(msg) ? 409 : 500;
    return json({ error: msg }, status);
  }
});
