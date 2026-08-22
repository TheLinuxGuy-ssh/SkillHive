import { useCallback, useEffect, useRef, useState } from "react";

export type AmbienceKind = "none" | "rain" | "cafe";

const STORAGE_KEY = "skillhive:ambience";

function makeNoiseBuffer(ctx: AudioContext, brown: boolean): AudioBuffer {
  const seconds = 4;
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, rate * seconds, rate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

/**
 * Lightweight ambient soundscapes via Web Audio (rain / cafe murmur).
 * No external assets; synthesised locally. Respects autoplay by only
 * starting from an explicit user action.
 */
export function useAmbience() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{
    source: AudioBufferSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode;
  } | null>(null);
  const [kind, setKind] = useState<AmbienceKind>(() => {
    if (typeof window === "undefined") return "none";
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "rain" || saved === "cafe" ? saved : "none";
  });

  const stop = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    try {
      nodes.source.stop();
      nodes.source.disconnect();
      nodes.gain.disconnect();
      nodes.filter.disconnect();
    } catch {
      /* already stopped */
    }
    nodesRef.current = null;
  }, []);

  const start = useCallback(
    (next: Exclude<AmbienceKind, "none">) => {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();

      stop();

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = makeNoiseBuffer(ctx, next === "cafe");
      source.loop = true;

      if (next === "rain") {
        filter.type = "lowpass";
        filter.frequency.value = 1200;
        gain.gain.value = 0.14;
      } else {
        filter.type = "lowpass";
        filter.frequency.value = 420;
        gain.gain.value = 0.1;
      }

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      nodesRef.current = { source, gain, filter };
    },
    [stop],
  );

  const setAmbience = useCallback(
    (next: AmbienceKind) => {
      setKind(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      if (next === "none") stop();
      else start(next);
    },
    [start, stop],
  );

  useEffect(() => {
    return () => {
      stop();
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        void ctxRef.current.close();
        ctxRef.current = null;
      }
    };
  }, [stop]);

  return { kind, setAmbience };
}
