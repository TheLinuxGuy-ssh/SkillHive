import { useCallback, useEffect, useState } from "react";
import {
  fetchMyConnection,
  fetchProjectCodingTime,
  fetchUserCodingTime,
  type ProjectCodingTime,
  type TrackerConnectionInfo,
  type UserCodingTime,
} from "@/lib/timeTracker";

/** Current user's tracker connection (null = not connected). */
export function useTrackerConnection(): {
  connection: TrackerConnectionInfo | null;
  loading: boolean;
  refresh: () => void;
} {
  const [connection, setConnection] = useState<TrackerConnectionInfo | null>(null);
  const [loadedNonce, setLoadedNonce] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (loadedNonce === nonce) return;
    let cancelled = false;
    void fetchMyConnection().then((c) => {
      if (!cancelled) {
        setConnection(c);
        setLoadedNonce(nonce);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [nonce, loadedNonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { connection, loading: loadedNonce !== nonce, refresh };
}

/**
 * Coding time for one SkillHive project. Returns null when the viewer isn't
 * allowed to see it (server enforces is_public / ownership).
 */
export function useProjectCodingTime(projectId: string | undefined): {
  coding: ProjectCodingTime | null;
  loading: boolean;
  refresh: () => void;
} {
  const [coding, setCoding] = useState<ProjectCodingTime | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = projectId ? `${projectId}#${nonce}` : null;

  useEffect(() => {
    if (!projectId || !key || loadedFor === key) return;
    let cancelled = false;
    void fetchProjectCodingTime(projectId).then((c) => {
      if (!cancelled) {
        setCoding(c);
        setLoadedFor(key);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, key, loadedFor]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { coding, loading: loadedFor !== key, refresh };
}

/** A user's aggregate coding stats (profile page). Null when private/absent. */
export function useUserCodingStats(userId: string | undefined): {
  stats: UserCodingTime | null;
  loading: boolean;
  refresh: () => void;
} {
  const [stats, setStats] = useState<UserCodingTime | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = userId ? `${userId}#${nonce}` : null;

  useEffect(() => {
    if (!userId || !key || loadedFor === key) return;
    let cancelled = false;
    void fetchUserCodingTime(userId).then((s) => {
      if (!cancelled) {
        setStats(s);
        setLoadedFor(key);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, key, loadedFor]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { stats, loading: loadedFor !== key, refresh };
}
