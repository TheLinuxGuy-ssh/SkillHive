// Shared types for the SkillHive time-tracker integration (Wakatime + Hackatime).

export type TrackerProvider = "wakatime" | "hackatime";

export const PROVIDER_BASE_URLS: Record<TrackerProvider, string> = {
  wakatime: "https://wakatime.com/api/v1",
  hackatime: "https://hackatime.hackclub.com/api/v1",
};

export interface LanguageStat {
  name: string;
  total_seconds: number;
}

export interface DayStat {
  date: string; // YYYY-MM-DD (UTC)
  seconds: number;
}

/** A single tracker project as stored in time_tracker_projects_raw. */
export interface TrackedProject {
  tracker_project_id: string;
  name: string;
  total_seconds: number;
  languages: LanguageStat[];
  daily: DayStat[];
  last_coded_at: string | null;
}

export interface SyncResult {
  connection_user_id: string;
  provider: TrackerProvider;
  projects_synced: number;
  ok: boolean;
  error?: string;
}

// ── Raw API shapes (both providers are Wakatime-compatible) ─────────────────

interface WakaProject {
  id: string | number;
  name: string;
}

interface WakaSummaryEntry {
  grand_total?: { total_seconds?: number };
  projects?: Array<{ name: string; total_seconds?: number }>;
  languages?: Array<{ name: string; total_seconds?: number }>;
}

interface WakaAllTime {
  data?: { total_seconds?: number | string };
}
