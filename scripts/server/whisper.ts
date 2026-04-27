import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
  type WhisperModel,
} from "@remotion/install-whisper-cpp";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const WHISPER_VERSION = "1.5.5";
const WHISPER_PATH = path.join(PROJECT_ROOT, "whisper.cpp");
const MODELS_DIR = path.join(WHISPER_PATH, "models");

const GAME_GEARS_ROOT = "/Users/a1234/Documents/GAME GEARS";
const REGISTRY_PATH = path.join(GAME_GEARS_ROOT, ".pipeline_registry.json");

type InstallStatus =
  | "idle"
  | "installing-whisper"
  | "downloading-model"
  | "ready"
  | "error";

type TranscribeStatus =
  | "idle"
  | "extracting-audio"
  | "transcribing"
  | "saving"
  | "done"
  | "error";

const state: {
  install: {
    status: InstallStatus;
    progress: number;
    model: WhisperModel;
    error?: string;
    log: string[];
  };
  transcribe: {
    status: TranscribeStatus;
    progress: number;
    series: string | null;
    episode: number | null;
    transcriptPath?: string;
    srtPath?: string;
    error?: string;
    log: string[];
  };
} = {
  install: {
    status: existsSync(path.join(MODELS_DIR, "ggml-medium.bin")) ? "ready" : "idle",
    progress: 0,
    model: "medium",
    log: [],
  },
  transcribe: {
    status: "idle",
    progress: 0,
    series: null,
    episode: null,
    log: [],
  },
};

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

const findSourcesFolder = (seriesFolder: string): string | null => {
  const fs = require("node:fs") as typeof import("node:fs");
  const entries = fs.readdirSync(seriesFolder, { withFileTypes: true });
  const match = entries.find(
    (e) => e.isDirectory() && /исходник/i.test(e.name),
  );
  return match ? path.join(seriesFolder, match.name) : null;
};

const findEpisodeChunks = (
  seriesFolder: string,
  episode: number,
): string[] => {
  const sources = findSourcesFolder(seriesFolder);
  if (!sources) return [];
  const fs = require("node:fs") as typeof import("node:fs");
  const re = new RegExp(`^E${episode}\\s+CH(\\d+)\\s+V(\\d+)\\.mp4$`, "i");
  const found = fs
    .readdirSync(sources)
    .map((name: string) => {
      const m = name.match(re);
      if (!m) return null;
      return { name, chunk: Number(m[1]), version: Number(m[2]) };
    })
    .filter((x: unknown): x is { name: string; chunk: number; version: number } => x !== null);
  // pick latest version per chunk, sort by chunk
  const byChunk = new Map<number, { name: string; version: number }>();
  for (const f of found) {
    const prev = byChunk.get(f.chunk);
    if (!prev || f.version > prev.version) byChunk.set(f.chunk, f);
  }
  return [...byChunk.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => path.join(sources, v.name));
};

const extractWavViaFfmpeg = (
  chunkPaths: string[],
  outputWav: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (chunkPaths.length === 0) {
      reject(new Error("no chunks"));
      return;
    }
    // build a file list for ffmpeg concat demuxer
    const listPath = `${outputWav}.list.txt`;
    const listBody = chunkPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    writeFileSync(listPath, listBody, "utf-8");

    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-vn",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        outputWav,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString("utf-8");
    });
    child.on("error", (e) => {
      try {
        unlinkSync(listPath);
      } catch {}
      reject(e);
    });
    child.on("close", (code) => {
      try {
        unlinkSync(listPath);
      } catch {}
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`));
    });
  });

const formatSrtTime = (sec: number): string => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
};

const parseTimestampSec = (ts: string): number => {
  // "00:00:05.123"
  const m = ts.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
  if (!m) return 0;
  return (
    Number(m[1]) * 3600 +
    Number(m[2]) * 60 +
    Number(m[3]) +
    Number(m[4]) / 1000
  );
};

type AnyTranscriptItem = {
  timestamps: { from: string; to: string };
  text: string;
};

const buildSrt = (items: AnyTranscriptItem[]): string => {
  const lines: string[] = [];
  items.forEach((item, idx) => {
    const start = parseTimestampSec(item.timestamps.from);
    const end = parseTimestampSec(item.timestamps.to);
    const text = item.text.trim();
    if (!text) return;
    lines.push(String(idx + 1));
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    lines.push(text);
    lines.push("");
  });
  return lines.join("\n");
};

const pushLog = (target: { log: string[] }, line: string) => {
  target.log.push(line);
  if (target.log.length > 200) target.log.splice(0, target.log.length - 200);
};

const runInstall = async (model: WhisperModel) => {
  state.install.status = "installing-whisper";
  state.install.progress = 0;
  state.install.model = model;
  state.install.error = undefined;
  state.install.log = [];
  pushLog(state.install, `installing whisper.cpp ${WHISPER_VERSION} → ${WHISPER_PATH}`);
  try {
    // do NOT pre-create the directory — installWhisperCpp uses its existence
    // as a marker for "already installed" and skips compilation otherwise.
    await installWhisperCpp({
      to: WHISPER_PATH,
      version: WHISPER_VERSION,
      printOutput: true,
    });
    pushLog(state.install, "whisper.cpp ready, downloading model");
    state.install.status = "downloading-model";
    state.install.progress = 0.5;
    if (!existsSync(MODELS_DIR)) mkdirSync(MODELS_DIR, { recursive: true });
    await downloadWhisperModel({
      model,
      folder: MODELS_DIR,
      printOutput: false,
      onProgress: (downloaded, total) => {
        const p = total > 0 ? downloaded / total : 0;
        state.install.progress = 0.5 + Math.min(0.5, p * 0.5);
      },
    });
    state.install.status = "ready";
    state.install.progress = 1;
    pushLog(state.install, "model downloaded");
  } catch (e) {
    state.install.status = "error";
    state.install.error = (e as Error).message;
    pushLog(state.install, `error: ${(e as Error).message}`);
  }
};

const runTranscribe = async (
  series: string,
  episode: number,
  language: "ru" | "en" | "auto",
) => {
  state.transcribe.status = "extracting-audio";
  state.transcribe.progress = 0;
  state.transcribe.series = series;
  state.transcribe.episode = episode;
  state.transcribe.error = undefined;
  state.transcribe.transcriptPath = undefined;
  state.transcribe.srtPath = undefined;
  state.transcribe.log = [];
  try {
    const projects = readRegistry();
    const seriesFolder = projects[series];
    if (!seriesFolder || !existsSync(seriesFolder))
      throw new Error("series folder not found");
    const chunks = findEpisodeChunks(seriesFolder, episode);
    if (chunks.length === 0)
      throw new Error("no chunks for episode");
    pushLog(state.transcribe, `found ${chunks.length} chunks`);
    const wavPath = path.join(
      tmpdir(),
      `gg-whisper-${Date.now()}-E${episode}.wav`,
    );
    pushLog(state.transcribe, `extracting audio → ${wavPath}`);
    await extractWavViaFfmpeg(chunks, wavPath);
    state.transcribe.progress = 0.2;

    pushLog(state.transcribe, `transcribing with model ${state.install.model}`);
    state.transcribe.status = "transcribing";
    const result = await transcribe({
      inputPath: wavPath,
      whisperPath: WHISPER_PATH,
      whisperCppVersion: WHISPER_VERSION,
      model: state.install.model,
      modelFolder: MODELS_DIR,
      tokenLevelTimestamps: true,
      language: language === "auto" ? null : language,
      printOutput: false,
      onProgress: (p: number) => {
        state.transcribe.progress = 0.2 + Math.min(0.7, p * 0.7);
      },
    });

    state.transcribe.status = "saving";
    state.transcribe.progress = 0.95;
    const editorDir = path.join(seriesFolder, ".gg-editor");
    if (!existsSync(editorDir)) mkdirSync(editorDir, { recursive: true });

    const transcriptPath = path.join(editorDir, `E${episode}.transcript.json`);
    writeFileSync(transcriptPath, JSON.stringify(result, null, 2), "utf-8");

    const captions = toCaptions({
      whisperCppOutput: result as Parameters<typeof toCaptions>[0]["whisperCppOutput"],
    });
    const srtBody = buildSrt(
      result.transcription as AnyTranscriptItem[],
    );
    const srtPath = path.join(editorDir, `E${episode}.ru.srt`);
    writeFileSync(srtPath, srtBody, "utf-8");

    pushLog(state.transcribe, `saved transcript + srt (${captions.captions.length} captions)`);
    try {
      unlinkSync(wavPath);
    } catch {}
    state.transcribe.transcriptPath = transcriptPath;
    state.transcribe.srtPath = srtPath;
    state.transcribe.status = "done";
    state.transcribe.progress = 1;
  } catch (e) {
    state.transcribe.status = "error";
    state.transcribe.error = (e as Error).message;
    pushLog(state.transcribe, `error: ${(e as Error).message}`);
  }
};

export const handleWhisperInstall = async (
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
  if (
    state.install.status === "installing-whisper" ||
    state.install.status === "downloading-model"
  ) {
    return json(res, 409, { error: "install already in progress" });
  }
  try {
    const body = await readBody(req);
    const parsed = body ? (JSON.parse(body) as { model?: WhisperModel }) : {};
    const model: WhisperModel = parsed.model ?? "medium";
    runInstall(model); // fire-and-forget
    json(res, 200, { ok: true, model });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleWhisperTranscribe = async (
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
  if (state.install.status !== "ready") {
    return json(res, 412, {
      error:
        "whisper.cpp not installed yet — POST /api/whisper/install first",
      installStatus: state.install.status,
    });
  }
  if (
    state.transcribe.status === "extracting-audio" ||
    state.transcribe.status === "transcribing" ||
    state.transcribe.status === "saving"
  ) {
    return json(res, 409, { error: "transcription already in progress" });
  }
  try {
    const body = await readBody(req);
    const parsed = body
      ? (JSON.parse(body) as {
          series?: string;
          episode?: number;
          language?: "ru" | "en" | "auto";
        })
      : {};
    const { series, episode, language } = parsed;
    if (!series) return json(res, 400, { error: "series required" });
    if (typeof episode !== "number" || episode < 1)
      return json(res, 400, { error: "episode required" });
    runTranscribe(series, episode, language ?? "auto"); // fire-and-forget
    json(res, 200, { ok: true, series, episode });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleWhisperStatus = (
  _req: IncomingMessage,
  res: ServerResponse,
) => {
  json(res, 200, {
    install: {
      status: state.install.status,
      progress: state.install.progress,
      model: state.install.model,
      error: state.install.error,
      tail: state.install.log.slice(-5),
    },
    transcribe: {
      status: state.transcribe.status,
      progress: state.transcribe.progress,
      series: state.transcribe.series,
      episode: state.transcribe.episode,
      transcriptPath: state.transcribe.transcriptPath,
      srtPath: state.transcribe.srtPath,
      error: state.transcribe.error,
      tail: state.transcribe.log.slice(-5),
    },
  });
};
