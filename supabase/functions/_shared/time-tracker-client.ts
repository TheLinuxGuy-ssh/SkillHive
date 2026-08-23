// Unified client for Wakatime + Hackatime. Both expose a Wakatime-compatible
// REST API, so only the base URL differs — auth and payload shapes are shared.
//
// Data strategy (v1, no heartbeat-level access needed):
//   - projects:      GET /users/current/projects
//   - all-time:      GET /users/current/all_time_since_today?project=<name>
//   - daily split:   GET /users/current/summaries?start&end  (one call per day
//                    window, covers ALL projects; per-project seconds come from
//                    data[].projects[], languages are day-level and get
//                    distributed across that day's active projects by share of
//                    tracked time — good enough for breakdowns without one
//                    request per project per language).

import type {
  DayStat,
  LanguageStat,
  TrackedProject,
  TrackerProvider,
  WakaAllTime,
  WakaProject,
  WakaSummaryEntry,
} from "../_shared/types.ts";
import { PROVIDER_BASE_URLS } from "../_shared/types.ts";

const LOOKBACK_DAYS = 90;

export class TimeTrackerClient {
  private base: string;
  private key: string;

  constructor(provider: TrackerProvider, apiKey: string) {
    this.base = PROVIDER_BASE_URLS[provider];
    this.key = apiKey;
  }

  /** True if the API key authenticates successfully. */
  async testConnection(): Promise<boolean> {
    const res = await this.get("/users/current");
    return res.ok;
  }

  async listProjects(): Promise<WakaProject[]> {
    const res = await this.get("/users/current/projects");
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.data) ? (body.data as WakaProject[]) : [];
  }

  async getAllTimeSeconds(projectName: string): Promise<number | null> {
    const url =
      `/users/current/all_time_since_today?project=${encodeURIComponent(projectName)}`;
    const res = await this.get(url);
    if (!res.ok) return null;
    const body = (await res.json()) as WakaAllTime;
    const raw = body?.data?.total_seconds;
    if (raw == null) return null;
    return typeof raw === "string" ? Number(raw) : raw;
  }

  /**
   * Daily summaries for the last N days covering every project at once.
   * Returns per-day per-project seconds; languages are distributed to each
   * day's active projects proportionally to their share of that day's time.
   */
  async getDailyBreakdown(
    projectName: string,
    days = LOOKBACK_DAYS,
  ): Promise<{ daily: DayStat[]; languages: LanguageStat[] }> {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const url =
      `/users/current/summaries?start=${iso(start)}&end=${iso(end)}`;
    const res = await this.get(url);
    if (!res.ok) return { daily: [], languages: [] };
    const body = await res.json();
    const entries = (Array.isArray(body?.data) ? body.data : []) as WakaSummaryEntry[];

    const daily: DayStat[] = [];
    const langTotals = new Map<string, number>();
    let langTotalSum = 0;

    for (const entry of entries) {
      // Range endpoint returns one entry per day; derive date from grand_total
      // position when possible, falling back to sequential dates from `start`.
      const idx = entries.indexOf(entry);
      const date = iso(new Date(start.getTime() + idx * 86_400_000)).slice(0, 10);

      const mine = entry.projects?.find((p) => p.name === projectName);
      const daySeconds = mine?.total_seconds ?? 0;
      if (daySeconds > 0) daily.push({ date, seconds: Math.round(daySeconds) });

      // Distribute day-level languages across active projects by share.
      const dayLangs = entry.languages ?? [];
      const dayTotal = entry.grand_total?.total_seconds ?? 0;
      if (daySeconds > 0 && dayTotal > 0 && dayLangs.length > 0) {
        const share = daySeconds / dayTotal;
        for (const l of dayLangs) {
          const secs = (l.total_seconds ?? 0) * share;
          if (secs <= 0) continue;
          langTotals.set(l.name, (langTotals.get(l.name) ?? 0) + secs);
          langTotalSum += secs;
        }
      }
    }

    const languages: LanguageStat[] = [...langTotals.entries()]
      .map(([name, total]) => ({ name, total_seconds: Math.round(total) }))
      .sort((a, b) => b.total_seconds - a.total_seconds);

    void langTotalSum;
    return { daily, languages };
  }

  /** Fetch everything we cache about one project in as few calls as possible. */
  async fetchProject(name: string): Promise<TrackedProject | null> {
    const [allTime, breakdown] = await Promise.all([
      this.getAllTimeSeconds(name),
      this.getDailyBreakdown(name),
    ]);
    if (allTime == null && breakdown.daily.length === 0) return null;

    const lastDay = breakdown.daily.at(-1)?.date ?? null;
    return {
      tracker_project_id: name,
      name,
      total_seconds: allTime ??
        breakdown.daily.reduce((acc, d) => acc + d.seconds, 0),
      languages: breakdown.languages,
      daily: breakdown.daily,
      last_coded_at: lastDay ? `${lastDay}T00:00:00Z` : null,
    };
  }

  private async get(path: string): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      headers: {
        Authorization: `Basic ${btoa(this.key)}`,
        "User-Agent": "skillhive-sync/1.0",
      },
    });
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
