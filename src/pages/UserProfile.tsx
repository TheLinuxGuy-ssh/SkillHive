import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Clock, FolderGit2 } from "lucide-react";
import { Text } from "@/components/ui";
import { Heatmap } from "@/components/ui/Heatmap";
import { useTokens } from "@/theme";
import {
  fetchPublicProfile,
  fetchFocusStats,
  fetchHeatmap,
  fetchUserProjects,
  fetchRecentShipped,
  type PublicProfile,
  type FocusStats,
  type HeatmapDay,
  type ProjectWithStats,
  type ShippedNote,
} from "@/lib/todayData";

const FONT =
  '"popreg", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h < 1) return `${minutes}m`;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { colors, spacing, radii } = useTokens();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [shipped, setShipped] = useState<ShippedNote[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const loading = loadedFor !== (username ?? null);

  useEffect(() => {
    if (!username || loadedFor === username) return;
    let cancelled = false;
    (async () => {
      const p = await fetchPublicProfile(username);
      if (cancelled) return;
      setProfile(p);
      setStats(null);
      setHeatmap([]);
      setProjects([]);
      setShipped([]);
      setLoadedFor(username);
      if (p) {
        void fetchFocusStats(p.id).then((s) => !cancelled && setStats(s));
        void fetchHeatmap(p.id, 365).then((h) => !cancelled && setHeatmap(h));
        void fetchUserProjects(p.id).then((pr) => !cancelled && setProjects(pr));
        void fetchRecentShipped(p.id, 10).then((s) => !cancelled && setShipped(s));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, loadedFor]);

  const displayName = profile?.displayname ?? "—";

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: colors.bg.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MiniSpin big />
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: colors.bg.muted,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontFamily: FONT,
        }}
      >
        <Text tone="tertiary">@{username} not found.</Text>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          <Text tone="tint" weight={600}>
            Go back
          </Text>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bg.muted,
        paddingTop: 88,
        paddingBottom: 160,
        fontFamily: FONT,
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
          onClick={() => navigate(-1)}
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
          Back
        </button>

        {/* Header */}
        <div style={{ display: "flex", gap: spacing.base, alignItems: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              border: `2px solid ${colors.border.subtle}`,
              overflow: "hidden",
              background: colors.surface.secondary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt={displayName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Text variant="title" tone="skillhive" weight={900}>
                {(displayName?.[0] ?? "?").toUpperCase()}
              </Text>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <Text variant="headline" weight={900} style={{ letterSpacing: -0.5 }}>
              {displayName}
            </Text>
            {profile.username && (
              <Text tone="secondary" style={{ fontFamily: "monospace", fontSize: 13 }}>
                @{profile.username}
              </Text>
            )}
            {profile.bio && (
              <Text
                variant="bodySm"
                tone="secondary"
                style={{ display: "block", marginTop: 4 }}
              >
                {profile.bio}
              </Text>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap" }}>
          <Stat label="focus" value={formatHours(stats?.total_minutes ?? 0)} />
          <Stat label="sessions" value={String(stats?.total_sessions ?? 0)} />
          <Stat label="days active" value={String(stats?.days_active ?? 0)} />
          <Stat label="streak" value={`${stats?.current_streak ?? 0}d`} />
        </div>

        {/* Heatmap */}
        <div
          style={{
            background: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radii.lg,
            padding: spacing.base,
          }}
        >
          <Text variant="label" tone="secondary">
            Focus activity
          </Text>
          <div style={{ marginTop: spacing.sm }}>
            <Heatmap data={heatmap} weeks={26} />
          </div>
        </div>

        {/* Projects */}
        {projects.length > 0 && (
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
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.sm,
                  padding: `${spacing.sm}px 0`,
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${colors.border.subtle}`,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <FolderGit2 size={16} color={colors.text.tertiary} />
                <Text variant="bodySm" weight={600} style={{ flex: 1 }}>
                  {p.name}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatHours(p.total_minutes)} · {p.total_sessions} sessions
                </Text>
              </button>
            ))}
          </div>
        )}

        {/* Recently shipped */}
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
            {shipped.map((s) => (
              <div key={s.id} style={{ display: "flex", gap: spacing.sm, alignItems: "flex-start" }}>
                <Clock size={15} color={colors.tint.success} style={{ marginTop: 3 }} />
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
      <Text
        variant="caption"
        tone="tertiary"
        style={{ textTransform: "uppercase", letterSpacing: 1 }}
      >
        {label}
      </Text>
    </div>
  );
}

function MiniSpin({ big }: { big?: boolean }) {
  const { colors } = useTokens();
  const s = big ? 24 : 16;
  return (
    <>
      <style>{`@keyframes up-spin { to { transform: rotate(360deg); } }`}</style>
      <span
        style={{
          width: s,
          height: s,
          border: `2px solid ${colors.border.subtle}`,
          borderTopColor: colors.surface.skillhive,
          borderRadius: "50%",
          display: "inline-block",
          animation: "up-spin 0.8s linear infinite",
        }}
      />
    </>
  );
}
