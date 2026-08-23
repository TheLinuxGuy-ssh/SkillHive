import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Check, Link2, Search, Unlink, X } from "lucide-react";
import { Text } from "@/components/ui";
import { useTokens } from "@/theme";
import {
  fetchMyConnection,
  fetchMyTrackerProjects,
  formatDuration,
  linkTrackerProjects,
  unlinkTrackerProjects,
  type ProjectMapping,
  type TrackerProject,
} from "@/lib/timeTracker";
import { suggestMatches } from "@/lib/timeTrackerMatch";

/**
 * Modal to pick which tracker (Wakatime/Hackatime) projects feed coding time
 * into one SkillHive project. Multi-select — monorepos can map several.
 */
export function TrackerProjectPickerModal({
  projectId,
  projectName,
  currentMappings,
  onClose,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  currentMappings: ProjectMapping[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { colors, spacing, radii } = useTokens();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<TrackerProject[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentMappings.map((m) => m.tracker_project_id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMyConnection().then((c) => {
      if (!cancelled) setConnected(c != null);
    });
    void fetchMyTrackerProjects().then((list) => {
      if (!cancelled) {
        setProjects(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(
    () =>
      suggestMatches(projects, [{ name: projectName }])
        .filter((s) => s.skillhiveName === projectName)
        .map((s) => s.trackerId),
    [projects, projectName],
  );

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    // Remove anything unchecked that was previously mapped.
    const toRemove = currentMappings
      .map((m) => m.tracker_project_id)
      .filter((id) => !selected.has(id));
    if (toRemove.length > 0) {
      const ok = await unlinkTrackerProjects(projectId, undefined);
      // unlink-all then re-link the surviving selection keeps state consistent
      if (!ok) {
        setSaving(false);
        setError("Could not update mappings.");
        return;
      }
    }
    const toAdd = [...selected];
    if (toAdd.length > 0) {
      const ok = await linkTrackerProjects(projectId, toAdd);
      if (!ok) {
        setSaving(false);
        setError("Could not save mappings.");
        return;
      }
    }
    setSaving(false);
    onChanged();
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.base,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: colors.surface.primary,
          border: `1px solid ${colors.border.subtle}`,
          borderRadius: radii.xl,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            padding: spacing.base,
            borderBottom: `1px solid ${colors.border.subtle}`,
          }}
        >
          <Link2 size={16} color={colors.surface.skillhive} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title" weight={800}>
              Link tracked time
            </Text>
            <Text variant="caption" tone="tertiary" style={{ display: "block" }}>
              Wakatime/Hackatime projects feeding “{projectName}”
            </Text>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: colors.text.tertiary,
              padding: 4,
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: `${spacing.sm}px ${spacing.base}px 0` }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: radii.md,
              border: `1px solid ${colors.border.subtle}`,
              background: colors.bg.muted,
            }}
          >
            <Search size={14} color={colors.text.tertiary} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracker projects…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: colors.text.primary,
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: `${spacing.sm}px ${spacing.base}px`,
          }}
        >
          {loading ? (
            <Text variant="bodySm" tone="tertiary">
              Loading tracker projects…
            </Text>
          ) : connected === false ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: spacing.sm,
                padding: `${spacing.sm}px 0`,
              }}
            >
              <Text variant="bodySm" tone="secondary">
                You haven't connected Wakatime or Hackatime yet.
              </Text>
              <button
                onClick={() => {
                  onClose();
                  navigate("/settings/trackers");
                }}
                style={{
                  alignSelf: "flex-start",
                  padding: "8px 16px",
                  borderRadius: radii.pill,
                  border: "none",
                  background: colors.surface.skillhive,
                  color: "#111",
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                Connect a time tracker
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              No tracker projects found. Try “Sync now” on the tracker settings
              page, then come back.
            </Text>
          ) : (
            filtered.map((p) => {
              const isSelected = selected.has(p.tracker_project_id);
              const isSuggested =
                suggestions.includes(p.tracker_project_id) && !isSelected;
              return (
                <button
                  key={p.tracker_project_id}
                  onClick={() => toggle(p.tracker_project_id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.sm,
                    padding: "10px 8px",
                    background: "transparent",
                    border: "none",
                    borderBottom: `1px solid ${colors.border.subtle}`,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `1.5px solid ${
                        isSelected ? colors.surface.skillhive : colors.border.subtle
                      }`,
                      background: isSelected ? colors.surface.skillhive : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && <Check size={13} color="#111" />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodySm" weight={600} style={{ display: "block" }}>
                      {p.name}
                      {isSuggested && (
                        <Text variant="caption" tone="skillhive" weight={800}>
                          {" "}
                          · suggested
                        </Text>
                      )}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {formatDuration(p.total_seconds)} tracked
                    </Text>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            padding: spacing.base,
            borderTop: `1px solid ${colors.border.subtle}`,
          }}
        >
          {error && (
            <Text variant="caption" tone="tint" style={{ color: colors.tint.warning, flex: 1 }}>
              {error}
            </Text>
          )}
          {currentMappings.length > 0 && selected.size === 0 && (
            <button
              onClick={async () => {
                setSaving(true);
                await unlinkTrackerProjects(projectId, undefined);
                setSaving(false);
                onChanged();
                onClose();
              }}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: colors.tint.warning,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "inherit",
                padding: "6px 10px",
              }}
            >
              <Unlink size={14} />
              Unlink all
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 18px",
              borderRadius: radii.pill,
              border: "none",
              background: colors.surface.skillhive,
              color: "#111",
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "inherit",
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : `Save (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
