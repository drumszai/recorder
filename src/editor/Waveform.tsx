import { getAudioData, type MediaUtilsAudioData } from "@remotion/media-utils";
import React, { useEffect, useMemo, useState } from "react";

type CacheEntry =
  | { kind: "loading" }
  | { kind: "ready"; data: MediaUtilsAudioData }
  | { kind: "error"; error: string };

const cache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<() => void>>();

const notify = (key: string) => {
  const set = subscribers.get(key);
  if (!set) return;
  for (const fn of set) fn();
};

const ensureLoading = (key: string, url: string) => {
  if (cache.has(key)) return;
  cache.set(key, { kind: "loading" });
  getAudioData(url)
    .then((data) => {
      cache.set(key, { kind: "ready", data });
      notify(key);
    })
    .catch((e) => {
      cache.set(key, { kind: "error", error: (e as Error).message });
      notify(key);
    });
};

const useWaveformData = (key: string, url: string) => {
  const [, force] = useState(0);
  useEffect(() => {
    ensureLoading(key, url);
    let set = subscribers.get(key);
    if (!set) {
      set = new Set();
      subscribers.set(key, set);
    }
    const fn = () => force((n) => n + 1);
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }, [key, url]);
  return cache.get(key);
};

const downsamplePeaks = (
  channel: Float32Array,
  startSec: number,
  endSec: number,
  sampleRate: number,
  bins: number,
): number[] => {
  const startIdx = Math.max(0, Math.floor(startSec * sampleRate));
  const endIdx = Math.min(channel.length, Math.floor(endSec * sampleRate));
  if (endIdx <= startIdx) return [];
  const span = endIdx - startIdx;
  const samplesPerBin = Math.max(1, Math.floor(span / bins));
  const out: number[] = [];
  for (let i = 0; i < bins; i++) {
    const a = startIdx + i * samplesPerBin;
    const b = Math.min(endIdx, a + samplesPerBin);
    let max = 0;
    for (let j = a; j < b; j++) {
      const v = Math.abs(channel[j] ?? 0);
      if (v > max) max = v;
    }
    out.push(max);
  }
  return out;
};

type Props = {
  cacheKey: string;
  url: string;
  inSec: number;
  outSec: number;
  height?: number;
  bins?: number;
};

export const Waveform: React.FC<Props> = ({
  cacheKey,
  url,
  inSec,
  outSec,
  height = 24,
  bins = 80,
}) => {
  const entry = useWaveformData(cacheKey, url);

  const peaks = useMemo(() => {
    if (!entry || entry.kind !== "ready") return null;
    const ch = entry.data.channelWaveforms[0];
    if (!ch) return null;
    return downsamplePeaks(ch, inSec, outSec, entry.data.sampleRate, bins);
  }, [entry, inSec, outSec, bins]);

  if (!entry) return null;
  if (entry.kind === "error") return null;

  if (entry.kind === "loading" || !peaks) {
    return (
      <div
        style={{
          height,
          opacity: 0.25,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          color: "#fff",
        }}
      >
        ▣▣▣
      </div>
    );
  }

  const half = height / 2;
  const segW = 100 / peaks.length;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
    >
      {peaks.map((p, i) => {
        const h = Math.max(1, p * height);
        return (
          <rect
            key={i}
            x={i * segW}
            y={half - h / 2}
            width={segW * 0.8}
            height={h}
            fill="rgba(255,255,255,0.55)"
          />
        );
      })}
    </svg>
  );
};
