import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import type { TrackReference } from "@livekit/components-react";
import { Room, RoomEvent, Track, VideoPresets } from "livekit-client";
import type { Participant, RoomOptions } from "livekit-client";
import { RoomLobby } from "@/hooks/RoomLobby";
import { useParams } from "react-router";
import { useProfile } from "@/hooks/profileContext";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useRoomSession } from "@/hooks/useRoomSession";
import { useTokens } from "@/theme/useTokens";

const LIVEKIT_URL = "wss://rooms.skillhiive.com";
const TOKEN_ENDPOINT = "https://api.skillhivelabs.com/getToken";
const TOKEN_FETCH_MAX_ATTEMPTS = 5;
const SPEAKER_DEBOUNCE_MS = 800;
const MAX_AUTO_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 3000;
const TILES_PER_PAGE = 6;
const SIDEBAR_W = 300;
const TILE_ASPECT = 16 / 9;
const GRID_GAP = 8;
const MOBILE_BREAKPOINT = 700;

type CubicleState =
  | { status: "idle" }
  | { status: "requesting"; targetIdentity: string }
  | { status: "incoming"; fromIdentity: string; cubicleRoomName: string }
  | { status: "active"; partnerIdentity: string; cubicleRoomName: string };

type SessionPhase = "waiting" | "focus" | "break";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

interface GridLayout {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
}

function computeOptimalGrid(
  count: number,
  containerW: number,
  containerH: number,
  gap: number = GRID_GAP,
  aspect: number = TILE_ASPECT,
): GridLayout {
  if (count <= 0 || containerW <= 0 || containerH <= 0) {
    return {
      cols: 1,
      rows: 1,
      tileW: Math.max(containerW, 0),
      tileH: Math.max(containerH, 0),
    };
  }

  let best: GridLayout = { cols: 1, rows: count, tileW: 0, tileH: 0 };
  let bestArea = 0;

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);

    let tileW = (containerW - gap * (cols - 1)) / cols;
    let tileH = tileW / aspect;

    const totalH = tileH * rows + gap * (rows - 1);
    if (totalH > containerH) {
      tileH = (containerH - gap * (rows - 1)) / rows;
      tileW = tileH * aspect;
    }

    if (tileW <= 0 || tileH <= 0) continue;

    const area = tileW * tileH;
    if (area > bestArea) {
      bestArea = area;
      best = { cols, rows, tileW, tileH };
    }
  }

  return best;
}

interface AudioDevice {
  id: string;
  name: string;
}
function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    )
      return;
    navigator.mediaDevices.enumerateDevices().then((all) => {
      const outputs = all
        .filter((d) => d.kind === "audiooutput")
        .map((d) => ({
          id: d.deviceId,
          name: d.label || `Speaker ${d.deviceId.slice(0, 4)}`,
        }));
      if (outputs.length === 0)
        outputs.push({ id: "default", name: "Default Speaker" });
      setDevices(outputs);
      setActiveId(outputs[0].id);
    });
  }, []);

  const active = devices.find((d) => d.id === activeId) ?? {
    id: "default",
    name: "Speaker",
  };

  const selectDevice = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  return { devices, active, selectDevice };
}

export interface RoomScreenProps {
  onLeave: () => void;
  supabase?: any;
}

export default function RoomScreen({
  onLeave,
  supabase,
}: RoomScreenProps) {
  const { roomName } = useParams<{ roomName: string }>();
  const { profile } = useProfile();
  const [lobbyDone, setLobbyDone] = useState(false);
  const [joinWithCam, setJoinWithCam] = useState(true);
  const [joinWithFrontCam, setJoinWithFrontCam] = useState(true);

  const [token, setToken] = useState<string | null>(null);
  const [livekitReady, setLivekitReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [isFrontCam, setIsFrontCam] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusedIdentity, setFocusedIdentity] = useState<string | null>(null);
  const [camOffSet, setCamOffSet] = useState<Set<string>>(new Set());
  const [cubicle, setCubicle] = useState<CubicleState>({ status: "idle" });
  const [cubicleToken, setCubicleToken] = useState<string | null>(null);
  const [cubicleSet, setCubicleSet] = useState<Set<string>>(new Set());
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);

  const intentionalLeaveRef = useRef(false);
  const connectedRef = useRef(false);
  const micEnabledRef = useRef(false);
  const camEnabledRef = useRef(false);
  const syncRef = useRef<(() => void) | null>(null);
  const roomRef = useRef<Room | null>(null);
  const cubicleRoomRef = useRef<Room | null>(null);
  const cubicleChannelRef = useRef<any>(null);
  const cubicleJoinCancelledRef = useRef(false);
  const cubicleRef = useRef<CubicleState>({ status: "idle" });
  const shownCubicleAlertRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<string>("waiting");
  const reconnectAttemptRef = useRef(0);

  const { colors } = useTokens();

  useRoomPresence(roomName, () => {
    intentionalLeaveRef.current = true;
    setError("Couldn't join the room. Please try again.");
  });
  const { phaseState } = useRoomSession(roomName ?? "");

  const {
    devices: audioDevices,
    active: activeDevice,
    selectDevice,
  } = useAudioDevices();

  useEffect(() => {
    cubicleRef.current = cubicle;
  }, [cubicle]);

  useEffect(() => {
    if (prevPhaseRef.current === "break" && phaseState.phase === "focus") {
      const lp = roomRef.current?.localParticipant;
      if (lp) {
        lp.setMicrophoneEnabled(false)
          .then(() => {
            micEnabledRef.current = lp.isMicrophoneEnabled;
            setMicEnabled(lp.isMicrophoneEnabled);
          })
          .catch(() => {});
      }
    }
    prevPhaseRef.current = phaseState.phase;
  }, [phaseState.phase]);

  useEffect(() => {
    if (!lobbyDone) return;
    if (!profile?.username) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchToken();
        if (!cancelled) setLivekitReady(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to join room");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lobbyDone, profile?.username, retryTick]);

  useEffect(() => {
    if (!livekitReady || !token) return;
    connectedRef.current = false;

    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, reconnectAttemptRef.current);
    const t = setTimeout(() => {
      if (connectedRef.current) return;
      if (reconnectAttemptRef.current < MAX_AUTO_RETRIES) {
        const nextAttempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = nextAttempt;
        setReconnecting(true);
        setToken(null);
        setLivekitReady(false);
        setError(null);
        setRetryTick((x) => x + 1);
      } else {
        setError("Couldn't connect to the room. Please retry.");
        setReconnecting(false);
      }
    }, delay);

    return () => clearTimeout(t);
  }, [livekitReady, token, retryTick]);

  async function resolveSession() {
    if (!supabase) return null;
    for (let i = 0; i < 12; i++) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) return session;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  async function fetchToken() {
    if (!profile?.username) throw new Error("Profile not ready");

    const session = await resolveSession();
    const headers: Record<string, string> = {};
    if (session) headers["Authorization"] = `Bearer ${session.access_token}`;

    const params = new URLSearchParams({
      room: roomName!,
      username: profile.username,
    });

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < TOKEN_FETCH_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${TOKEN_ENDPOINT}?${params.toString()}`, {
          headers,
        });
        if (!res.ok) throw new Error(`Token server error: ${res.status}`);
        const data = await res.json();
        if (!data.token) throw new Error("No token received");
        setToken(data.token);
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    console.error("Failed to fetch token:", lastErr);
    throw lastErr instanceof Error ? lastErr : new Error("Failed to fetch token");
  }

  async function fetchCubicleToken(cubicleRoomName: string): Promise<string> {
    let headers: Record<string, string> = {};
    if (supabase) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    const res = await fetch(
      `${TOKEN_ENDPOINT}?room=${cubicleRoomName}&username=${profile?.username}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Cubicle token error: ${res.status}`);
    const data = await res.json();
    if (!data.token) throw new Error("No cubicle token received");
    return data.token as string;
  }

  useEffect(() => {
    if (!roomName || !profile?.username || !supabase) return;
    const ch = supabase.channel(`cubicle-signals:${roomName}`);

    ch.on("broadcast", { event: "cubicle-request" }, ({ payload }: any) => {
      if (payload.targetIdentity !== profile.username) return;
      if (cubicleRef.current.status !== "idle") return;
      setCubicle({
        status: "incoming",
        fromIdentity: payload.fromIdentity,
        cubicleRoomName: payload.cubicleRoomName,
      });
    });
    ch.on("broadcast", { event: "cubicle-accept" }, ({ payload }: any) => {
      if (payload.targetIdentity !== profile.username) return;
      if (cubicleRef.current.status !== "requesting") return;
      joinCubicleRoom(payload.cubicleRoomName, payload.fromIdentity);
    });
    ch.on("broadcast", { event: "cubicle-decline" }, ({ payload }: any) => {
      if (payload.targetIdentity !== profile.username) return;
      cubicleJoinCancelledRef.current = true;
      setCubicle({ status: "idle" });
      alert(`${payload.fromIdentity} declined your cubicle request.`);
    });
    ch.on("broadcast", { event: "cubicle-end" }, ({ payload }: any) => {
      if (payload.targetIdentity !== profile.username) return;
      endCubicleLocal(payload.fromIdentity);
    });

    ch.subscribe();
    cubicleChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      cubicleChannelRef.current = null;
    };
  }, [roomName, profile?.username]);

  async function sendCubicleRequest(targetIdentity: string) {
    if (!profile?.username) return;
    if (cubicleRef.current.status !== "idle") {
      alert("End your current cubicle first.");
      return;
    }
    const cubicleRoomName = `cubicle-${[profile.username, targetIdentity].sort().join("-")}-${Date.now()}`;
    cubicleJoinCancelledRef.current = false;
    setCubicle({ status: "requesting", targetIdentity });
    setCubicleSet((p) => new Set(p).add(profile.username!).add(targetIdentity));
    await cubicleChannelRef.current?.send({
      type: "broadcast",
      event: "cubicle-request",
      payload: {
        fromIdentity: profile.username,
        targetIdentity,
        cubicleRoomName,
      },
    });
  }

  async function acceptCubicle() {
    const cur = cubicleRef.current;
    if (cur.status !== "incoming") return;
    const { fromIdentity, cubicleRoomName } = cur;
    cubicleJoinCancelledRef.current = false;
    await cubicleChannelRef.current?.send({
      type: "broadcast",
      event: "cubicle-accept",
      payload: {
        fromIdentity: profile?.username,
        targetIdentity: fromIdentity,
        cubicleRoomName,
      },
    });
    joinCubicleRoom(cubicleRoomName, fromIdentity);
  }

  async function declineCubicle() {
    const cur = cubicleRef.current;
    if (cur.status !== "incoming") return;
    const { fromIdentity } = cur;
    cubicleJoinCancelledRef.current = true;
    await cubicleChannelRef.current?.send({
      type: "broadcast",
      event: "cubicle-decline",
      payload: {
        fromIdentity: profile?.username,
        targetIdentity: fromIdentity,
      },
    });
    setCubicle({ status: "idle" });
    setCubicleSet((p) => {
      const s = new Set(p);
      s.delete(profile?.username ?? "");
      s.delete(fromIdentity);
      return s;
    });
  }

  async function joinCubicleRoom(
    cubicleRoomName: string,
    partnerIdentity: string,
  ) {
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
      await roomRef.current?.localParticipant.setCameraEnabled(false);
      const cToken = await fetchCubicleToken(cubicleRoomName);
      if (cubicleJoinCancelledRef.current) {
        await roomRef.current?.localParticipant.setMicrophoneEnabled(
          micEnabledRef.current,
        );
        await roomRef.current?.localParticipant.setCameraEnabled(
          camEnabledRef.current,
        );
        return;
      }
      setCubicleToken(cToken);
      setCubicle({ status: "active", partnerIdentity, cubicleRoomName });
      setCubicleSet((p) =>
        new Set(p).add(profile?.username ?? "").add(partnerIdentity),
      );
    } catch (e: any) {
      alert(`Cubicle error: ${e.message}`);
      setCubicle({ status: "idle" });
      await roomRef.current?.localParticipant.setMicrophoneEnabled(
        micEnabledRef.current,
      );
      await roomRef.current?.localParticipant.setCameraEnabled(
        camEnabledRef.current,
      );
    }
  }

  async function endCubicle() {
    const cur = cubicleRef.current;
    if (cur.status !== "active") return;
    await cubicleChannelRef.current?.send({
      type: "broadcast",
      event: "cubicle-end",
      payload: {
        fromIdentity: profile?.username,
        targetIdentity: cur.partnerIdentity,
      },
    });
    endCubicleLocal(cur.partnerIdentity);
  }

  async function endCubicleLocal(partnerIdentity: string) {
    const cub = cubicleRoomRef.current;
    cubicleRoomRef.current = null;
    if (cub) await cub.disconnect();
    setCubicleToken(null);
    setCubicle({ status: "idle" });
    setCubicleSet((p) => {
      const s = new Set(p);
      s.delete(profile?.username ?? "");
      s.delete(partnerIdentity);
      return s;
    });
    const main = roomRef.current;
    if (main && main.state === "connected") {
      await main.localParticipant.setMicrophoneEnabled(micEnabledRef.current);
      await main.localParticipant.setCameraEnabled(camEnabledRef.current);
      micEnabledRef.current = main.localParticipant.isMicrophoneEnabled;
      camEnabledRef.current = main.localParticipant.isCameraEnabled;
      setMicEnabled(micEnabledRef.current);
      setCamEnabled(camEnabledRef.current);
    }
  }

  const room = useMemo(() => {
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720,
        facingMode: "user",
      },
    } as RoomOptions);
    roomRef.current = r;
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick]);

  const cubicleRoom = useMemo(() => {
    if (cubicle.status !== "active" || !cubicleToken) return null;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720,
        facingMode: "user",
      },
    } as RoomOptions);
    cubicleRoomRef.current = r;
    return r;
  }, [cubicleToken]);

  const handleConnected = useCallback(async () => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    reconnectAttemptRef.current = 0;
    setReconnecting(false);
    const r = roomRef.current;
    if (!r) return;

    const sync = () => {
      const rm = roomRef.current;
      if (!rm) return;
      const all: Participant[] = [
        rm.localParticipant,
        ...Array.from(rm.remoteParticipants.values()),
      ];
      setParticipants(all);
      const off = new Set<string>();
      all.forEach((p) => {
        if (
          !p.isCameraEnabled ||
          !p.getTrackPublication(Track.Source.Camera)?.track
        )
          off.add(p.identity);
      });
      setCamOffSet(off);
      micEnabledRef.current = rm.localParticipant.isMicrophoneEnabled;
      camEnabledRef.current = rm.localParticipant.isCameraEnabled;
      setMicEnabled(micEnabledRef.current);
      setCamEnabled(camEnabledRef.current);
    };
    syncRef.current = sync;

    r.on(RoomEvent.ParticipantConnected, sync);
    r.on(RoomEvent.ParticipantDisconnected, sync);
    r.on(RoomEvent.TrackMuted, sync);
    r.on(RoomEvent.TrackUnmuted, sync);
    r.on(RoomEvent.LocalTrackPublished, sync);
    r.on(RoomEvent.LocalTrackUnpublished, sync);
    r.on(RoomEvent.TrackSubscribed, sync);
    r.on(RoomEvent.TrackUnsubscribed, sync);

    const lp = r.localParticipant;
    try {
      await lp.setMicrophoneEnabled(false);
    } catch {}

    if (joinWithCam) {
      let camOk = false;
      for (let i = 0; i < 2 && !camOk; i++) {
        try {
          await lp.setCameraEnabled(true, {
            facingMode: joinWithFrontCam ? "user" : "environment",
          } as any);
          camOk = true;
          setIsFrontCam(joinWithFrontCam);
        } catch {
          await new Promise((res) => setTimeout(res, 500));
        }
      }
    } else {
      try {
        await lp.setCameraEnabled(false);
      } catch {}
    }

    micEnabledRef.current = lp.isMicrophoneEnabled;
    camEnabledRef.current = lp.isCameraEnabled;
    setMicEnabled(micEnabledRef.current);
    setCamEnabled(camEnabledRef.current);
    sync();
  }, [joinWithCam, joinWithFrontCam]);

  const handleDisconnected = useCallback(() => {
    const wasConnected = connectedRef.current;
    connectedRef.current = false;
    reconnectAttemptRef.current = 0;
    setReconnecting(false);
    if (intentionalLeaveRef.current) return;
    if (!wasConnected) return;
    onLeave();
  }, [onLeave]);

  async function toggleMic() {
    if (cubicleRef.current.status === "active") return;
    if (!phaseState.micAllowed) {
      const m = Math.floor(phaseState.remainingSeconds / 60),
        s = phaseState.remainingSeconds % 60;
      alert(
        `Mic locked during focus. Mics unlock in ${m}m ${s}s when the break starts.`,
      );
      return;
    }
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      await lp.setMicrophoneEnabled(!micEnabledRef.current);
    } catch {}
    micEnabledRef.current = lp.isMicrophoneEnabled;
    setMicEnabled(lp.isMicrophoneEnabled);
  }

  async function toggleCam() {
    if (cubicleRef.current.status === "active") return;
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      await lp.setCameraEnabled(!camEnabledRef.current);
    } catch {}
    const actual = lp.isCameraEnabled;
    camEnabledRef.current = actual;
    setCamEnabled(actual);
    if (lp.identity)
      setCamOffSet((p) => {
        const s = new Set(p);
        actual ? s.delete(lp.identity) : s.add(lp.identity);
        return s;
      });
  }

  async function flipCamera() {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const nextFront = !isFrontCam;
    try {
      const pub = lp.getTrackPublication(Track.Source.Camera);
      if (pub?.track) await lp.unpublishTrack(pub.track);
      await lp.setCameraEnabled(true, {
        facingMode: nextFront ? "user" : "environment",
      } as any);
      setIsFrontCam(nextFront);
      camEnabledRef.current = lp.isCameraEnabled;
      setCamEnabled(lp.isCameraEnabled);
    } catch (e: any) {
      alert(`Camera flip failed: ${e.message}`);
    }
  }

  async function leave() {
    intentionalLeaveRef.current = true;
    if (cubicleRef.current.status === "active") await endCubicle();
    const sync = syncRef.current;
    const r = roomRef.current;
    if (sync && r) {
      r.off(RoomEvent.ParticipantConnected, sync);
      r.off(RoomEvent.ParticipantDisconnected, sync);
      r.off(RoomEvent.TrackMuted, sync);
      r.off(RoomEvent.TrackUnmuted, sync);
      r.off(RoomEvent.LocalTrackPublished, sync);
      r.off(RoomEvent.LocalTrackUnpublished, sync);
      r.off(RoomEvent.TrackSubscribed, sync);
      r.off(RoomEvent.TrackUnsubscribed, sync);
      syncRef.current = null;
    }
    await r?.disconnect();
    onLeave();
  }

  const focusParticipant = useCallback(
    (id: string) => setFocusedIdentity(id),
    [],
  );
  const unfocusParticipant = useCallback(() => setFocusedIdentity(null), []);

  useEffect(() => {
    if (cubicle.status !== "incoming") {
      shownCubicleAlertRef.current = null;
      return;
    }
    const key = cubicle.fromIdentity;
    if (shownCubicleAlertRef.current === key) return;
    shownCubicleAlertRef.current = key;
    const accepted = window.confirm(
      `${cubicle.fromIdentity} wants to open a private cubicle with you. Accept?`,
    );
    if (accepted) acceptCubicle();
    else declineCubicle();
  }, [cubicle.status]);

  if (!lobbyDone) {
    return (
      <RoomLobby
        roomName={roomName ?? "Room"}
        username={profile?.username ?? ""}
        onJoin={(withCam: any, isFront: any) => {
          setJoinWithCam(withCam);
          setJoinWithFrontCam(isFront ?? true);
          setLobbyDone(true);
        }}
        onCancel={() => {
          intentionalLeaveRef.current = true;
          onLeave();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          background: colors.bg.canvas,
          height: "100dvh",
        }}
      >
        <div
          className="spinner"
          style={{
            width: 36,
            height: 36,
            border: `3px solid ${colors.border.subtle}`,
            borderTopColor: colors.tint.accent,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span
          style={{
            color: colors.text.secondary,
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Joining room…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (reconnecting) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          background: colors.bg.canvas,
          height: "100dvh",
        }}
      >
        <div
          className="spinner"
          style={{
            width: 36,
            height: 36,
            border: `3px solid ${colors.border.subtle}`,
            borderTopColor: colors.tint.accent,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span
          style={{
            color: colors.text.secondary,
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Reconnecting…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !token || !livekitReady) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          height: "100dvh",
          background: colors.bg.canvas,
          padding: 24,
        }}
      >
        <span style={{ color: colors.text.secondary, fontSize: 15, textAlign: "center" }}>
          {error ?? "Couldn't connect to the room."}
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => {
               reconnectAttemptRef.current = 0;
               setReconnecting(false);
              setError(null);
              setToken(null);
              setLivekitReady(false);
              setRetryTick((t) => t + 1);
            }}
            style={{
              padding: "10px 20px",
              borderRadius: 999,
              border: "none",
              background: "#fffd01",
              color: "#0f0f12",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Retry
          </button>
          <button
            onClick={() => {
              intentionalLeaveRef.current = true;
              onLeave();
            }}
            style={{
              padding: "10px 20px",
              borderRadius: 999,
              border: `1px solid ${colors.border.subtle}`,
              background: "transparent",
              color: colors.text.secondary,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <LiveKitRoom
        serverUrl={LIVEKIT_URL}
        token={token}
        connect
        room={room}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={(e: any) => {
          if (!connectedRef.current) {
            console.warn("LiveKit connect error:", e?.message ?? e);
            if (reconnectAttemptRef.current < MAX_AUTO_RETRIES) {
               const nextAttempt = reconnectAttemptRef.current + 1;
               reconnectAttemptRef.current = nextAttempt;
               setReconnecting(true);
              setToken(null);
              setLivekitReady(false);
              setError(null);
              setRetryTick((t) => t + 1);
            } else {
              setError("Couldn't connect to the room. Please retry.");
              setReconnecting(false);
            }
          }
        }}
        style={{ display: "contents" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100dvh",
            background: colors.bg.canvas,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Top bar */}
          <div
            style={{
              background: colors.surface.primary,
              borderBottom: `1px solid ${colors.border.subtle}`,
              flexShrink: 0,
            }}
          >
            <TopBar
              roomName={roomName ?? "Room"}
              participantCount={participants.length}
              onParticipants={() => setSidebarOpen(true)}
              focusedIdentity={focusedIdentity}
              onUnfocus={unfocusParticipant}
              inCubicle={cubicle.status === "active"}
              cubiclePartner={
                cubicle.status === "active" ? cubicle.partnerIdentity : null
              }
              onEndCubicle={endCubicle}
              sessionPhase={phaseState.phase}
              sessionRemainingSeconds={phaseState.remainingSeconds}
            />
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <ConferenceView
              focusedIdentity={focusedIdentity}
              onFocus={focusParticipant}
              onUnfocus={unfocusParticipant}
              camOffSet={camOffSet}
              cubicleSet={cubicleSet}
              onDoubleTap={sendCubicleRequest}
              myIdentity={profile?.username ?? ""}
            />
          </div>

          {/* Control bar */}
          <div
            style={{
              background: colors.surface.primary,
              borderTop: `1px solid ${colors.border.subtle}`,
              flexShrink: 0,
            }}
          >
            <ControlBar
              micEnabled={micEnabled}
              camEnabled={camEnabled}
              isFrontCam={isFrontCam}
              outputLabel={activeDevice.name}
              onMic={toggleMic}
              onCam={toggleCam}
              onFlip={flipCamera}
              onOutput={() => setOutputMenuOpen((v) => !v)}
              onLeave={leave}
              lockedForCubicle={cubicle.status === "active"}
              sessionPhase={phaseState.phase}
              focusRemainingSeconds={
                phaseState.phase === "focus" ? phaseState.remainingSeconds : 0
              }
            />
          </div>

          {/* Audio output picker */}
          {outputMenuOpen && (
            <div
              style={{
                position: "absolute",
                bottom: 80,
                left: "50%",
                transform: "translateX(-50%)",
                background: colors.surface.raised,
                border: `1px solid ${colors.border.strong}`,
                borderRadius: 12,
                padding: 8,
                zIndex: 50,
                minWidth: 180,
              }}
            >
              {audioDevices.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    selectDevice(d.id);
                    setOutputMenuOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background:
                      d.id === activeDevice.id
                        ? colors.tint.accent + "22"
                        : "transparent",
                    color:
                      d.id === activeDevice.id
                        ? colors.tint.accent
                        : colors.text.primary,
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {d.id === activeDevice.id ? "✓  " : "   "}
                  {d.name}
                </button>
              ))}
            </div>
          )}

          {/* Sidebar scrim */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: colors.overlay.scrim,
                zIndex: 10,
                cursor: "pointer",
              }}
            />
          )}

          {/* Sidebar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: SIDEBAR_W,
              background: colors.surface.primary,
              borderLeft: `1px solid ${colors.border.subtle}`,
              zIndex: 20,
              transform: sidebarOpen
                ? "translateX(0)"
                : `translateX(${SIDEBAR_W}px)`,
              transition: "transform 0.22s cubic-bezier(.4,0,.2,1)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ParticipantsSidebar
              participants={participants}
              cubicleSet={cubicleSet}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      </LiveKitRoom>

      {/* Cubicle overlay — separate LiveKit room */}
      {cubicle.status === "active" && cubicleToken && cubicleRoom && (
        <LiveKitRoom
          serverUrl={LIVEKIT_URL}
          token={cubicleToken}
          connect
          audio
          video
          room={cubicleRoom}
          onConnected={() => {}}
          onDisconnected={() => {
            if (cubicleRoomRef.current !== null) return;
            const cur = cubicleRef.current;
            endCubicleLocal(cur.status === "active" ? cur.partnerIdentity : "");
          }}
          onError={(e: any) =>
            alert(`Cubicle error: ${e?.message ?? "Unknown"}`)
          }
          style={{ display: "contents" }}
        >
          <CubicleOverlay
            partnerIdentity={cubicle.partnerIdentity}
            onEnd={endCubicle}
          />
        </LiveKitRoom>
      )}
    </>
  );
}

function CubicleOverlay({
  partnerIdentity,
  onEnd,
}: {
  partnerIdentity: string;
  onEnd: () => void;
}) {
  const allTracks = useTracks([Track.Source.Camera]);
  const { localParticipant } = useLocalParticipant();
  const [elapsed, setElapsed] = useState(0);
  const [myTrackRef, setMyTrackRef] = useState<TrackReference | null>(null);
  const [myTrackSid, setMyTrackSid] = useState<string | null>(null);
  const [partnerReady, setPartnerReady] = useState(false);
  const lpRef = useRef(localParticipant);
  const partnerReadyRef = useRef(false);
  const { colors } = useTokens();

  useEffect(() => {
    lpRef.current = localParticipant;
  }, [localParticipant]);
  useEffect(() => {
    const iv = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!localParticipant) return;
    function sync() {
      const lp = lpRef.current;
      if (!lp) return;
      const pub = lp.getTrackPublication(Track.Source.Camera);
      if (pub?.track && pub.trackSid) {
        const ref: TrackReference = {
          participant: lp,
          publication: pub,
          source: Track.Source.Camera,
        };
        setMyTrackSid((prev) => {
          if (prev !== pub.trackSid) {
            setMyTrackRef(ref);
            return pub.trackSid ?? null;
          }
          return prev;
        });
      } else {
        setMyTrackRef(null);
        setMyTrackSid(null);
      }
    }
    sync();
    localParticipant.on("trackPublished", sync);
    localParticipant.on("trackUnpublished", sync);
    localParticipant.on("localTrackPublished", sync);
    localParticipant.on("trackSubscribed", sync);
    return () => {
      localParticipant.off("trackPublished", sync);
      localParticipant.off("trackUnpublished", sync);
      localParticipant.off("localTrackPublished", sync);
      localParticipant.off("trackSubscribed", sync);
    };
  }, [localParticipant]);

  useEffect(() => {
    const lp = lpRef.current;
    if (!lp) return;
    const pub = lp.getTrackPublication(Track.Source.Camera);
    if (pub?.track && pub.trackSid && pub.trackSid !== myTrackSid) {
      setMyTrackRef({
        participant: lp,
        publication: pub,
        source: Track.Source.Camera,
      });
      setMyTrackSid(pub.trackSid ?? null);
    }
  }, [allTracks]);

  const partnerTrack = allTracks.find(
    (t) => t.participant.identity === partnerIdentity,
  );
  useEffect(() => {
    if (partnerTrack && !partnerReadyRef.current) {
      const t = setTimeout(() => {
        partnerReadyRef.current = true;
        setPartnerReady(true);
      }, 300);
      return () => clearTimeout(t);
    }
    if (!partnerTrack) {
      partnerReadyRef.current = false;
      setPartnerReady(false);
    }
  }, [partnerTrack]);

  const mm = pad2(Math.floor(elapsed / 60));
  const ss = pad2(elapsed % 60);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* Scrim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
        }}
      />

      <div
        style={{
          position: "relative",
          height: "60vh",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
          background: "#000",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: `0.5px solid ${colors.border.subtle}`,
            background: colors.surface.raised,
            flexShrink: 0,
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: colors.tint.accent + "22",
              border: `0.5px solid ${colors.tint.accent}55`,
              borderRadius: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: colors.tint.accent,
                fontFamily: "monospace",
              }}
            >
              ⬡ cubicle
            </span>
          </div>
          <span
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 13,
              color: colors.text.secondary,
              fontFamily: "monospace",
            }}
          >
            {mm}:{ss}
          </span>
          <button
            onClick={onEnd}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: colors.tint.danger,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            End
          </button>
        </div>

        {/* Videos */}
        <div style={{ flex: 1, position: "relative", background: "#000" }}>
          {/* Partner */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              opacity: partnerReady ? 1 : 0,
              transition: "opacity 0.3s",
            }}
          >
            {partnerTrack && (
              <VideoTrack
                key={partnerTrack.publication.trackSid}
                trackRef={partnerTrack}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </div>

          {/* Fallback */}
          {!partnerReady && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: colors.surface.secondary,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  background: colors.surface.raised,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: colors.text.secondary,
                  }}
                >
                  {initials(partnerIdentity)}
                </span>
              </div>
              <span style={{ color: colors.text.secondary, fontSize: 15 }}>
                Waiting for {partnerIdentity}…
              </span>
            </div>
          )}

          {/* My PiP */}
          {myTrackRef && myTrackSid && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                width: 90,
                height: 130,
                borderRadius: 12,
                overflow: "hidden",
                border: `2px solid ${localParticipant?.isSpeaking ? colors.tint.success : colors.border.subtle}`,
                zIndex: 5,
              }}
            >
              <VideoTrack
                key={myTrackSid}
                trackRef={myTrackRef}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Name label */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              zIndex: 3,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: colors.tint.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>
                {initials(partnerIdentity)}
              </span>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color:
                  colors.text.inverse === "#0d0d0d"
                    ? "#fff"
                    : colors.text.inverse,
              }}
            >
              {partnerIdentity}
            </span>
            {partnerTrack?.participant.isSpeaking && (
              <SpeakingBars color={colors.tint.success} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar({
  roomName,
  participantCount,
  onParticipants,
  focusedIdentity,
  onUnfocus,
  sessionPhase,
  sessionRemainingSeconds,
}: {
  roomName: string;
  participantCount: number;
  onParticipants: () => void;
  focusedIdentity: string | null;
  onUnfocus: () => void;
  inCubicle: boolean;
  cubiclePartner: string | null;
  onEndCubicle: () => void;
  sessionPhase: SessionPhase;
  sessionRemainingSeconds: number;
}) {
  const { colors } = useTokens();
  const phaseLabel =
    sessionPhase === "focus"
      ? "Focus"
      : sessionPhase === "break"
        ? "Break"
        : null;
  const pM = Math.floor(sessionRemainingSeconds / 60),
    pS = sessionRemainingSeconds % 60;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "22px 16px",
        gap: 8,
      }}
    >
      {/* Left */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 9,
          overflow: "hidden",
        }}
      >
        {focusedIdentity ? (
          <button
            onClick={onUnfocus}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 9px",
              background: colors.tint.accent + "22",
              border: `0.5px solid ${colors.tint.accent}55`,
              borderRadius: 6,
              cursor: "pointer",
              color: colors.tint.accent,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="10" y1="14" x2="21" y2="3" />
              <line x1="3" y1="21" x2="14" y2="10" />
            </svg>
            Focused: {focusedIdentity}
            <span style={{ fontWeight: 700 }}>✕</span>
          </button>
        ) : (
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: colors.text.primary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {roomName}
          </span>
        )}
      </div>

      {/* Phase badge */}
      {phaseLabel && (
        <div
          style={{
            padding: "4px 9px",
            background: colors.bg.accentDim,
            border: `0.5px solid ${colors.surface.skillhive}`,
            borderRadius: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: colors.text.skillhive,
              fontFamily: "monospace",
            }}
          >
            {phaseLabel} {pad2(pM)}:{pad2(pS)}
          </span>
        </div>
      )}

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onParticipants}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 11px",
            background: colors.surface.secondary,
            border: `0.5px solid ${colors.border.subtle}`,
            borderRadius: 8,
            cursor: "pointer",
            color: colors.text.primary,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {participantCount}
          </span>
        </button>
      </div>
    </div>
  );
}

function ConferenceView({
  focusedIdentity,
  onFocus,
  onUnfocus,
  camOffSet,
  cubicleSet,
  onDoubleTap,
  myIdentity,
}: {
  focusedIdentity: string | null;
  onFocus: (id: string) => void;
  onUnfocus: () => void;
  camOffSet: Set<string>;
  cubicleSet: Set<string>;
  onDoubleTap: (id: string) => void;
  myIdentity: string;
}) {
   const { colors } = useTokens();
  const rawTracks = useTracks([Track.Source.Camera]);
  const [activePage, setActivePage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [topIdentity, setTopIdentity] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingRef = useRef<string | null>(null);

  const speakingKey = rawTracks
    .map((t) => `${t.participant.identity}:${t.participant.isSpeaking}`)
    .join(",");
  useEffect(() => {
    const speaking = rawTracks.find(
      (t) => t.participant.isSpeaking && t.participant.identity !== myIdentity,
    );
    const id = speaking?.participant.identity ?? null;
    if (id === speakingRef.current) return;
    speakingRef.current = id;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (id) {
      debounceRef.current = setTimeout(
        () => setTopIdentity(id),
        SPEAKER_DEBOUNCE_MS,
      );
    } else {
      debounceRef.current = setTimeout(() => setTopIdentity(null), 2000);
    }
  }, [speakingKey]);

  const tracks = useMemo(() => {
    return [...rawTracks].sort((a, b) => {
      const aId = a.participant.identity,
        bId = b.participant.identity;
      if (aId === topIdentity) return -1;
      if (bId === topIdentity) return 1;
      if (aId === myIdentity) return -1;
      if (bId === myIdentity) return 1;
      return aId.localeCompare(bId);
    });
  }, [rawTracks, topIdentity, myIdentity]);

  useEffect(() => {
    const perPage = dims.w > 0 && dims.w < MOBILE_BREAKPOINT ? 4 : TILES_PER_PAGE;
    const total = Math.ceil(Math.max(tracks.length, 1) / perPage);
    if (activePage >= total) setActivePage(0);
  }, [tracks.length, dims.w]);

  const { w: gridW, h: gridH } = dims;

  function tp(ref: TrackReference) {
    return {
      trackRef: ref,
      isCamOff: camOffSet.has(ref.participant.identity),
      inCubicle: cubicleSet.has(ref.participant.identity),
      onFocus,
      onUnfocus,
      isFocused: false,
      onDoubleTap,
      isMe: ref.participant.identity === myIdentity,
    };
  }

  if (tracks.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 44, color: colors.surface.raised }}>⬡</span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: colors.text.secondary,
          }}
        >
          Waiting for participants
        </span>
        <span style={{ fontSize: 13, color: colors.text.tertiary }}>
          Share the room name to invite others
        </span>
      </div>
    );
  }

  const isMobile = gridW > 0 && gridW < MOBILE_BREAKPOINT;

  if (focusedIdentity && gridW > 0 && gridH > 0) {
    const ft = tracks.find((t) => t.participant.identity === focusedIdentity);
    const ot = tracks.filter((t) => t.participant.identity !== focusedIdentity);
    const filmstripVisible = ot.length > 0;
    const SH = isMobile ? 92 : 120;
    const STW = isMobile ? 68 : 96;
    const mainAvailH = gridH - (filmstripVisible ? SH + GRID_GAP : 0);
    const mainLayout = computeOptimalGrid(1, gridW, mainAvailH);

    const mainTile = ft ? (
      <ParticipantTile
        {...tp(ft)}
        width={mainLayout.tileW}
        height={mainLayout.tileH}
        isFocused
      />
    ) : (
      <AvatarTile
        identity={focusedIdentity}
        width={mainLayout.tileW}
        height={mainLayout.tileH}
        isFocused
        inCubicle={cubicleSet.has(focusedIdentity)}
        onFocus={onFocus}
        onUnfocus={onUnfocus}
        onDoubleTap={onDoubleTap}
        isMe={focusedIdentity === myIdentity}
      />
    );

    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            background: "#000",
          }}
        >
          {mainTile}
        </div>
        {filmstripVisible && (
          <div
            style={{
              height: SH,
              background: colors.bg.canvas,
              display: "flex",
              overflowX: "auto",
              alignItems: "center",
              gap: GRID_GAP,
              padding: "0 8px",
              flexShrink: 0,
            }}
          >
            {ot.map((ref) => (
              <ParticipantTile
                key={`s-${ref.participant.identity}`}
                {...tp(ref)}
                width={STW}
                height={SH - 16}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (gridW === 0 || gridH === 0) {
    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
  }

  const perPage = isMobile ? 4 : TILES_PER_PAGE;
  const pages: (typeof tracks)[] = [];
  for (let i = 0; i < tracks.length; i += perPage) pages.push(tracks.slice(i, i + perPage));
  const showPagination = pages.length > 1;
  const DH = showPagination ? 28 : 0;
  const pgH = gridH - DH;

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {pages.map((pt, pi) => {
          if (pi !== activePage) return null;
          const layout = computeOptimalGrid(pt.length, gridW, pgH);
          return (
            <div
              key={pi}
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexWrap: "wrap",
                alignContent: "center",
                justifyContent: "center",
                gap: GRID_GAP,
              }}
            >
              {pt.map((r) => (
                <ParticipantTile
                  key={r.participant.identity}
                  {...tp(r)}
                  width={layout.tileW}
                  height={layout.tileH}
                />
              ))}
            </div>
          );
        })}
      </div>
      {showPagination && (
        <div
          style={{
            height: DH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setActivePage(i)}
              style={{
                height: 7,
                width: i === activePage ? 18 : 7,
                borderRadius: 3.5,
                background:
                  i === activePage ? colors.tint.accent : colors.border.subtle,
                border: "none",
                padding: 0,
                cursor: "pointer",
                transition: "width 0.2s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParticipantTile({
  trackRef,
  width,
  height,
  isCamOff,
  inCubicle,
  onFocus,
  onUnfocus,
  isFocused,
  onDoubleTap,
  isMe,
}: {
  trackRef: TrackReference;
  width: number;
  height: number;
  isCamOff: boolean;
  inCubicle: boolean;
  onFocus: (id: string) => void;
  onUnfocus: () => void;
  isFocused: boolean;
  onDoubleTap: (id: string) => void;
  isMe: boolean;
}) {
  const { colors } = useTokens();
  const { participant: p } = trackRef;
  const isSpeaking = p.isSpeaking,
    isMuted = !p.isMicrophoneEnabled;
  const [menuVisible, setMenuVisible] = useState(false);
  const lastTap = useRef<number>(0);

  function handleClick() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!isMe) onDoubleTap(p.identity);
      lastTap.current = 0;
    } else lastTap.current = now;
  }

  const borderColor = inCubicle
    ? colors.tint.accent
    : isSpeaking
      ? colors.tint.success
      : isFocused
        ? colors.tint.accent
        : colors.border.subtle;
  const borderWidth = inCubicle || isSpeaking || isFocused ? 2 : 1;

  return (
    <div
      onClick={handleClick}
      style={{
        width,
        height,
        overflow: "hidden",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
        background: colors.surface.primary,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: 12,
        opacity: inCubicle && !isMe ? 0.5 : 1,
        boxSizing: "border-box",
        transition: "width 0.15s ease, height 0.15s ease",
      }}
    >
      <VideoTrack
        trackRef={trackRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {inCubicle && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 5,
            padding: "3px 8px",
            background: colors.tint.accent + "cc",
            borderRadius: 6,
          }}
        >
          <span
            style={{
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "monospace",
            }}
          >
            ⬡ cubicle
          </span>
        </div>
      )}

      {isCamOff && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: colors.bg.muted,
          }}
        >
          <div
            style={{
              width: height * 0.32,
              height: height * 0.32,
              borderRadius: height * 0.16,
              background: colors.surface.raised,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: height * 0.12,
                fontWeight: 700,
                color: colors.text.secondary,
              }}
            >
              {initials(p.identity)}
            </span>
          </div>
          <span
            style={{
              fontSize: Math.max(10, height * 0.065),
              fontWeight: 600,
              color: colors.text.secondary,
              maxWidth: "80%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.identity}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              background: colors.tint.danger + "20",
              borderRadius: 5,
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.tint.danger}
              strokeWidth="2"
            >
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: colors.tint.danger,
              }}
            >
              Camera off
            </span>
          </div>
        </div>
      )}

      {!isCamOff && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 9px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(0,0,0,0.4)",
              padding: "4px 6px",
              border: "0.5px solid #7e7e7e",
              borderRadius: 5,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                background: colors.tint.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 5,
              }}
            >
              <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>
                {initials(p.identity)}
              </span>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#fff",
                marginRight: "auto",
              }}
            >
              {p.identity}
            </span>
          </div>
          {isMuted && (
            <div
              style={{
                padding: "2px 5px",
                background: colors.tint.danger + "20",
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: colors.tint.danger,
                }}
              >
                MIC OFF
              </span>
            </div>
          )}
          {isSpeaking && <SpeakingBars color={colors.tint.success} />}
        </div>
      )}

      {/* ⋮ Menu button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuVisible(true);
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "rgba(0,0,0,0.45)",
          border: "none",
          borderRadius: 6,
          padding: "6px 5px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: 3,
              borderRadius: 1.5,
              background: "#fff",
            }}
          />
        ))}
      </button>

      {menuVisible && (
        <TileMenu
          visible
          identity={p.identity}
          isFocused={isFocused}
          onClose={() => setMenuVisible(false)}
          onFocus={() => {
            setMenuVisible(false);
            onFocus(p.identity);
          }}
          onUnfocus={() => {
            setMenuVisible(false);
            onUnfocus();
          }}
          onCubicle={
            !isMe
              ? () => {
                  setMenuVisible(false);
                  onDoubleTap(p.identity);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function AvatarTile({
  identity,
  width,
  height,
  isFocused,
  inCubicle,
  onFocus,
  onUnfocus,
  onDoubleTap,
  isMe,
}: {
  identity: string;
  width: number;
  height: number;
  isFocused: boolean;
  inCubicle: boolean;
  onFocus: (id: string) => void;
  onUnfocus: () => void;
  onDoubleTap: (id: string) => void;
  isMe: boolean;
}) {
  const { colors } = useTokens();
  const [menuVisible, setMenuVisible] = useState(false);
  const lastTap = useRef<number>(0);
  function handleClick() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!isMe) onDoubleTap(identity);
      lastTap.current = 0;
    } else lastTap.current = now;
  }
  return (
    <div
      onClick={handleClick}
      style={{
        width,
        height,
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
        background: colors.surface.secondary,
        border: `${inCubicle || isFocused ? 2 : 1}px solid ${inCubicle || isFocused ? colors.tint.accent : colors.border.subtle}`,
        borderRadius: 12,
        opacity: inCubicle && !isMe ? 0.5 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        transition: "width 0.15s ease, height 0.15s ease",
      }}
    >
      {inCubicle && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            padding: "3px 8px",
            background: colors.tint.accent + "cc",
            borderRadius: 6,
            zIndex: 5,
          }}
        >
          <span
            style={{
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "monospace",
            }}
          >
            ⬡ cubicle
          </span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: height * 0.32,
            height: height * 0.32,
            borderRadius: height * 0.16,
            background: colors.surface.raised,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: height * 0.12,
              fontWeight: 700,
              color: colors.text.secondary,
            }}
          >
            {initials(identity)}
          </span>
        </div>
        <span
          style={{
            fontSize: Math.max(10, height * 0.065),
            fontWeight: 600,
            color: colors.text.secondary,
          }}
        >
          {identity}
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuVisible(true);
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "rgba(0,0,0,0.45)",
          border: "none",
          borderRadius: 6,
          padding: "6px 5px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: 3,
              borderRadius: 1.5,
              background: "#fff",
            }}
          />
        ))}
      </button>
      {menuVisible && (
        <TileMenu
          visible
          identity={identity}
          isFocused={isFocused}
          onClose={() => setMenuVisible(false)}
          onFocus={() => {
            setMenuVisible(false);
            onFocus(identity);
          }}
          onUnfocus={() => {
            setMenuVisible(false);
            onUnfocus();
          }}
          onCubicle={
            !isMe
              ? () => {
                  setMenuVisible(false);
                  onDoubleTap(identity);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function TileMenu({
  visible,
  identity,
  isFocused,
  onClose,
  onFocus,
  onUnfocus,
  onCubicle,
}: {
  visible: boolean;
  identity: string;
  isFocused: boolean;
  onClose: () => void;
  onFocus: () => void;
  onUnfocus: () => void;
  onCubicle?: () => void;
}) {
  const { colors } = useTokens();
  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: colors.overlay.scrim,
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: colors.surface.raised,
          border: `1px solid ${colors.border.strong}`,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 28,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 20px",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              background: colors.tint.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
              {initials(identity)}
            </span>
          </div>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: colors.text.primary,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {identity}
          </span>
        </div>
        <div
          style={{
            height: 1,
            background: colors.border.subtle,
            marginBottom: 6,
          }}
        />

        {/* Focus / Unfocus */}
        {!isFocused ? (
          <MenuItem
            icon={<MaximizeIcon color={colors.tint.accent} />}
            iconBg={colors.tint.accent + "22"}
            label="Focus"
            sub="Pin this participant full screen"
            onClick={onFocus}
          />
        ) : (
          <MenuItem
            icon={<MinimizeIcon color={colors.tint.success} />}
            iconBg={colors.tint.success + "22"}
            label="Unfocus"
            sub="Return to grid view"
            onClick={onUnfocus}
          />
        )}

        {onCubicle && (
          <MenuItem
            icon={<RadioIcon color={colors.tint.accent} />}
            iconBg={colors.tint.accent + "22"}
            label="Open Cubicle"
            sub={`Private space with ${identity}`}
            onClick={onCubicle}
          />
        )}

        <button
          onClick={onClose}
          style={{
            display: "block",
            width: "100%",
            padding: "15px 20px",
            marginTop: 6,
            borderTop: `1px solid ${colors.border.subtle}`,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: colors.text.secondary,
            fontSize: 15,
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  iconBg,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sub: string;
  onClick: () => void;
}) {
    const { colors } = useTokens();
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "15px 20px",
        width: "100%",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary }}
        >
          {label}
        </div>
        <div
          style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}
        >
          {sub}
        </div>
      </div>
    </button>
  );
}

function SpeakingBars({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
      {[8, 14, 8].map((h, i) => (
        <div
          key={i}
          style={{ width: 3, height: h, borderRadius: 2, background: color }}
        />
      ))}
    </div>
  );
}

function ParticipantsSidebar({
  participants,
  cubicleSet,
  onClose,
}: {
  participants: Participant[];
  cubicleSet: Set<string>;
  onClose: () => void;
}) {
  const { colors } = useTokens();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 18px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: colors.text.primary,
            flex: 1,
          }}
        >
          Participants
        </span>
        <div
          style={{
            background: colors.tint.accent + "22",
            borderRadius: 10,
            padding: "3px 9px",
          }}
        >
          <span
            style={{ fontSize: 12, fontWeight: 700, color: colors.tint.accent }}
          >
            {participants.length}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: colors.surface.secondary,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.text.secondary,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ✕
        </button>
      </div>
      <div
        style={{ height: 1, background: colors.border.subtle, flexShrink: 0 }}
      />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {participants.map((p, idx) => {
          const speaking = p.isSpeaking,
            muted = !p.isMicrophoneEnabled,
            inCubicle = cubicleSet.has(p.identity);
          const badgeColor = inCubicle
            ? colors.tint.accent
            : muted
              ? colors.tint.danger
              : colors.tint.success;
          const badgeLabel = inCubicle ? "CUBICLE" : muted ? "MUTED" : "LIVE";
          return (
            <div
              key={p.identity}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 18px",
                borderBottom: `0.5px solid ${colors.border.subtle}`,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: colors.tint.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `2px solid ${speaking ? colors.tint.success : "transparent"}`,
                  flexShrink: 0,
                }}
              >
                <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
                  {initials(p.identity)}
                </span>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: colors.text.primary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.identity}
                  {idx === 0 ? "  (You)" : ""}
                </div>
                <div style={{ fontSize: 12, color: colors.text.tertiary }}>
                  {inCubicle
                    ? "In cubicle"
                    : speaking
                      ? "Speaking…"
                      : "In meeting"}
                </div>
              </div>
              <div
                style={{
                  padding: "4px 8px",
                  background: badgeColor + "20",
                  borderRadius: 5,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: badgeColor,
                    letterSpacing: 0.3,
                  }}
                >
                  {badgeLabel}
                </span>
              </div>
            </div>
          );
        })}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function ControlBar({
  micEnabled,
  camEnabled,
  isFrontCam,
  outputLabel,
  onMic,
  onCam,
  onFlip,
  onOutput,
  onLeave,
  lockedForCubicle,
  sessionPhase,
  focusRemainingSeconds,
}: {
  micEnabled: boolean;
  camEnabled: boolean;
  isFrontCam: boolean;
  outputLabel: string;
  onMic: () => void;
  onCam: () => void;
  onFlip: () => void;
  onOutput: () => void;
  onLeave: () => void;
  lockedForCubicle: boolean;
  sessionPhase: SessionPhase;
  focusRemainingSeconds: number;
}) {
  const micLocked = lockedForCubicle || sessionPhase === "focus";
  const m = Math.floor(focusRemainingSeconds / 60),
    s = focusRemainingSeconds % 60;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-around",
        padding: "14px 4px 14px",
      }}
    >
      <CtrlBtn
        icon={<MicIcon on={micEnabled} />}
        label={micEnabled ? "Mute" : "Unmute"}
        sublabel={
          sessionPhase === "focus"
            ? `${m}m ${pad2(s)}s`
            : sessionPhase === "break"
              ? "mic open"
              : undefined
        }
        onPress={onMic}
        state={micLocked ? "off" : micEnabled ? "on" : "off"}
        disabled={micLocked}
      />
      <CtrlBtn
        icon={<CamIcon on={camEnabled} />}
        label={camEnabled ? "Stop Video" : "Start Video"}
        onPress={onCam}
        state={lockedForCubicle ? "off" : camEnabled ? "on" : "off"}
        disabled={lockedForCubicle}
      />
      <CtrlBtn
        icon={<FlipIcon />}
        label={isFrontCam ? "Rear Cam" : "Front Cam"}
        onPress={onFlip}
        state="on"
      />
      <CtrlBtn
        icon={<VolumeIcon />}
        label={outputLabel}
        onPress={onOutput}
        state="on"
      />
      <CtrlBtn
        icon={<span style={{ fontSize: 16 }}>✕</span>}
        label="End"
        onPress={onLeave}
        state="danger"
      />
    </div>
  );
}

function CtrlBtn({
  icon,
  label,
  sublabel,
  onPress,
  state,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onPress: () => void;
  state: "on" | "off" | "danger";
  disabled?: boolean;
}) {
  const { colors } = useTokens();
  const circleBg =
    state === "off"
      ? colors.tint.danger + "20"
      : state === "danger"
        ? colors.tint.danger
        : colors.surface.secondary;
  const circleBdr =
    state === "off"
      ? colors.tint.danger + "45"
      : state === "danger"
        ? colors.tint.danger
        : colors.border.subtle;
  const iconClr =
    state === "off"
      ? colors.tint.danger
      : state === "danger"
        ? colors.text.inverse
        : colors.text.primary;
  const lblClr =
    state === "off" || state === "danger"
      ? colors.tint.danger
      : colors.text.secondary;

  return (
    <button
      onClick={onPress}
      disabled={disabled}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        minWidth: 56,
        maxWidth: 68,
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          background: circleBg,
          border: `1px solid ${circleBdr}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 18, color: iconClr, lineHeight: 1 }}>
          {icon}
        </span>
      </div>
      {sublabel && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: colors.text.tertiary,
            marginBottom: -3,
          }}
        >
          {sublabel}
        </span>
      )}
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: lblClr,
          textAlign: "center",
          maxWidth: 64,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function MicIcon({ on }: { on: boolean }) {
  return on ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function CamIcon({ on }: { on: boolean }) {
  return on ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function FlipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="1 4 1 10 7 10" />
      <polyline points="23 20 23 14 17 14" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}
function VolumeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
function MaximizeIcon({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}
function MinimizeIcon({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="21" y2="3" />
      <line x1="3" y1="21" x2="14" y2="10" />
    </svg>
  );
}
function RadioIcon({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}