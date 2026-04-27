import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const GAME_GEARS_ROOT = "/Users/a1234/Documents/GAME GEARS";
const REGISTRY_PATH = path.join(GAME_GEARS_ROOT, ".pipeline_registry.json");

const cors = (res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  cors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });

const readRegistry = (): Record<string, string> => {
  const raw = readFileSync(REGISTRY_PATH, "utf-8");
  return (JSON.parse(raw) as { projects: Record<string, string> }).projects;
};

const parseTimestamp = (ts: string): number => {
  const m = ts.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
  if (!m) return 0;
  return (
    Number(m[1]) * 3600 +
    Number(m[2]) * 60 +
    Number(m[3]) +
    Number(m[4]) / 1000
  );
};

type WordSpan = { start: number; end: number; text: string };

type Clip = {
  id: string;
  source: string;
  inSec: number;
  outSec: number;
  transitionAfter: string;
};

type Chunk = { filename: string; durationSec: number };

// Build a global timeline of word boundaries from a transcript.json.
// Whisper transcript timestamps are relative to the START of the concat audio
// (i.e. start of E<N>'s first chunk). We reconstruct per-chunk-local boundaries
// by mapping globalSec → (chunkFilename, localSec) using the chunk durations.
const flattenWordsToChunks = (
  transcript: { transcription: Array<{ timestamps: { from: string; to: string }; tokens?: Array<{ timestamps: { from: string; to: string }; text: string }> }> },
  chunks: Chunk[],
): Map<string, WordSpan[]> => {
  const perChunk = new Map<string, WordSpan[]>();
  // build global→chunk lookup
  const offsets: Array<{ filename: string; start: number; end: number }> = [];
  let cursor = 0;
  for (const c of chunks) {
    offsets.push({
      filename: c.filename,
      start: cursor,
      end: cursor + c.durationSec,
    });
    cursor += c.durationSec;
  }
  const findChunk = (sec: number) => offsets.find((o) => sec >= o.start && sec < o.end);

  for (const item of transcript.transcription) {
    const words = item.tokens && item.tokens.length > 0
      ? item.tokens.map((tk) => ({
          start: parseTimestamp(tk.timestamps.from),
          end: parseTimestamp(tk.timestamps.to),
          text: tk.text,
        }))
      : [
          {
            start: parseTimestamp(item.timestamps.from),
            end: parseTimestamp(item.timestamps.to),
            text: "",
          },
        ];
    for (const w of words) {
      // skip empty/whitespace tokens (Whisper emits boundary markers)
      if (!w.text || /^\s*$/.test(w.text)) continue;
      const chunk = findChunk((w.start + w.end) / 2);
      if (!chunk) continue;
      const localStart = w.start - chunk.start;
      const localEnd = w.end - chunk.start;
      const arr = perChunk.get(chunk.filename) ?? [];
      arr.push({ start: localStart, end: localEnd, text: w.text });
      perChunk.set(chunk.filename, arr);
    }
  }
  // ensure sorted
  for (const arr of perChunk.values()) arr.sort((a, b) => a.start - b.start);
  return perChunk;
};

const snapToWordBoundary = (
  sec: number,
  words: WordSpan[],
  side: "start" | "end",
  tolerance = 0.5,
): number => {
  if (words.length === 0) return sec;
  let best = sec;
  let bestDist = Infinity;
  for (const w of words) {
    const candidate = side === "start" ? w.start : w.end;
    const d = Math.abs(candidate - sec);
    if (d < bestDist && d <= tolerance) {
      best = candidate;
      bestDist = d;
    }
  }
  return Math.round(best * 100) / 100;
};

const loadEditState = (
  seriesFolder: string,
  episode: number,
): { clips: Clip[]; transitionFrames: number; fadeInFrames: number; fadeOutFrames: number } | null => {
  const file = path.join(seriesFolder, ".gg-editor", `E${episode}.edit.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8"));
};

const saveEditState = (
  seriesFolder: string,
  episode: number,
  data: { clips: Clip[]; transitionFrames: number; fadeInFrames: number; fadeOutFrames: number },
) => {
  const file = path.join(seriesFolder, ".gg-editor", `E${episode}.edit.json`);
  const payload = { version: 1, ...data, savedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
};

const loadTranscript = (seriesFolder: string, episode: number) => {
  const file = path.join(seriesFolder, ".gg-editor", `E${episode}.transcript.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8"));
};

// look up chunk durations using parseMedia results from /api/assets cache —
// the easy way: import it from the same registry the assets endpoint already
// exposes. To avoid a circular dep we just re-call it via HTTP (localhost).
const fetchChunks = async (series: string, episode: number): Promise<Chunk[]> => {
  const r = await fetch(
    `http://localhost:4000/api/assets?series=${encodeURIComponent(series)}&episode=${episode}`,
  );
  if (!r.ok) return [];
  const data = (await r.json()) as { chunks?: Array<{ filename: string; durationSec: number | null }> };
  return (data.chunks ?? []).map((c) => ({ filename: c.filename, durationSec: c.durationSec ?? 0 }));
};

const applyAutoCut = async (
  series: string,
  episode: number,
): Promise<{ updated: number; total: number }> => {
  const folder = readRegistry()[series];
  if (!folder) throw new Error("series not found");
  const edit = loadEditState(folder, episode);
  if (!edit) throw new Error("no edit.json yet — open the editor and save first");
  const transcript = loadTranscript(folder, episode);
  if (!transcript) throw new Error("no transcript.json yet — run транскрипцию");
  const chunks = await fetchChunks(series, episode);
  const wordsByChunk = flattenWordsToChunks(transcript, chunks);

  // chunk durations indexed by filename for clamping
  const durations = new Map<string, number>();
  for (const ch of chunks) durations.set(ch.filename, ch.durationSec);

  let updated = 0;
  const next: Clip[] = edit.clips.map((c) => {
    const words = wordsByChunk.get(c.source);
    if (!words || words.length === 0) return c;
    const dur = durations.get(c.source) ?? c.outSec;
    const rawIn = snapToWordBoundary(c.inSec, words, "start");
    const rawOut = snapToWordBoundary(c.outSec, words, "end");
    // clamp to [0, chunkDuration]
    const snappedIn = Math.max(0, Math.min(rawIn, dur - 0.05));
    const snappedOut = Math.max(snappedIn + 0.05, Math.min(rawOut, dur));
    if (snappedIn === c.inSec && snappedOut === c.outSec) return c;
    updated++;
    return {
      ...c,
      inSec: Math.round(snappedIn * 100) / 100,
      outSec: Math.round(snappedOut * 100) / 100,
    };
  });
  saveEditState(folder, episode, { ...edit, clips: next });
  return { updated, total: edit.clips.length };
};

const applySkipSilence = async (
  series: string,
  episode: number,
  minGapSec: number,
): Promise<{ removed: number; clipsAfter: number }> => {
  const folder = readRegistry()[series];
  if (!folder) throw new Error("series not found");
  const edit = loadEditState(folder, episode);
  if (!edit) throw new Error("no edit.json yet");
  const transcript = loadTranscript(folder, episode);
  if (!transcript) throw new Error("no transcript.json yet");
  const chunks = await fetchChunks(series, episode);
  const wordsByChunk = flattenWordsToChunks(transcript, chunks);

  let removed = 0;
  const nextClips: Clip[] = [];
  for (const c of edit.clips) {
    const words = wordsByChunk.get(c.source) ?? [];
    const inside = words.filter(
      (w) => w.end > c.inSec && w.start < c.outSec,
    );
    if (inside.length < 2) {
      nextClips.push(c);
      continue;
    }
    // walk through words inside the clip, look for gaps > minGapSec
    let segStart = c.inSec;
    for (let i = 0; i < inside.length - 1; i++) {
      const cur = inside[i]!;
      const nxt = inside[i + 1]!;
      const gap = nxt.start - cur.end;
      if (gap > minGapSec) {
        // close current sub-clip up to end of cur word
        const segEnd = Math.min(c.outSec, cur.end);
        if (segEnd > segStart + 0.05) {
          nextClips.push({
            ...c,
            id: `${c.id}-s${nextClips.length}-${Date.now()}`,
            inSec: Math.round(segStart * 100) / 100,
            outSec: Math.round(segEnd * 100) / 100,
            transitionAfter: "cut",
          });
        }
        segStart = nxt.start;
        removed++;
      }
    }
    // tail
    if (c.outSec > segStart + 0.05) {
      nextClips.push({
        ...c,
        id: `${c.id}-tail-${Date.now()}`,
        inSec: Math.round(segStart * 100) / 100,
        outSec: c.outSec,
      });
    }
  }
  saveEditState(folder, episode, { ...edit, clips: nextClips });
  return { removed, clipsAfter: nextClips.length };
};

export const handleAutoCut = async (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
    cors(res);
    res.statusCode = 204;
    res.end();
    return;
  }
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    return json(res, 405, { error: "POST required" });
  }
  try {
    const body = await readBody(req);
    const parsed = body
      ? (JSON.parse(body) as { series?: string; episode?: number })
      : {};
    if (!parsed.series || typeof parsed.episode !== "number") {
      return json(res, 400, { error: "series + episode required" });
    }
    const result = await applyAutoCut(parsed.series, parsed.episode);
    json(res, 200, { ok: true, ...result });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleSkipSilence = async (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
    cors(res);
    res.statusCode = 204;
    res.end();
    return;
  }
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    return json(res, 405, { error: "POST required" });
  }
  try {
    const body = await readBody(req);
    const parsed = body
      ? (JSON.parse(body) as {
          series?: string;
          episode?: number;
          minGapSec?: number;
        })
      : {};
    if (!parsed.series || typeof parsed.episode !== "number") {
      return json(res, 400, { error: "series + episode required" });
    }
    const result = await applySkipSilence(
      parsed.series,
      parsed.episode,
      parsed.minGapSec ?? 1.5,
    );
    json(res, 200, { ok: true, ...result });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};
