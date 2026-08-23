import { useTokens } from "@/theme";
import { Text } from "@/components/ui";
import { formatDuration, type TrackerDayStat } from "@/lib/timeTracker";
import { Heatmap } from "@/components/ui/Heatmap";
import type { HeatmapDay } from "@/lib/todayData";

export function CodingTimeBadge({
  totalSeconds,
  lastCodedAt,
}: {
  totalSeconds: number;
  lastCodedAt?: string | null;
}) {
  const { colors, radii } = useTokens();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: radii.pill,
        background: colors.bg.accentDim,
        border: `1px solid ${colors.surface.skillhive}44`,
        width: "fit-content",
      }}
    >
      <Text variant="bodySm" weight={800} tone="skillhive">
        {formatDuration(totalSeconds)}
      </Text>
      <Text variant="caption" tone="tertiary">
        auto-tracked{lastCodedAt ? ` · last ${shortDate(lastCodedAt)}` : ""}
      </Text>
    </div>
  );
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Horizontal language share bars (top N languages). */
export function LanguageBreakdown({
  breakdown,
  maxItems = 5,
}: {
  breakdown: { name: string; total_seconds: number }[];
  maxItems?: number;
}) {
  const { colors } = useTokens();
  const top = breakdown.slice(0, maxItems);
  if (top.length === 0) return null;
  const max = Math.max(...top.map((l) => l.total_seconds), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {top.map((lang) => (
        <div key={lang.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Text
            variant="caption"
            weight={700}
            style={{ width: 72, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {lang.name}
          </Text>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: colors.bg.muted,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(4, (lang.total_seconds / max) * 100)}%`,
                height: "100%",
                borderRadius: 3,
                background: colors.surface.skillhive,
              }}
            />
          </div>
          <Text variant="caption" tone="tertiary" style={{ width: 52, textAlign: "right" }}>
            {formatDuration(lang.total_seconds)}
          </Text>
        </div>
      ))}
    </div>
  );
}

/** Compact coding heatmap driven by tracker daily data. */
export function MiniHeatmap({ daily }: { daily: TrackerDayStat[] }) {
  const data: HeatmapDay[] = daily.map((d) => ({
    day: d.date,
    minutes: Math.round(d.seconds / 60),
    sessions: 1,
  }));
  if (data.length === 0) return null;
  return <Heatmap data={data} weeks={12} cellSize={9} gap={2} />;
}
