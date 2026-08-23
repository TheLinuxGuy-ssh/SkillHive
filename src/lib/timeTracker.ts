import { supabase } from "./supabase";

/** "47h 23m" / "23m" / "0m" from seconds. */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type TrackerProvider = "wakatime" | "hackatime";

export interface TrackerLanguageStat {
  name: string;
  total_seconds: number;
}

export interface TrackerDayStat {
  date: string; // YYYY-MM-DD
  seconds: number;
}

export interface TrackerConnectionInfo {
  provider: TrackerProvider;
  status: "active" | "error" | "disabled";
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

/** A project synced from the user's tracker (picker modal rows). */
export interface TrackerProject {
  tracker_project_id: string;
  name: string;
  total_seconds: number;
  languages: TrackerLanguageStat[];
  last_coded_at: string | null;
}

export interface ProjectMapping {
  tracker_project_id: string;
  name: string | null;
  total_seconds: number | null;
}

export interface ProjectCodingTime {
  total_seconds: number;
  language_breakdown: TrackerLanguageStat[];
  last_coded_at: string | null;
  is_public: boolean;
}

export interface UserCodingTime {
  total_seconds: number;
  language_breakdown: TrackerLanguageStat[];
  daily_breakdown: TrackerDayStat[];
  current_streak_days: number;
  longest_streak_days: number;
  last_coded_at: string | null;
  is_public: boolean;
}

// ── Connection management (owner only) ─────────────────────────────────────

export async function fetchMyConnection(): Promise<TrackerConnectionInfo | null> {
  try {
    const { data, error } = await supabase.rpc("get_my_tracker_connection");
    if (error || !data || !Array.isArray(data) || data.length === 0) return null;
    const r = data[0] as Record<string, unknown>;
    return {
      provider: (r.provider as TrackerProvider) ?? "wakatime",
      status: (r.status as TrackerConnectionInfo["status"]) ?? "active",
      last_sync_at: (r.last_sync_at as string) ?? null,
      last_error: (r.last_error as string) ?? null,
      created_at: String(r.created_at ?? ""),
    };
  } catch {
    return null;
  }
}

export async function saveTrackerConnection(
  provider: TrackerProvider,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const trimmed = apiKey.trim();
    if (!trimmed) return { ok: false, error: "API key is empty" };
    const { error } = await supabase.rpc("save_tracker_connection", {
      p_provider: provider,
      p_api_key: trimmed,
    });
    if (error) {
      // PostgREST answers 404/PGRST202 for functions that don't exist yet.
      const missing =
        error.code === "PGRST202" || /could not find the function/i.test(error.message);
      return {
        ok: false,
        error: missing
          ? "Database migration not applied yet — run 20260823000000_time_trackers.sql first."
          : error.message,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteTrackerConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("delete_tracker_connection");
    return !error;
  } catch {
    return false;
  }
}

/**
 * Kick the sync engine for the signed-in user. Hits the SkillHive backend
 * (same server that issues LiveKit tokens), which verifies the Supabase JWT;
 * debounced server-side unless force=true.
 */
export async function triggerSync(
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, error: "Session expired" };

    const base =
      (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
      "https://api.skillhivelabs.com";

    const res = await fetch(
      `${base}/sync-time-trackers${force ? "?force=1" : ""}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (res.ok) return { ok: true };
    if (res.status === 404) {
      return {
        ok: false,
        error: "Sync endpoint not live yet — deploy the updated backend server.",
      };
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? `sync failed (HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Picker + mapping management ────────────────────────────────────────────

export async function fetchMyTrackerProjects(): Promise<TrackerProject[]> {
  try {
    const { data, error } = await supabase.rpc("get_my_tracker_projects");
    if (error || !data) return [];
    return (data as unknown as TrackerProject[]).map((p) => ({
      ...p,
      languages: Array.isArray(p.languages) ? p.languages : [],
    }));
  } catch {
    return [];
  }
}

export async function fetchProjectMappings(
  projectId: string,
): Promise<ProjectMapping[]> {
  try {
    const { data, error } = await supabase.rpc("get_project_tracker_mappings", {
      p_project_id: projectId,
    });
    if (error || !data) return [];
    return data as unknown as ProjectMapping[];
  } catch {
    return [];
  }
}

export async function linkTrackerProjects(
  projectId: string,
  trackerProjectIds: string[],
): Promise<boolean> {
  try {
    if (trackerProjectIds.length === 0) return true;
    const { error } = await supabase.rpc("link_tracker_projects", {
      p_skillhive_project_id: projectId,
      p_tracker_project_ids: trackerProjectIds,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function unlinkTrackerProjects(
  projectId: string,
  trackerProjectId?: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("unlink_tracker_projects", {
      p_skillhive_project_id: projectId,
      p_tracker_project_id: trackerProjectId ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}

// ── Visibility toggles ─────────────────────────────────────────────────────

export async function setProjectCodingVisibility(
  projectId: string,
  isPublic: boolean,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("set_project_coding_visibility", {
      p_project_id: projectId,
      p_is_public: isPublic,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function setMyCodingStatsVisibility(
  isPublic: boolean,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("set_my_coding_stats_visibility", {
      p_is_public: isPublic,
    });
    return !error;
  } catch {
    return false;
  }
}

// ── Readers (public where owner opted in) ──────────────────────────────────

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function fetchProjectCodingTime(
  projectId: string,
): Promise<ProjectCodingTime | null> {
  try {
    const { data, error } = await supabase.rpc("get_project_coding_time", {
      p_project_id: projectId,
    });
    if (error || !data || !Array.isArray(data) || data.length === 0) return null;
    const r = data[0] as Record<string, unknown>;
    return {
      total_seconds: Number(r.total_seconds ?? 0),
      language_breakdown: parseJsonArray<TrackerLanguageStat>(
        r.language_breakdown,
      ),
      last_coded_at: (r.last_coded_at as string) ?? null,
      is_public: Boolean(r.is_public),
    };
  } catch {
    return null;
  }
}

export async function fetchUserCodingTime(
  userId: string,
): Promise<UserCodingTime | null> {
  try {
    const { data, error } = await supabase.rpc("get_user_coding_time", {
      p_user_id: userId,
    });
    if (error || !data || !Array.isArray(data) || data.length === 0) return null;
    const r = data[0] as Record<string, unknown>;
    return {
      total_seconds: Number(r.total_seconds ?? 0),
      language_breakdown: parseJsonArray<TrackerLanguageStat>(
        r.language_breakdown,
      ),
      daily_breakdown: parseJsonArray<TrackerDayStat>(r.daily_breakdown),
      current_streak_days: Number(r.current_streak_days ?? 0),
      longest_streak_days: Number(r.longest_streak_days ?? 0),
      last_coded_at: (r.last_coded_at as string) ?? null,
      is_public: Boolean(r.is_public),
    };
  } catch {
    return null;
  }
}
