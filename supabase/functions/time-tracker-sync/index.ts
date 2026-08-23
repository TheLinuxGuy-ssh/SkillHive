// SkillHive time-tracker sync engine.
//
// Triggers:
//   1. Daily cron (03:00 UTC)  — header: x-cron-secret: $CRON_SECRET
//      Syncs every active connection.
//   2. Manual (per user)       — header: Authorization: Bearer <supabase jwt>
//      Syncs only the caller's connection; debounced to once per 5 minutes
//      unless ?force=1.
//
// Per connection it fetches projects from Wakatime/Hackatime, upserts raw
// rows into time_tracker_projects_raw, then runs reaggregate_tracker_time to
// refresh project_coding_time + user_coding_stats.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TimeTrackerClient } from "../_shared/time-tracker-client.ts";
import type { TrackerProvider, TrackedProject } from "../_shared/types.ts";

const MANUAL_DEBOUNCE_MS = 5 * 60 * 1000;

interface ConnectionRow {
  user_id: string;
  provider: TrackerProvider;
  api_key: string;
  last_sync_at: string | null;
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron =
    cronSecret != null &&
    req.headers.get("x-cron-secret") === cronSecret;

  // ── Resolve which connections to sync ──────────────────────────────────────
  let connections: ConnectionRow[] = [];

  if (isCron) {
    const { data, error } = await supabaseAdmin
      .from("time_tracker_connections")
      .select("user_id, provider, api_key, last_sync_at")
      .eq("status", "active");
    if (error) return json({ error: error.message }, 500);
    connections = data ?? [];
  } else {
    // Authenticated user path — verify their Supabase JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ error: "invalid session" }, 401);
    }

    const { data, error } = await supabaseAdmin
      .from("time_tracker_connections")
      .select("user_id, provider, api_key, last_sync_at")
      .eq("user_id", userData.user.id);
    if (error) return json({ error: error.message }, 500);
    connections = data ?? [];
  }

  if (connections.length === 0) {
    return json({ synced: 0, results: [] });
  }

  // ── Sync each connection ───────────────────────────────────────────────────
  const results = [];
  for (const conn of connections) {
    if (!isCron && !force && isDebounced(conn.last_sync_at)) {
      results.push({
        connection_user_id: conn.user_id,
        ok: false,
        skipped: true,
        reason: "synced recently (5min debounce)",
      });
      continue;
    }
    results.push(await syncConnection(conn));
  }

  return json({ synced: results.filter((r) => r.ok).length, results });
});

async function syncConnection(
  conn: ConnectionRow,
): Promise<Record<string, unknown>> {
  try {
    const client = new TimeTrackerClient(conn.provider, conn.api_key);
    const valid = await client.testConnection();
    if (!valid) throw new Error("api key rejected by tracker");

    const projects = await client.listProjects();
    let synced = 0;

    for (const p of projects) {
      const tracked: TrackedProject | null = await client.fetchProject(p.name);
      if (!tracked) continue;

      const { error } = await supabaseAdmin
        .from("time_tracker_projects_raw")
        .upsert(
          {
            user_id: conn.user_id,
            connection_id: conn.user_id,
            tracker_project_id: tracked.tracker_project_id,
            name: tracked.name,
            total_seconds: Math.round(tracked.total_seconds),
            languages: tracked.languages,
            daily: tracked.daily,
            last_coded_at: tracked.last_coded_at,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "connection_id,tracker_project_id" },
        );
      if (error) throw new Error(`raw upsert failed: ${error.message}`);
      synced++;
    }

    // Refresh denormalized aggregates.
    const { error: aggError } = await supabaseAdmin.rpc(
      "reaggregate_tracker_time",
      { p_user_id: conn.user_id },
    );
    if (aggError) throw new Error(`reaggregate failed: ${aggError.message}`);

    await supabaseAdmin
      .from("time_tracker_connections")
      .update({ status: "active", last_sync_at: new Date().toISOString(), last_error: null })
      .eq("user_id", conn.user_id);

    return { connection_user_id: conn.user_id, ok: true, projects_synced: synced };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("time_tracker_connections")
      .update({ status: "error", last_error: message })
      .eq("user_id", conn.user_id);
    return { connection_user_id: conn.user_id, ok: false, error: message };
  }
}

function isDebounced(lastSyncAt: string | null): boolean {
  if (!lastSyncAt) return false;
  return Date.now() - new Date(lastSyncAt).getTime() < MANUAL_DEBOUNCE_MS;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
