import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";

import { WorkRoomCard } from "@/components/ui/WorkRoomCard";
import { Text, Button } from "@/components/ui";
import { useTokens } from "@/theme";
import {
  computePhase,
  FOCUS_MS,
  BREAK_MS,
  CYCLE_MS,
} from "@/hooks/sessionPhase";
import { useActiveRooms } from "@/hooks/useActiveRooms";
import { Plus } from "lucide-react";

function NewRoomModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const { colors, radii, spacing } = useTokens();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onClose();
  }

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
            background: colors.overlay.scrim,
            zIndex: 1000,
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
              boxShadow: "0 -8px 48px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: colors.border.strong,
                margin: "0 auto 18px",
              }}
            />
            <Text variant="subtitle" style={{ marginBottom: spacing.base }}>
              Name your room
            </Text>

            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="e.g. deep work, thesis grind…"
              style={{
                width: "100%",
                border: `1px solid ${colors.border.default}`,
                borderRadius: radii.md,
                padding: "14px",
                marginBottom: spacing.lg,
                fontSize: 15,
                background: colors.surface.sunken,
                color: colors.text.primary,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: spacing.sm,
              }}
            >
              <Button
                label="Cancel"
                variant="secondary"
                size="sm"
                onClick={onClose}
              />
              <Button
                label="Create"
                variant="primary"
                size="sm"
                onClick={handleSubmit}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Spinner() {
  const { colors } = useTokens();
  return (
    <>
      <style>{`@keyframes rooms-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 26,
          height: 26,
          border: `2px solid ${colors.border.subtle}`,
          borderTopColor: colors.surface.skillhive,
          borderRadius: "50%",
          animation: "rooms-spin 0.8s linear infinite",
        }}
      />
    </>
  );
}

export default function Rooms() {
  const router = useNavigate();
  const { colors, spacing } = useTokens();
  const { rooms, loading } = useActiveRooms();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleOpenSheet = useCallback(() => setSheetOpen(true), []);
  const handleCloseSheet = useCallback(() => setSheetOpen(false), []);

  function handleStartSession(name: string) {
    handleCloseSheet();
    router(`/rooms/${encodeURIComponent(name)}`);
  }

  function handleJoinRoom(name: string) {
    router(`/rooms/${encodeURIComponent(name)}`);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bg.muted,
        paddingTop: 88,
        paddingBottom: 120,
        fontFamily:
          '"popreg", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: `${spacing.sm}px ${spacing.base}px`,
          display: "flex",
          flexDirection: "column",
          gap: spacing.md,
        }}
      >
        {/* Section header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.xs,
          }}
        >
          <Text variant="subtitle">Work Rooms</Text>

          <div
            style={{ display: "flex", alignItems: "center", gap: spacing.sm }}
          >
            {rooms.length > 0 && (
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: colors.surface.skillhive + "22",
                }}
              >
                <Text variant="caption" tone="skillhive" weight={700}>
                  {rooms.length} live
                </Text>
              </div>
            )}
            <Button
              label="New Room"
              icon={<Plus size={14} />}
              size="sm"
              variant="primary"
              onClick={handleOpenSheet}
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{
              paddingTop: 48,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Spinner />
          </div>
        )}

        {/* Empty state */}
        {!loading && rooms.length === 0 && (
          <WorkRoomCard
            state="empty"
            name="No rooms yet"
            tag="Be the first"
            onStart={handleOpenSheet}
            timerSeconds={0}
            breakSeconds={0}
          />
        )}

        {/* Room cards */}
        {!loading &&
          rooms.map((room) => {
            const phase = computePhase(room.session_started_at);
            const memberNames = room.participants.map(
              (p) => p.displayname || p.username,
            );

            const sessionStartMs = room.session_started_at
              ? new Date(room.session_started_at).getTime()
              : undefined;

            const elapsed = sessionStartMs ? Date.now() - sessionStartMs : 0;
            const posInCycle = elapsed % CYCLE_MS;
            const phaseStartedAt = sessionStartMs
              ? Date.now() -
                posInCycle +
                (phase.phase === "break" ? FOCUS_MS : 0)
              : undefined;

            const phaseDurationMs =
              phase.phase === "focus" ? FOCUS_MS : BREAK_MS;

            return (
              <WorkRoomCard
                key={room.room_name}
                state={
                  phase.phase === "focus"
                    ? "active"
                    : phase.phase === "break"
                      ? "break"
                      : "empty"
                }
                name={room.room_name}
                tag={`${room.participant_count} joined`}
                members={memberNames}
                phaseStartedAt={phaseStartedAt}
                onJoin={() => handleJoinRoom(room.room_name)}
                phaseDurationMs={phaseDurationMs}
              />
            );
          })}
      </div>

      <NewRoomModal
        open={sheetOpen}
        onClose={handleCloseSheet}
        onSubmit={handleStartSession}
      />
    </div>
  );
}
