import { supabase } from "./supabase";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
}

export interface ProjectWithStats extends Project {
  total_minutes: number;
  total_sessions: number;
}

export interface HeatmapDay {
  day: string; // YYYY-MM-DD
  minutes: number;
  sessions: number;
}

export interface FocusStats {
  total_minutes: number;
  total_sessions: number;
  days_active: number;
  last_7d_minutes: number;
  current_streak: number;
}

export interface ShippedNote {
  id: string;
  body: string;
  blockers: string | null;
  actual_min: number | null;
  created_at: string;
}

export interface ProjectSummary {
  name: string;
  description: string | null;
  created_at: string;
  owner_username: string | null;
  total_minutes: number;
  total_sessions: number;
  shipped_count: number;
}

// ── Offline write-queue ────────────────────────────────────────────────────

const QUEUE_KEY = "skillhive:today-sync-queue";

type QueueItem =
  | { kind: "session"; payload: Record<string, unknown>; ts: number }
  | { kind: "note"; payload: Record<string, unknown>; ts: number };

function readQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueueItem[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function enqueue(item: QueueItem) {
  writeQueue([...readQueue(), item]);
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function currentUserId(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function pushItem(item: QueueItem): Promise<boolean> {
  try {
    const table = item.kind === "session" ? "focus_sessions" : "session_notes";
    const { error } = await supabase.from(table).insert(item.payload);
    return !error;
  } catch {
    return false;
  }
}

/** Flush any queued offline writes. Safe to call repeatedly; idempotent. */
export async function flushSyncQueue(): Promise<void> {
  if (typeof window === "undefined" || !isOnline()) return;
  const items = readQueue();
  if (items.length === 0) return;
  const remaining: QueueItem[] = [];
  for (const item of items) {
    const ok = await pushItem(item);
    if (!ok) remaining.push(item);
  }
  writeQueue(remaining);
}

export function pendingSyncCount(): number {
  return readQueue().length;
}

// ── Writers ────────────────────────────────────────────────────────────────

export interface SessionInput {
  project_id?: string | null;
  task_text?: string | null;
  estimate_min?: number | null;
  duration_seconds: number;
  interrupted?: boolean;
  completed_at?: string;
}

export interface NoteInput {
  project_id?: string | null;
  ritual_type: "checkin" | "checkout" | "capture" | "weekly_review";
  body: string;
  blockers?: string | null;
  actual_min?: number | null;
}

export async function saveSession(input: SessionInput): Promise<void> {
  const user_id = await currentUserId();
  if (!user_id) return;
  const payload = {
    user_id,
    project_id: input.project_id ?? null,
    task_text: input.task_text ?? null,
    estimate_min: input.estimate_min ?? null,
    duration_seconds: input.duration_seconds,
    interrupted: input.interrupted ?? false,
    completed_at: input.completed_at ?? new Date().toISOString(),
  };
  const item: QueueItem = { kind: "session", payload, ts: Date.now() };
  if (!isOnline() || !(await pushItem(item))) enqueue(item);
}

export async function saveNote(input: NoteInput): Promise<void> {
  const user_id = await currentUserId();
  if (!user_id) return;
  const payload = {
    user_id,
    project_id: input.project_id ?? null,
    ritual_type: input.ritual_type,
    body: input.body,
    blockers: input.blockers ?? null,
    actual_min: input.actual_min ?? null,
  };
  const item: QueueItem = { kind: "note", payload, ts: Date.now() };
  if (!isOnline() || !(await pushItem(item))) enqueue(item);
}

/** Find-or-create a project by name, returning its id (null if unavailable). */
export async function ensureProject(
  name: string,
  description?: string,
): Promise<string | null> {
  const user_id = await currentUserId();
  if (!user_id) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  try {
    const { data } = await supabase
      .from("today_projects")
      .select("id")
      .eq("user_id", user_id)
      .eq("name", trimmed)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
    const { data: inserted, error } = await supabase
      .from("today_projects")
      .insert({ user_id, name: trimmed, description })
      .select("id")
      .single();
    if (error) return null;
    return inserted?.id ?? null;
  } catch {
    return null;
  }
}

export async function fetchMyProjects(): Promise<Project[]> {
  const user_id = await currentUserId();
  if (!user_id) return [];
  try {
    const { data, error } = await supabase
      .from("today_projects")
      .select("id, name, description, color, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data as Project[]) ?? [];
  } catch {
    return [];
  }
}

// ── Readers (aggregate RPCs — public/anon safe) ───────────────────────────

export async function fetchHeatmap(
  userId: string,
  days = 365,
): Promise<HeatmapDay[]> {
  try {
    const { data, error } = await supabase.rpc("get_focus_heatmap", {
      p_user_id: userId,
      p_days: days,
    });
    if (error) return [];
    return (data as HeatmapDay[]) ?? [];
  } catch {
    return [];
  }
}

export async function fetchFocusStats(
  userId: string,
): Promise<FocusStats | null> {
  try {
    const { data, error } = await supabase.rpc("get_focus_stats", {
      p_user_id: userId,
    });
    if (error || !data || !Array.isArray(data) || data.length === 0) return null;
    const r = data[0] as Record<string, number>;
    return {
      total_minutes: Number(r.total_minutes ?? 0),
      total_sessions: Number(r.total_sessions ?? 0),
      days_active: Number(r.days_active ?? 0),
      last_7d_minutes: Number(r.last_7d_minutes ?? 0),
      current_streak: Number(r.current_streak ?? 0),
    };
  } catch {
    return null;
  }
}

export async function fetchRecentShipped(
  userId: string,
  limit = 10,
): Promise<ShippedNote[]> {
  try {
    const { data, error } = await supabase.rpc("get_recent_shipped", {
      p_user_id: userId,
      p_limit: limit,
    });
    if (error) return [];
    return (data as ShippedNote[]) ?? [];
  } catch {
    return [];
  }
}

export async function fetchUserProjects(
  userId: string,
): Promise<ProjectWithStats[]> {
  try {
    const { data, error } = await supabase.rpc("get_user_projects", {
      p_user_id: userId,
    });
    if (error) return [];
    return (data as ProjectWithStats[]) ?? [];
  } catch {
    return [];
  }
}

export async function fetchProjectSummary(
  projectId: string,
): Promise<ProjectSummary | null> {
  try {
    const { data, error } = await supabase.rpc("get_project_summary", {
      p_project_id: projectId,
    });
    if (error || !data || !Array.isArray(data) || data.length === 0) return null;
    const r = data[0] as Record<string, unknown>;
    return {
      name: String(r.name ?? "Untitled"),
      description: (r.description as string) ?? null,
      created_at: String(r.created_at ?? ""),
      owner_username: (r.owner_username as string) ?? null,
      total_minutes: Number(r.total_minutes ?? 0),
      total_sessions: Number(r.total_sessions ?? 0),
      shipped_count: Number(r.shipped_count ?? 0),
    };
  } catch {
    return null;
  }
}

export interface PublicProfile {
  id: string;
  username: string | null;
  displayname: string | null;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
}

export async function fetchPublicProfile(
  username: string,
): Promise<PublicProfile | null> {
  try {
    const { data, error } = await supabase.rpc("get_public_profile", {
      p_username: username,
    });
    if (error || !data || !Array.isArray(data) || data.length === 0) return null;
    return data[0] as PublicProfile;
  } catch {
    return null;
  }
}

export async function fetchProjectShipped(
  projectId: string,
  limit = 50,
): Promise<ShippedNote[]> {
  try {
    const { data, error } = await supabase.rpc("get_project_shipped", {
      p_project_id: projectId,
      p_limit: limit,
    });
    if (error) return [];
    return (data as ShippedNote[]) ?? [];
  } catch {
    return [];
  }
}
