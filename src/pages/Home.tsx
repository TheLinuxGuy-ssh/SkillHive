import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Text, Button } from "@/components/ui";
import { Heatmap } from "@/components/ui/Heatmap";
import { useTokens } from "@/theme";
import { useProfile } from "@/hooks/profileContext";
import {
  useToday,
  type TodayTask,
  ESTIMATE_OPTIONS,
  formatMinutes,
} from "@/hooks/useToday";
import { useAmbience, type AmbienceKind } from "@/hooks/useAmbience";
import {
  saveSession,
  saveNote,
  flushSyncQueue,
  fetchMyProjects,
  ensureProject,
  deleteProject,
  fetchFocusStats,
  fetchHeatmap,
  fetchUserProjects,
  fetchRecentShipped,
  type FocusStats,
  type HeatmapDay,
  type ProjectWithStats,
  type ShippedNote,
  type Project,
} from "@/lib/todayData";
import {
  Play,
  Pause,
  RotateCcw,
  X,
  Check,
  Trash2,
  Plus,
  CloudRain,
  Coffee,
  BellOff,
  GripVertical,
  ChevronLeft,
  ListTodo,
  Clock,
  Sparkles,
  CornerDownLeft,
  Settings,
  Mic,
  MicOff,
  Flame,
  ShieldAlert,
} from "lucide-react";

const CYCLE_SEC = 3600; // 50m focus + 10m break
const FOCUS_SEC = 3000;

function pad2(n: number) {
  return String(Math.floor(n)).padStart(2, "0");
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function useMinWidth(px: number): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= px,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const fn = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [px]);
  return wide;
}

/** Compact weekly-review rail: stats, heatmap, patterns, blockers, shipped. */
function ReviewRail() {
  const { colors, spacing, radii } = useTokens();
  const { profile } = useProfile();

  const [stats, setStats] = useState<FocusStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [shipped, setShipped] = useState<ShippedNote[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    void fetchHeatmap(profile.id, 365).then((h) => !cancelled && setHeatmap(h));
    void fetchFocusStats(profile.id).then((s) => !cancelled && setStats(s));
    void fetchUserProjects(profile.id).then((p) => !cancelled && setProjects(p));
    void fetchRecentShipped(profile.id, 10).then(
      (s) => !cancelled && setShipped(s),
    );
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const week = useMemo(() => {
    const days: HeatmapDay[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const map = new Map(heatmap.map((h) => [h.day, h]));
    for (let i = 0; i < 7; i++) {
      const d = new Date(cutoff);
      d.setDate(cutoff.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push(map.get(key) ?? { day: key, minutes: 0, sessions: 0 });
    }
    return {
      weekMinutes: days.reduce((s, d) => s + d.minutes, 0),
      activeDays: days.filter((d) => d.minutes > 0).length,
    };
  }, [heatmap]);

  const blockers = useMemo(
    () => shipped.filter((s) => s.blockers && s.blockers.trim()),
    [shipped],
  );

  const topProject = useMemo(
    () =>
      projects.reduce<ProjectWithStats | null>(
        (best, p) =>
          best === null || p.total_minutes > best.total_minutes ? p : best,
        null,
      ),
    [projects],
  );

  const avgSession =
    stats && stats.total_sessions > 0
      ? Math.round(stats.total_minutes / stats.total_sessions)
      : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing.base,
      }}
    >
      <Text
        variant="caption"
        tone="tertiary"
        style={{ textTransform: "uppercase", letterSpacing: 2 }}
      >
        This week
      </Text>

      <div style={{ display: "flex", gap: spacing.sm }}>
        <RailStat label="focus" value={formatHours(week.weekMinutes)} />
        <RailStat label="days" value={`${week.activeDays}/7`} />
        <RailStat label="streak" value={`${stats?.current_streak ?? 0}d`} />
      </div>

      <div
        style={{
          background: colors.surface.primary,
          border: `1px solid ${colors.border.subtle}`,
          borderRadius: radii.lg,
          padding: spacing.base,
          display: "flex",
          flexDirection: "column",
          gap: spacing.sm,
        }}
      >
        <Text variant="label" tone="secondary">
          Focus activity
        </Text>
        <Heatmap data={heatmap} weeks={13} cellSize={9} gap={2} />
        <RailRow icon={<ListTodo size={14} />} label="Sessions" value={String(stats?.total_sessions ?? 0)} />
        <RailRow icon={<Clock size={14} />} label="Avg session" value={`${avgSession}m`} />
        <RailRow
          icon={<Flame size={14} />}
          label="Top project"
          value={topProject ? topProject.name : "—"}
        />
      </div>

      {blockers.length > 0 && (
        <div
          style={{
            background: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radii.lg,
            padding: spacing.base,
            display: "flex",
            flexDirection: "column",
            gap: spacing.sm,
          }}
        >
          <Text variant="label" tone="secondary">
            Blockers
          </Text>
          {blockers.slice(0, 3).map((b) => (
            <div key={b.id} style={{ display: "flex", gap: spacing.sm, alignItems: "flex-start" }}>
              <ShieldAlert size={14} color={colors.tint.warning} style={{ marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" tone="secondary" style={{ display: "block" }}>
                  {b.blockers}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {b.body}
                </Text>
              </div>
            </div>
          ))}
        </div>
      )}

      {shipped.length > 0 && (
        <div
          style={{
            background: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radii.lg,
            padding: spacing.base,
            display: "flex",
            flexDirection: "column",
            gap: spacing.sm,
          }}
        >
          <Text variant="label" tone="secondary">
            Recently shipped
          </Text>
          {shipped.slice(0, 4).map((s) => (
            <div key={s.id} style={{ display: "flex", gap: spacing.sm, alignItems: "flex-start" }}>
              <Text variant="caption" tone="secondary" style={{ flex: 1, minWidth: 0 }}>
                {s.body}
              </Text>
              <Text variant="caption" tone="tertiary">
                {s.actual_min ? `${s.actual_min}m` : ""}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h < 1) return `${minutes}m`;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

function RailStat({ label, value }: { label: string; value: string }) {
  const { colors, radii } = useTokens();
  return (
    <div
      style={{
        flex: 1,
        background: colors.surface.primary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.lg,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Text variant="body" tone="skillhive" weight={900} style={{ lineHeight: 1 }}>
        {value}
      </Text>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </div>
  );
}

function RailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const { colors } = useTokens();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: colors.text.tertiary }}>{icon}</span>
      <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="caption" weight={600}>
        {value}
      </Text>
    </div>
  );
}

/** Manage today-projects: list with focus totals, quick create, delete. */
function ProjectsCard() {
  const { colors, spacing, radii } = useTokens();
  const { profile } = useProfile();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    void fetchUserProjects(profile.id).then(
      (p) => !cancelled && setProjects(p),
    );
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || busy || !profile?.id) return;
    setBusy(true);
    const id = await ensureProject(trimmed);
    if (id) {
      const fresh = await fetchUserProjects(profile.id);
      setProjects(fresh);
    }
    setName("");
    setBusy(false);
  }

  async function remove(id: string) {
    setProjects((ps) => ps.filter((p) => p.id !== id));
    await deleteProject(id);
  }

  return (
    <div
      style={{
        background: colors.surface.primary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.lg,
        padding: spacing.base,
        display: "flex",
        flexDirection: "column",
        gap: spacing.sm,
      }}
    >
      <Text variant="label" tone="secondary">
        Projects
      </Text>

      {projects.length === 0 ? (
        <Text variant="bodySm" tone="tertiary">
          No projects yet. Name one below — it becomes taggable when you capture
          a session.
        </Text>
      ) : (
        projects.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              padding: `${spacing.xs}px 0`,
              borderBottom: `1px solid ${colors.border.subtle}`,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  p.color && p.color !== ""
                    ? p.color
                    : colors.surface.skillhive,
                flexShrink: 0,
              }}
            />
            <Text variant="bodySm" weight={600} style={{ flex: 1, minWidth: 0 }}>
              {p.name}
            </Text>
            <Text variant="caption" tone="tertiary">
              {formatHours(p.total_minutes)}
            </Text>
            <IconBtn label={`Delete ${p.name}`} onClick={() => remove(p.id)}>
              <X size={13} />
            </IconBtn>
          </div>
        ))
      )}

      <div style={{ display: "flex", gap: spacing.sm }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="New project name…"
          style={{
            flex: 1,
            minWidth: 0,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radii.md,
            padding: "9px 12px",
            fontSize: 14,
            background: colors.bg.muted,
            color: colors.text.primary,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <Button
          label={busy ? "Adding…" : "Add project"}
          size="sm"
          onClick={() => void add()}
          disabled={busy || !name.trim()}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const today = useToday();
  const { colors, spacing } = useTokens();
  const [mode, setMode] = useState<"intent" | "focus">("intent");
  const wide = useMinWidth(1180);

  useEffect(() => {
    document.body.classList.toggle("focus-mode", mode === "focus");
    return () => document.body.classList.remove("focus-mode");
  }, [mode]);

  useEffect(() => {
    void flushSyncQueue();
    const onOnline = () => void flushSyncQueue();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flushSyncQueue();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Focus mode stays a distraction-free full-screen view (no rail).
  if (mode === "focus") {
    return <FocusView today={today} onExit={() => setMode("intent")} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bg.muted,
        paddingTop: 96,
        paddingBottom: 160,
        fontFamily:
          '"popreg", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: wide ? 1100 : 640,
          margin: "0 auto",
          padding: `0 ${spacing.base}px`,
          display: "flex",
          flexDirection: wide ? "row" : "column",
          alignItems: "flex-start",
          gap: spacing.xl,
        }}
      >
        <div
          style={{
            flex: wide ? "1 1 640px" : undefined,
            minWidth: 0,
            width: "100%",
            maxWidth: wide ? 640 : undefined,
            margin: wide ? undefined : "0 auto",
          }}
        >
          <IntentView today={today} onStartFocus={() => setMode("focus")} />
        </div>
        <aside
          style={{
            width: wide ? 320 : "100%",
            flexShrink: 0,
            position: wide ? "sticky" : undefined,
            top: wide ? 96 : undefined,
          }}
        >
          <ReviewRail />
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────── INTENT PHASE ─────────────────────────── */

function IntentView({
  today,
  onStartFocus,
}: {
  today: ReturnType<typeof useToday>;
  onStartFocus: () => void;
}) {
  const { colors, spacing, radii } = useTokens();
  const { profile } = useProfile();
  const name = profile?.displayname ?? "there";

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const queued = today.tasks.filter((t) => t.status === "queued");
  const done = today.tasks.filter((t) => t.status === "done");
  const carried = today.tasks.filter((t) => t.status === "carried");

  function onDragStart(e: React.PointerEvent, id: string) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingId(id);
  }

  function onDragMove(e: React.PointerEvent, id: string) {
    if (!draggingId) return;
    const container = listRef.current;
    if (!container) return;
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-task-id]"),
    );
    let targetIndex = -1;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        targetIndex = Number(row.dataset.index);
        break;
      }
    }
    if (targetIndex !== -1) today.reorderTask(id, targetIndex);
  }

  function onDragEnd() {
    setDraggingId(null);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing.lg,
        minWidth: 0,
        width: "100%",
      }}
    >
        <div>
          <Text
            variant="caption"
            tone="tertiary"
            style={{
              textTransform: "uppercase",
              letterSpacing: 2,
              display: "block",
              marginBottom: spacing.sm,
            }}
          >
            {dateLabel()}
          </Text>
          <Text
            variant="display"
            weight={900}
            style={{ letterSpacing: -1, lineHeight: 1.05 }}
          >
            {greeting()}, {name}.
          </Text>
          <Text
            variant="title"
            tone="secondary"
            weight={600}
            style={{ display: "block", marginTop: spacing.sm }}
          >
            What must happen today?
          </Text>
        </div>

        {today.carryFrom.length > 0 && (
          <div
            style={{
              background: colors.bg.accentDim,
              border: `1px solid ${colors.surface.skillhive}44`,
              borderRadius: radii.lg,
              padding: spacing.base,
              display: "flex",
              flexDirection: "column",
              gap: spacing.sm,
            }}
          >
            <Text variant="label" tone="skillhive">
              Carried from yesterday ({today.carryFrom.length})
            </Text>
            {today.carryFrom.map((c) => (
              <div
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: spacing.sm }}
              >
                <Text
                  variant="bodySm"
                  tone="secondary"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {c.text}
                  <Text variant="caption" tone="tertiary">
                    {"  "}· {formatMinutes(c.estimateMin)}
                  </Text>
                </Text>
                <Button
                  label="Add"
                  size="sm"
                  variant="secondary"
                  onClick={() => today.addCarry(c.id)}
                />
                <Button
                  label="Dismiss"
                  size="sm"
                  variant="ghost"
                  onClick={() => today.dismissCarry(c.id)}
                />
              </div>
            ))}
          </div>
        )}

        <div
          ref={listRef}
          style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}
        >
          {queued.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              index={i}
              dragging={draggingId === task.id}
              onText={(text) => today.updateTask(task.id, { text })}
              onEstimate={(min) =>
                today.updateTask(task.id, { estimateMin: min })
              }
              onRemove={() => today.removeTask(task.id)}
              onDragStart={(e) => onDragStart(e, task.id)}
              onDragMove={(e) => onDragMove(e, task.id)}
              onDragEnd={onDragEnd}
            />
          ))}
          <NewTaskRow onCommit={today.addTask} />
        </div>

        <Button
          label={queued.length ? "Start focus" : "Plan first"}
          size="lg"
          fullWidth
          icon={<Play size={18} />}
          disabled={queued.length === 0}
          onClick={onStartFocus}
        />

        {(done.length > 0 || carried.length > 0 || today.captures.length > 0) && (
          <div
            style={{
              marginTop: spacing.md,
              display: "flex",
              flexDirection: "column",
              gap: spacing.base,
            }}
          >
            <Text
              variant="caption"
              tone="tertiary"
              style={{ textTransform: "uppercase", letterSpacing: 2 }}
            >
              Review
            </Text>

            <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap" }}>
              <StatChip
                label="done"
                value={today.summary.done}
                icon={<Check size={13} />}
                color={colors.tint.success}
              />
              <StatChip
                label="carried"
                value={today.summary.carried}
                icon={<Clock size={13} />}
                color={colors.tint.warning}
              />
              <StatChip
                label="planned"
                value={formatMinutes(today.summary.estimatedMin)}
                icon={<ListTodo size={13} />}
                color={colors.text.tertiary}
              />
              <StatChip
                label="actual"
                value={formatMinutes(today.summary.actualMin)}
                icon={<Sparkles size={13} />}
                color={colors.surface.skillhive}
              />
              {today.summary.unplanned > 0 && (
                <StatChip
                  label="unplanned"
                  value={today.summary.unplanned}
                  icon={<Sparkles size={13} />}
                  color={colors.tint.accent}
                />
              )}
            </div>

            {done.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  gap: spacing.sm,
                  alignItems: "flex-start",
                  background: colors.surface.primary,
                  border: `1px solid ${colors.border.subtle}`,
                  borderRadius: radii.md,
                  padding: spacing.base,
                }}
              >
                <Check
                  size={16}
                  color={colors.tint.success}
                  style={{ marginTop: 2 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    variant="bodySm"
                    weight={600}
                    style={{ textDecoration: "line-through", opacity: 0.7 }}
                  >
                    {t.text}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {formatMinutes(t.actualMin ?? 0)} actual
                    {t.shipped ? ` · ${t.shipped}` : ""}
                  </Text>
                </div>
              </div>
            ))}

            {carried.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  gap: spacing.sm,
                  alignItems: "center",
                  background: colors.surface.primary,
                  border: `1px solid ${colors.border.subtle}`,
                  borderRadius: radii.md,
                  padding: spacing.base,
                }}
              >
                <Clock size={16} color={colors.tint.warning} />
                <Text variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                  {t.text}
                </Text>
                <Button
                  label="Restore"
                  size="sm"
                  variant="ghost"
                  onClick={() => today.restoreTask(t.id)}
                />
              </div>
            ))}

            {today.captures.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  gap: spacing.sm,
                  alignItems: "center",
                  background: colors.surface.primary,
                  border: `1px solid ${colors.border.subtle}`,
                  borderRadius: radii.md,
                  padding: spacing.base,
                }}
              >
                <Sparkles size={16} color={colors.tint.accent} />
                <Text variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                  {c.text}
                </Text>
                <IconBtn
                  label="Remove capture"
                  onClick={() => today.removeCapture(c.id)}
                >
                  <X size={14} />
                </IconBtn>
              </div>
            ))}
          </div>
        )}

        <ProjectsCard />
      </div>
  );
}

/* ─────────────────────────── FOCUS PHASE ─────────────────────────── */

function FocusView({
  today,
  onExit,
}: {
  today: ReturnType<typeof useToday>;
  onExit: () => void;
}) {
  const { colors, spacing, radii } = useTokens();
  const { kind: ambience, setAmbience } = useAmbience();

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dnd, setDnd] = useState(false);
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [constraints, setConstraints] = useState({
    blockSites: false,
    muteNotifs: false,
    syncStatus: false,
  });
  const [capture, setCapture] = useState<{
    task: TodayTask;
    actualMin: number;
    shipped: string;
    blockers: string;
    projectName: string;
  } | null>(null);

  const [heroStart, setHeroStart] = useState(0);
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);

  const queued = today.tasks.filter((t) => t.status === "queued");
  const hero = queued[0];
  const queue = queued.slice(1);

  useEffect(() => {
    let cancelled = false;
    void fetchMyProjects().then((list) => {
      if (!cancelled) setProjectOptions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, [running]);

  const pos = elapsed % CYCLE_SEC;
  const phase = pos < FOCUS_SEC ? "focus" : "break";
  const remaining = phase === "focus" ? FOCUS_SEC - pos : CYCLE_SEC - pos;
  const progress =
    phase === "focus"
      ? pos / FOCUS_SEC
      : (pos - FOCUS_SEC) / (CYCLE_SEC - FOCUS_SEC);
  const mm = pad2(remaining / 60);
  const ss = pad2(remaining % 60);

  function openCapture() {
    if (!hero) return;
    const mins = Math.max(0, Math.round((elapsed - heroStart) / 60));
    setCapture({
      task: hero,
      actualMin: mins,
      shipped: "",
      blockers: "",
      projectName: "",
    });
  }

  async function saveCapture(breakAfter: boolean) {
    if (!capture) return;
    today.completeTask(capture.task.id, {
      actualMin: capture.actualMin,
      shipped: capture.shipped,
      blockers: capture.blockers,
    });

    const projectId = capture.projectName.trim()
      ? await ensureProject(capture.projectName.trim())
      : null;

    void saveSession({
      task_text: capture.task.text,
      estimate_min: capture.task.estimateMin,
      duration_seconds: Math.max(1, capture.actualMin) * 60,
      project_id: projectId,
    });
    void saveNote({
      ritual_type: "checkout",
      body: capture.shipped.trim() || capture.task.text,
      blockers: capture.blockers.trim() || null,
      actual_min: capture.actualMin,
      project_id: projectId,
    });

    setCapture(null);
    if (breakAfter) {
      setRunning(false);
      onExit();
    } else {
      setHeroStart(elapsed);
    }
  }

  function carryHero() {
    if (!hero) return;
    today.carryTask(hero.id);
    setHeroStart(elapsed);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${colors.bg.elevated}, ${colors.bg.canvas})`,
        display: "flex",
        flexDirection: "column",
        fontFamily:
          '"popreg", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${spacing.lg}px ${spacing.base}px`,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onExit}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: colors.text.secondary,
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 600,
            padding: 0,
          }}
        >
          <ChevronLeft size={18} />
          Exit focus
        </button>
        <PhaseBadge phase={phase} remaining={remaining} />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: `0 ${spacing.base}px ${spacing.base}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 560,
            display: "flex",
            flexDirection: "column",
            gap: spacing.lg,
          }}
        >
          {hero ? (
            <>
              <div
                style={{
                  background: colors.surface.primary,
                  border: `1px solid ${colors.border.subtle}`,
                  borderRadius: radii.xxl,
                  padding: spacing.xxl,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: spacing.lg,
                }}
              >
                <Text
                  variant="caption"
                  tone="tertiary"
                  style={{ letterSpacing: 2, textTransform: "uppercase" }}
                >
                  Main quest
                </Text>
                <Text variant="headline" weight={800} align="center">
                  {hero.text}
                </Text>
                <Text variant="caption" tone="tertiary">
                  ~{formatMinutes(hero.estimateMin)} estimated
                </Text>

                <div style={{ position: "relative", width: 220, height: 220 }}>
                  <TimerRing progress={progress} phase={phase} />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      variant="display"
                      weight={900}
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: -1,
                      }}
                    >
                      {mm}:{ss}
                    </Text>
                    <Text
                      variant="caption"
                      tone="tertiary"
                      style={{ textTransform: "uppercase", letterSpacing: 2 }}
                    >
                      {phase}
                    </Text>
                  </div>
                </div>

                <div style={{ display: "flex", gap: spacing.sm }}>
                  <Button
                    label={running ? "Pause" : "Start"}
                    size="lg"
                    icon={running ? <Pause size={18} /> : <Play size={18} />}
                    onClick={() => setRunning((r) => !r)}
                  />
                  <Button
                    label="Reset"
                    size="lg"
                    variant="secondary"
                    icon={<RotateCcw size={16} />}
                    onClick={() => {
                      setElapsed(0);
                      setHeroStart(0);
                      setRunning(false);
                    }}
                  />
                </div>

                <div
                  style={{ display: "flex", gap: spacing.sm, width: "100%" }}
                >
                  <Button
                    label="Complete"
                    fullWidth
                    icon={<Check size={16} />}
                    onClick={openCapture}
                  />
                  <Button
                    label="Carry"
                    variant="secondary"
                    icon={<Clock size={16} />}
                    onClick={carryHero}
                  />
                </div>
              </div>

              {queue.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: spacing.sm,
                  }}
                >
                  <Text
                    variant="caption"
                    tone="tertiary"
                    style={{ textTransform: "uppercase", letterSpacing: 2 }}
                  >
                    Queue · {queue.length}
                  </Text>
                  {queue.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: spacing.sm,
                        background: colors.surface.primary,
                        border: `1px solid ${colors.border.subtle}`,
                        borderRadius: radii.md,
                        padding: spacing.base,
                      }}
                    >
                      <Text
                        variant="bodySm"
                        tone="secondary"
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        {t.text}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {formatMinutes(t.estimateMin)}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: spacing.base,
                paddingTop: spacing.huge,
              }}
            >
              <Check size={40} color={colors.tint.success} />
              <Text variant="headline" weight={800} align="center">
                All done for today.
              </Text>
              <Text variant="bodySm" tone="secondary" align="center">
                {today.summary.done} shipped · {formatMinutes(today.summary.actualMin)}{" "}
                of focus
              </Text>
              <Button label="Back to plan" onClick={onExit} />
            </div>
          )}

          {today.carryFrom.length > 0 && (
            <div
              style={{
                background: colors.bg.accentDim,
                border: `1px solid ${colors.surface.skillhive}44`,
                borderRadius: radii.lg,
                padding: spacing.base,
                display: "flex",
                flexDirection: "column",
                gap: spacing.sm,
              }}
            >
              <Text variant="label" tone="skillhive">
                Carried from yesterday ({today.carryFrom.length})
              </Text>
              {today.carryFrom.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
                >
                  <Text
                    variant="bodySm"
                    tone="secondary"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {c.text}
                    <Text variant="caption" tone="tertiary">
                      {"  "}· {formatMinutes(c.estimateMin)}
                    </Text>
                  </Text>
                  <Button
                    label="Add to queue"
                    size="sm"
                    variant="secondary"
                    onClick={() => today.addCarry(c.id)}
                  />
                </div>
              ))}
            </div>
          )}

          <QuickCapture onCapture={today.addCapture} />
        </div>
      </div>

      {/* Ambience / constraints bar */}
      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${colors.border.subtle}`,
          background: colors.surface.primary,
          padding: `${spacing.base}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.base,
        }}
      >
        <AmbienceBar kind={ambience} onChange={setAmbience} />
        <div style={{ width: 1, height: 24, background: colors.border.subtle }} />
        <button
          onClick={() => setDnd((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: dnd ? colors.surface.skillhive : "transparent",
            border: `1px solid ${dnd ? colors.surface.skillhive : colors.border.subtle}`,
            color: dnd ? colors.text.onTint : colors.text.secondary,
            borderRadius: radii.pill,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <BellOff size={15} />
          DND {dnd ? "on" : "off"}
        </button>
        <div style={{ width: 1, height: 24, background: colors.border.subtle }} />
        <button
          onClick={() => setConstraintsOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: `1px solid ${colors.border.subtle}`,
            color: colors.text.secondary,
            borderRadius: radii.pill,
            padding: "8px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <Settings size={15} />
          Constraints
        </button>
      </div>

      <ConstraintsSheet
        open={constraintsOpen}
        constraints={constraints}
        onChange={(key) =>
          setConstraints((c) => ({ ...c, [key]: !c[key] }))
        }
        onClose={() => setConstraintsOpen(false)}
      />

      <CaptureModal
        capture={capture}
        projectOptions={projectOptions}
        onChange={(patch) =>
          setCapture((c) => (c ? { ...c, ...patch } : c))
        }
        onCancel={() => setCapture(null)}
        onSave={(breakAfter) => saveCapture(breakAfter)}
      />
    </div>
  );
}

/* ─────────────────────────── HELPERS ─────────────────────────── */

function TaskRow({
  task,
  index,
  dragging,
  onText,
  onEstimate,
  onRemove,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  task: TodayTask;
  index: number;
  dragging: boolean;
  onText: (text: string) => void;
  onEstimate: (min: number) => void;
  onRemove: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}) {
  const { colors, radii, spacing } = useTokens();
  return (
    <div
      data-task-id={task.id}
      data-index={index}
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.xs,
        background: colors.surface.primary,
        border: `1px solid ${dragging ? colors.surface.skillhive : colors.border.subtle}`,
        borderRadius: radii.lg,
        padding: `${spacing.sm}px ${spacing.sm}px ${spacing.sm}px ${spacing.base}px`,
        boxShadow: dragging ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
        transform: dragging ? "scale(1.01)" : "scale(1)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        zIndex: dragging ? 2 : undefined,
        position: "relative",
        cursor: "grab",
      }}
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px",
          cursor: "grab",
          touchAction: "none",
        }}
      >
        <GripVertical size={16} color={colors.text.tertiary} />
      </div>
      <input
        value={task.text}
        onChange={(e) => onText(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: colors.text.primary,
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "inherit",
        }}
      />
      <EstimateSelect value={task.estimateMin} onChange={onEstimate} />
      <IconBtn onClick={onRemove} label="Remove task">
        <Trash2 size={14} />
      </IconBtn>
    </div>
  );
}

function NewTaskRow({
  onCommit,
}: {
  onCommit: (text: string, min: number) => void;
}) {
  const { colors, radii, spacing } = useTokens();
  const [text, setText] = useState("");
  const [estimate, setEstimate] = useState(30);
  const ref = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onCommit(trimmed, estimate);
    setText("");
    setEstimate(30);
    ref.current?.focus();
  }

  const hasText = text.trim().length > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.xs,
        background: "transparent",
        border: `1px dashed ${colors.border.strong}`,
        borderRadius: radii.lg,
        padding: `${spacing.sm}px ${spacing.sm}px ${spacing.sm}px ${spacing.base}px`,
      }}
    >
      <Plus size={16} color={colors.text.tertiary} />
      <input
        ref={ref}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder="Add a task"
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: colors.text.primary,
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "inherit",
        }}
      />
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 7px",
          borderRadius: 7,
          border: `1px solid ${colors.border.subtle}`,
          background: colors.surface.sunken,
          color: hasText ? colors.surface.skillhive : colors.text.tertiary,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          transition: "color 0.15s ease",
          whiteSpace: "nowrap",
        }}
      >
        <CornerDownLeft size={12} />
        Enter
      </span>
      <EstimateSelect value={estimate} onChange={setEstimate} />
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  const { colors } = useTokens();
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        color: colors.text.tertiary,
      }}
    >
      {children}
    </button>
  );
}

function EstimateSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (min: number) => void;
}) {
  const { colors, radii } = useTokens();
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        border: `1px solid ${colors.border.subtle}`,
        background: colors.surface.secondary,
        color: colors.text.secondary,
        borderRadius: radii.md,
        padding: "4px 6px",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: "pointer",
        outline: "none",
      }}
    >
      {ESTIMATE_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {formatMinutes(m)}
        </option>
      ))}
    </select>
  );
}

function StatChip({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  const { colors, radii } = useTokens();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: radii.pill,
        background: colors.surface.primary,
        border: `1px solid ${colors.border.subtle}`,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <span
        style={{
          color: colors.text.primary,
          fontSize: 13,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <span
        style={{
          color: colors.text.tertiary,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function PhaseBadge({
  phase,
  remaining,
}: {
  phase: "focus" | "break";
  remaining: number;
}) {
  const { colors, radii } = useTokens();
  const color =
    phase === "focus" ? colors.surface.skillhive : colors.tint.success;
  const mm = pad2(remaining / 60);
  const ss = pad2(remaining % 60);
  return (
    <div
      style={{
        padding: "6px 12px",
        borderRadius: radii.pill,
        background: color + "22",
        border: `1px solid ${color}55`,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color,
          fontFamily: "monospace",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {phase} {mm}:{ss}
      </span>
    </div>
  );
}

function TimerRing({
  progress,
  phase,
}: {
  progress: number;
  phase: "focus" | "break";
}) {
  const { colors } = useTokens();
  const size = 220;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = phase === "focus" ? colors.surface.skillhive : colors.tint.success;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={colors.border.subtle}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        style={{ transition: "stroke-dashoffset 0.5s linear" }}
      />
    </svg>
  );
}

function AmbienceBar({
  kind,
  onChange,
}: {
  kind: AmbienceKind;
  onChange: (k: AmbienceKind) => void;
}) {
  const { colors, radii } = useTokens();
  const options: { value: AmbienceKind; label: string; icon: React.ReactNode }[] =
    [
      { value: "none", label: "Silent", icon: <X size={14} /> },
      { value: "rain", label: "Rain", icon: <CloudRain size={14} /> },
      { value: "cafe", label: "Cafe", icon: <Coffee size={14} /> },
    ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: colors.overlay.press,
        borderRadius: radii.pill,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const active = kind === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: radii.pill,
              border: "none",
              cursor: "pointer",
              background: active ? colors.surface.skillhive : "transparent",
              color: active ? colors.text.onTint : colors.text.secondary,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function QuickCapture({
  onCapture,
}: {
  onCapture: (text: string) => void;
}) {
  const { colors, radii, spacing } = useTokens();
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onCapture(trimmed);
    void saveNote({ ritual_type: "capture", body: trimmed });
    setText("");
    ref.current?.focus();
  }

  const hasText = text.trim().length > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.xs,
        background: colors.surface.primary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.pill,
        padding: `6px ${spacing.base}px`,
      }}
    >
      <Sparkles size={15} color={colors.tint.accent} />
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder="Quick capture — a stray thought, a link, a blocker…"
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: colors.text.primary,
          fontSize: 14,
          fontFamily: "inherit",
        }}
      />
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 7px",
          borderRadius: 7,
          border: `1px solid ${colors.border.subtle}`,
          background: colors.surface.sunken,
          color: hasText ? colors.tint.accent : colors.text.tertiary,
          fontSize: 10,
          fontWeight: 700,
          whiteSpace: "nowrap",
          transition: "color 0.15s ease",
        }}
      >
        <CornerDownLeft size={12} />
        Enter
      </span>
    </div>
  );
}

function ConstraintsSheet({
  open,
  constraints,
  onChange,
  onClose,
}: {
  open: boolean;
  constraints: {
    blockSites: boolean;
    muteNotifs: boolean;
    syncStatus: boolean;
  };
  onChange: (key: "blockSites" | "muteNotifs" | "syncStatus") => void;
  onClose: () => void;
}) {
  const { colors, radii, spacing } = useTokens();
  const rows: {
    key: "blockSites" | "muteNotifs" | "syncStatus";
    label: string;
    hint: string;
  }[] = [
    { key: "blockSites", label: "Block distracting sites", hint: "Browser extension coming soon" },
    { key: "muteNotifs", label: "Mute notifications", hint: "Silence everything until the break" },
    { key: "syncStatus", label: "Sync status", hint: "Share focus state with your team" },
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: colors.overlay.scrim,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: `0 ${spacing.base}px ${spacing.xl}px`,
              background: colors.bg.muted,
              borderRadius: radii.xxl,
              border: `1px solid ${colors.border.subtle}`,
              padding: spacing.xl,
              display: "flex",
              flexDirection: "column",
              gap: spacing.sm,
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: colors.border.strong,
                margin: "0 auto",
              }}
            />
            <Text variant="subtitle" style={{ display: "block", marginBottom: spacing.xs }}>
              Constraints
            </Text>
            {rows.map((row) => {
              const active = constraints[row.key];
              return (
                <button
                  key={row.key}
                  onClick={() => onChange(row.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.base,
                    padding: `${spacing.base}px 0`,
                    background: "transparent",
                    border: "none",
                    borderBottom: `1px solid ${colors.border.subtle}`,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <Text variant="bodySm" weight={600} style={{ display: "block" }}>
                      {row.label}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {row.hint}
                    </Text>
                  </div>
                  <div
                    style={{
                      width: 44,
                      height: 26,
                      borderRadius: 999,
                      background: active
                        ? colors.surface.skillhive
                        : colors.overlay.press,
                      position: "relative",
                      flexShrink: 0,
                      transition: "background 0.2s ease",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 3,
                        left: active ? 21 : 3,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: active ? colors.text.onTint : colors.text.tertiary,
                        transition: "left 0.2s ease",
                      }}
                    />
                  </div>
                </button>
              );
            })}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: spacing.sm,
              }}
            >
              <Button label="Done" onClick={onClose} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function CaptureModal({
  capture,
  onChange,
  onCancel,
  onSave,
  projectOptions,
}: {
  capture: {
    task: TodayTask;
    actualMin: number;
    shipped: string;
    blockers: string;
    projectName: string;
  } | null;
  onChange: (patch: {
    actualMin?: number;
    shipped?: string;
    blockers?: string;
    projectName?: string;
  }) => void;
  onCancel: () => void;
  onSave: (breakAfter: boolean) => void;
  projectOptions: Project[];
}) {
  const { colors, radii, spacing } = useTokens();
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  function toggleVoice(onResult: (text: string) => void) {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) onResult(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = { stop: () => rec.stop() };
    setListening(true);
    rec.start();
  }

  return (
    <AnimatePresence>
      {capture && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onCancel}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: colors.overlay.scrim,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: `0 ${spacing.base}px ${spacing.xl}px`,
              background: colors.bg.muted,
              borderRadius: radii.xxl,
              border: `1px solid ${colors.border.subtle}`,
              padding: spacing.xl,
              display: "flex",
              flexDirection: "column",
              gap: spacing.base,
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: colors.border.strong,
                margin: "0 auto",
              }}
            />
            <Text variant="subtitle" style={{ display: "block" }}>
              Ship “{capture.task.text}”
            </Text>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Text variant="caption" tone="tertiary" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                Actual time (min)
              </Text>
              <input
                type="number"
                min={0}
                value={capture.actualMin}
                onChange={(e) =>
                  onChange({ actualMin: Math.max(0, Number(e.target.value) || 0) })
                }
                style={{
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radii.md,
                  padding: "12px 14px",
                  fontSize: 15,
                  background: colors.surface.sunken,
                  color: colors.text.primary,
                  outline: "none",
                  fontFamily: "inherit",
                  fontVariantNumeric: "tabular-nums",
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Text variant="caption" tone="tertiary" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                  What did you ship?
                </Text>
                <button
                  type="button"
                  onClick={() =>
                    toggleVoice((text) =>
                      onChange({ shipped: capture.shipped ? capture.shipped + " " + text : text }),
                    )
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: `1px solid ${listening ? colors.surface.skillhive : colors.border.subtle}`,
                    background: listening ? colors.surface.skillhive + "22" : "transparent",
                    color: listening ? colors.surface.skillhive : colors.text.tertiary,
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "inherit",
                  }}
                >
                  {listening ? <MicOff size={12} /> : <Mic size={12} />}
                  {listening ? "Listening…" : "Voice"}
                </button>
              </div>
              <textarea
                rows={2}
                value={capture.shipped}
                onChange={(e) => onChange({ shipped: e.target.value })}
                placeholder="Merged the landing page PR, wired Stripe…"
                style={{
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radii.md,
                  padding: "12px 14px",
                  fontSize: 15,
                  background: colors.surface.sunken,
                  color: colors.text.primary,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Text variant="caption" tone="tertiary" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                Blockers? (optional)
              </Text>
              <input
                value={capture.blockers}
                onChange={(e) => onChange({ blockers: e.target.value })}
                placeholder="Waiting on design review…"
                style={{
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radii.md,
                  padding: "12px 14px",
                  fontSize: 15,
                  background: colors.surface.sunken,
                  color: colors.text.primary,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Text variant="caption" tone="tertiary" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                Project (optional)
              </Text>
              <input
                list="today-project-options"
                value={capture.projectName}
                onChange={(e) => onChange({ projectName: e.target.value })}
                placeholder="Tag a project, or type a new one"
                style={{
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: radii.md,
                  padding: "12px 14px",
                  fontSize: 15,
                  background: colors.surface.sunken,
                  color: colors.text.primary,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <datalist id="today-project-options">
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </label>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: spacing.sm,
                marginTop: spacing.xs,
              }}
            >
              <Button label="Cancel" variant="secondary" onClick={onCancel} />
              <Button
                label="Save & Break"
                variant="secondary"
                icon={<Clock size={15} />}
                onClick={() => onSave(true)}
              />
              <Button
                label="Save & Next"
                icon={<Check size={15} />}
                onClick={() => onSave(false)}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

