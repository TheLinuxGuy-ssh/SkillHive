import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Clock, FolderGit2 } from "lucide-react";
import { Text } from "@/components/ui";
import { useTokens } from "@/theme";
import { useProfile } from "@/hooks/profileContext";
import { useProjectCodingTime } from "@/hooks/useTimeTracker";
import { CodingTimeBadge, LanguageBreakdown, WakatimeConnectCard } from "@/components/CodingTime";
import {
  fetchProjectSummary,
  fetchProjectShipped,
  type ProjectSummary,
  type ShippedNote,
} from "@/lib/todayData";

const FONT =
  '"popreg", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h < 1) return `${minutes}m`;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { colors, spacing, radii } = useTokens();
  const { profile: me } = useProfile();

  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [shipped, setShipped] = useState<ShippedNote[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const { coding } = useProjectCodingTime(id);
  const isOwner = !!me && !!summary?.owner_id && me.id === summary.owner_id;

  const loading = loadedFor !== (id ?? null);

  useEffect(() => {
    if (!id || loadedFor === id) return;
    let cancelled = false;
    (async () => {
      const s = await fetchProjectSummary(id);
      if (cancelled) return;
      setSummary(s);
      setNotFound(!s);
      setShipped([]);
      setLoadedFor(id);
      if (s) {
        void fetchProjectShipped(id).then((list) => !cancelled && setShipped(list));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadedFor]);

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

  if (notFound || !summary) {
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
        <Text tone="tertiary">Project not found.</Text>
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

        <div style={{ display: "flex", gap: spacing.base, alignItems: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: colors.bg.accentDim,
              border: `1px solid ${colors.surface.skillhive}44`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FolderGit2 size={24} color={colors.surface.skillhive} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Text variant="headline" weight={900} style={{ letterSpacing: -0.5 }}>
              {summary.name}
            </Text>
            {summary.owner_username && (
              <Text tone="secondary" style={{ fontFamily: "monospace", fontSize: 13 }}>
                by @{summary.owner_username}
              </Text>
            )}
          </div>
        </div>

        {summary.description && (
          <Text variant="body" tone="secondary">
            {summary.description}
          </Text>
        )}

        {/* Auto-tracked time — owner manages, visitors see it when public */}
        {isOwner && id ? (
          <WakatimeConnectCard projectId={id} projectName={summary.name} />
        ) : (
          coding && coding.is_public && (
            <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm }}>
              <CodingTimeBadge
                totalSeconds={coding.total_seconds}
                lastCodedAt={coding.last_coded_at}
              />
              {coding.language_breakdown.length > 0 && (
                <div
                  style={{
                    background: colors.surface.primary,
                    border: `1px solid ${colors.border.subtle}`,
                    borderRadius: radii.lg,
                    padding: spacing.base,
                  }}
                >
                  <Text variant="label" tone="secondary">
                    Languages
                  </Text>
                  <div style={{ marginTop: spacing.sm }}>
                    <LanguageBreakdown breakdown={coding.language_breakdown} maxItems={3} />
                  </div>
                </div>
              )}
            </div>
          )
        )}

        <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap" }}>
          <Stat label="focus" value={formatHours(summary.total_minutes)} />
          <Stat label="sessions" value={String(summary.total_sessions)} />
          <Stat label="shipped" value={String(summary.shipped_count)} />
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
            Shipped
          </Text>
          {shipped.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              Nothing shipped here yet.
            </Text>
          ) : (
            shipped.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  gap: spacing.sm,
                  alignItems: "flex-start",
                  padding: `${spacing.sm}px 0`,
                  borderBottom: `1px solid ${colors.border.subtle}`,
                }}
              >
                <Clock size={15} color={colors.tint.success} style={{ marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <Text variant="bodySm" tone="secondary" style={{ display: "block" }}>
                    {s.body}
                  </Text>
                  {s.blockers && (
                    <Text variant="caption" style={{ color: colors.tint.warning }}>
                      ⚠ {s.blockers}
                    </Text>
                  )}
                </div>
                <Text variant="caption" tone="tertiary">
                  {s.actual_min ? `${s.actual_min}m` : ""}
                </Text>
              </div>
            ))
          )}
        </div>
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
      <style>{`@keyframes proj-spin { to { transform: rotate(360deg); } }`}</style>
      <span
        style={{
          width: s,
          height: s,
          border: `2px solid ${colors.border.subtle}`,
          borderTopColor: colors.surface.skillhive,
          borderRadius: "50%",
          display: "inline-block",
          animation: "proj-spin 0.8s linear infinite",
        }}
      />
    </>
  );
}
