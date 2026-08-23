import { useCallback, useEffect, useState } from "react";
import { Link2, Lock, Unlock } from "lucide-react";
import { useNavigate } from "react-router";
import { Text } from "@/components/ui";
import { useTokens } from "@/theme";
import { useProfile } from "@/hooks/profileContext";
import {
  useProjectCodingTime,
  useTrackerConnection,
} from "@/hooks/useTimeTracker";
import {
  fetchProjectMappings,
  formatDuration,
  setProjectCodingVisibility,
  type ProjectMapping,
} from "@/lib/timeTracker";
import { CodingTimeBadge, LanguageBreakdown } from "./parts";
import { TrackerProjectPickerModal } from "./TrackerProjectPickerModal";

/**
 * Per-project "connect your time tracker" card (Hack Club style).
 *
 * Owner view: empty state → connect CTA; mapped state → live badge,
 * language breakdown, manage-link + public/private toggle.
 * Visitors render nothing here — Project.tsx shows the badge itself.
 */
export function WakatimeConnectCard({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { colors, spacing, radii } = useTokens();
  const navigate = useNavigate();
  const { profile: me } = useProfile();
  const { coding, refresh } = useProjectCodingTime(projectId);
  const { connection } = useTrackerConnection();

  const [mappings, setMappings] = useState<ProjectMapping[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadMappings = useCallback(() => {
    void fetchProjectMappings(projectId).then(setMappings);
    refresh();
  }, [projectId, refresh]);

  useEffect(() => {
    // Only meaningful for the owner; RPC returns [] for everyone else.
    void fetchProjectMappings(projectId).then(setMappings);
  }, [projectId]);

  const totalMappedSeconds = mappings.reduce(
    (acc, m) => acc + (m.total_seconds ?? 0),
    0,
  );

  async function togglePublic() {
    if (!coding) return;
    setBusy(true);
    await setProjectCodingVisibility(projectId, !coding.is_public);
    setBusy(false);
    refresh();
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
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
        <Link2 size={15} color={colors.surface.skillhive} />
        <Text variant="label" tone="secondary" style={{ flex: 1 }}>
          Auto-tracked time
        </Text>
        <button
          onClick={() =>
            connection ? setPickerOpen(true) : navigate("/settings/trackers")
          }
          style={{
            background: "transparent",
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radii.pill,
            color: colors.text.secondary,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          {!connection
            ? "Connect tracker"
            : mappings.length > 0
              ? "Manage"
              : "Link projects"}
        </button>
      </div>

      {mappings.length === 0 ? (
        <Text variant="bodySm" tone="tertiary">
          Connect Wakatime or Hackatime and link projects here — coding time
          shows up on this page automatically.
        </Text>
      ) : (
        <>
          <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap", alignItems: "center" }}>
            <CodingTimeBadge
              totalSeconds={totalMappedSeconds || coding?.total_seconds || 0}
              lastCodedAt={coding?.last_coded_at}
            />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: colors.text.tertiary,
              }}
            >
              {mappings.length} linked ·{" "}
              {formatDuration(totalMappedSeconds)} tracked
            </span>
          </div>

          {coding && coding.language_breakdown.length > 0 && (
            <LanguageBreakdown breakdown={coding.language_breakdown} maxItems={5} />
          )}

          {/* Privacy toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              paddingTop: spacing.xs,
            }}
          >
            <button
              onClick={togglePublic}
              disabled={busy}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: "none",
                cursor: busy ? "wait" : "pointer",
                color: coding?.is_public ? colors.tint.success : colors.text.tertiary,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              {coding?.is_public ? <Unlock size={13} /> : <Lock size={13} />}
              {coding?.is_public
                ? "Visible on your public profile"
                : "Private — only you can see this"}
            </button>
          </div>
        </>
      )}

      {pickerOpen && me && (
        <TrackerProjectPickerModal
          projectId={projectId}
          projectName={projectName}
          currentMappings={mappings}
          onClose={() => setPickerOpen(false)}
          onChanged={loadMappings}
        />
      )}
    </div>
  );
}
