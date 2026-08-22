import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, ListTodo, Flame, ShieldAlert } from "lucide-react";
import { Text, Button } from "@/components/ui";
import { Heatmap } from "@/components/ui/Heatmap";
import { useTokens } from "@/theme";
import { useProfile } from "@/hooks/profileContext";
import { useToday, formatMinutes } from "@/hooks/useToday";
import {
  fetchFocusStats,
  fetchHeatmap,
  fetchUserProjects,
  fetchRecentShipped,
  type FocusStats,
  type HeatmapDay,
  type ProjectWithStats,
  type ShippedNote,
} from "@/lib/todayData";

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h < 1) return `${minutes}m`;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

export default function Review() {
  const navigate = useNavigate();
  const { colors, spacing, radii } = useTokens();
  const { profile } = useProfile();
  const today = useToday();

  const [stats, setStats] = useState<FocusStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [shipped, setShipped] = useState<ShippedNote[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    void fetchFocusStats(profile.id).then(setStats);
    void fetchHeatmap(profile.id, 365).then(setHeatmap);
    void fetchUserProjects(profile.id).then(setProjects);
    void fetchRecentShipped(profile.id, 20).then(setShipped);
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
    const weekMinutes = days.reduce((s, d) => s + d.minutes, 0);
    const activeDays = days.filter((d) => d.minutes > 0).length;
    return { weekMinutes, activeDays };
  }, [heatmap]);

  const blockers = useMemo(
    () => shipped.filter((s) => s.blockers && s.blockers.trim()),
    [shipped],
  );

  const topProject = useMemo(() => {
    return projects.reduce<ProjectWithStats | null>(
      (best, p) => (best === null || p.total_minutes > best.total_minutes ? p : best),
      null,
    );
  }, [projects]);

  const avgSession =
    stats && stats.total_sessions > 0
      ? Math.round(stats.total_minutes / stats.total_sessions)
      : 0;

  const carryPreview = today.tasks.filter(
    (t) => t.status === "queued" || t.status === "carried",
  );

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
          maxWidth: 640,
          margin: "0 auto",
          padding: `0 ${spacing.base}px`,
          display: "flex",
          flexDirection: "column",
          gap: spacing.lg,
        }}
      >
        <button
          onClick={() => navigate("/home")}
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
            width: "fit-content",
          }}
        >
          <ArrowLeft size={18} />
          Back to today
        </button>

        <div>
          <Text
            variant="caption"
            tone="tertiary"
            style={{ textTransform: "uppercase", letterSpacing: 2 }}
          >
            Weekly Review
          </Text>
          <Text variant="display" weight={900} style={{ letterSpacing: -1 }}>
            The week, reviewed.
          </Text>
        </div>

        {/* Headline stats */}
        <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap" }}>
          <Stat label="focus this week" value={formatHours(week.weekMinutes)} />
          <Stat
            label="sync rate"
            value={`${week.activeDays}/7`}
          />
          <Stat
            label="all-time"
            value={formatHours(stats?.total_minutes ?? 0)}
          />
          <Stat
            label="streak"
            value={`${stats?.current_streak ?? 0}d`}
          />
        </div>

        {/* Heatmap */}
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
          <Heatmap data={heatmap} weeks={26} />
        </div>

        {/* Patterns */}
        <div
          style={{
            background: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radii.lg,
            padding: spacing.base,
            display: "flex",
            flexDirection: "column",
            gap: spacing.base,
          }}
        >
          <Text variant="label" tone="secondary">
            Patterns
          </Text>
          <Row icon={<ListTodo size={15} />} label="Sessions" value={String(stats?.total_sessions ?? 0)} />
          <Row icon={<Clock size={15} />} label="Avg session" value={`${avgSession}m`} />
          <Row
            icon={<Flame size={15} />}
            label="Top project"
            value={topProject ? `${topProject.name} · ${formatHours(topProject.total_minutes)}` : "—"}
          />
        </div>

        {/* Blockers */}
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
          {blockers.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              No blockers logged this period.
            </Text>
          ) : (
            blockers.slice(0, 5).map((b) => (
              <div
                key={b.id}
                style={{
                  display: "flex",
                  gap: spacing.sm,
                  alignItems: "flex-start",
                }}
              >
                <ShieldAlert size={15} color={colors.tint.warning} style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <Text variant="bodySm" tone="secondary" style={{ display: "block" }}>
                    {b.blockers}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {b.body}
                  </Text>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Carry-forward preview */}
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
            Carrying into next week
          </Text>
          {carryPreview.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              Nothing carried. Clean slate.
            </Text>
          ) : (
            carryPreview.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: spacing.sm, alignItems: "center" }}>
                <Text variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                  {t.text}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatMinutes(t.estimateMin)}
                </Text>
              </div>
            ))
          )}
        </div>

        {/* Recent shipped */}
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
            {shipped.slice(0, 5).map((s) => (
              <div key={s.id} style={{ display: "flex", gap: spacing.sm, alignItems: "flex-start" }}>
                <Text variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                  {s.body}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {s.actual_min ? `${s.actual_min}m` : ""}
                </Text>
              </div>
            ))}
          </div>
        )}

        <Button label="Back to today" variant="secondary" onClick={() => navigate("/home")} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors, radii } = useTokens();
  return (
    <div
      style={{
        flex: 1,
        minWidth: 120,
        background: colors.surface.primary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.lg,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Text variant="title" tone="skillhive" weight={900} style={{ lineHeight: 1 }}>
        {value}
      </Text>
      <Text variant="caption" tone="tertiary" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </Text>
    </div>
  );
}

function Row({
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
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: colors.text.tertiary }}>{icon}</span>
      <Text variant="bodySm" tone="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="bodySm" weight={600}>
        {value}
      </Text>
    </div>
  );
}
