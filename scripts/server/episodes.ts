import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const durationCache = new Map<string, number>();

const getDurationSec = async (absPath: string): Promise<number | null> => {
  const cached = durationCache.get(absPath);
  if (cached !== undefined) return cached;
  try {
    const result = await parseMedia({
      src: absPath,
      reader: nodeReader,
      fields: { durationInSeconds: true },
      acknowledgeRemotionLicense: true,
    });
    const dur = result.durationInSeconds;
    if (dur === null || dur === undefined) return null;
    durationCache.set(absPath, dur);
    return dur;
  } catch {
    return null;
  }
};

const GAME_GEARS_ROOT = "/Users/a1234/Documents/GAME GEARS";
const REGISTRY_PATH = path.join(GAME_GEARS_ROOT, ".pipeline_registry.json");

type Registry = {
  updated_at: string;
  projects: Record<string, string>;
};

const cors = (res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  cors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const readRegistry = (): Registry => {
  const raw = readFileSync(REGISTRY_PATH, "utf-8");
  return JSON.parse(raw) as Registry;
};

const findSourcesFolder = (seriesPath: string): string | null => {
  const entries = readdirSync(seriesPath, { withFileTypes: true });
  const match = entries.find(
    (e) => e.isDirectory() && /исходник/i.test(e.name),
  );
  return match ? path.join(seriesPath, match.name) : null;
};

const findSoundsFolder = (seriesPath: string): string | null => {
  const entries = readdirSync(seriesPath, { withFileTypes: true });
  const match = entries.find((e) => e.isDirectory() && /звук/i.test(e.name));
  return match ? path.join(seriesPath, match.name) : null;
};

const CHUNK_RE = /^E(\d+)\s+CH(\d+)\s+V(\d+)\.mp4$/i;
const MUSIC_RE = /^music\s+E(\d+)\s+V(\d+)\.mp3$/i;

type Chunk = { episode: number; chunk: number; version: number; file: string };

const listChunks = (sourcesDir: string): Chunk[] => {
  return readdirSync(sourcesDir)
    .map((name): Chunk | null => {
      const m = name.match(CHUNK_RE);
      if (!m) return null;
      return {
        episode: Number(m[1]),
        chunk: Number(m[2]),
        version: Number(m[3]),
        file: name,
      };
    })
    .filter((x): x is Chunk => x !== null);
};

const pickLatestVersion = (chunks: Chunk[]): Chunk[] => {
  const byKey = new Map<string, Chunk>();
  for (const c of chunks) {
    const key = `${c.episode}-${c.chunk}`;
    const prev = byKey.get(key);
    if (!prev || c.version > prev.version) byKey.set(key, c);
  }
  return [...byKey.values()].sort((a, b) =>
    a.episode === b.episode ? a.chunk - b.chunk : a.episode - b.episode,
  );
};

export const handleSeriesList = (
  _req: IncomingMessage,
  res: ServerResponse,
) => {
  try {
    const reg = readRegistry();
    const list = Object.entries(reg.projects)
      .filter(([, p]) => existsSync(p))
      .map(([name, folder]) => ({ name, folder }))
      .sort((a, b) => a.name.localeCompare(b.name));
    json(res, 200, { series: list });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleSeriesEpisodes = (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const name = url.searchParams.get("series");
    if (!name) return json(res, 400, { error: "series param required" });

    const reg = readRegistry();
    const folder = reg.projects[name];
    if (!folder) return json(res, 404, { error: "series not found" });

    const sources = findSourcesFolder(folder);
    if (!sources) return json(res, 200, { episodes: [], reason: "no Исходники folder" });

    const all = listChunks(sources);
    const episodes = [...new Set(all.map((c) => c.episode))].sort(
      (a, b) => a - b,
    );
    json(res, 200, { episodes, sourcesFolder: sources });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleEpisodeAssets = async (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const name = url.searchParams.get("series");
    const episode = Number(url.searchParams.get("episode"));
    if (!name || !episode)
      return json(res, 400, { error: "series + episode required" });

    const reg = readRegistry();
    const folder = reg.projects[name];
    if (!folder) return json(res, 404, { error: "series not found" });

    const sources = findSourcesFolder(folder);
    if (!sources) return json(res, 404, { error: "no sources folder" });

    const chunksAll = listChunks(sources).filter((c) => c.episode === episode);
    const picked = pickLatestVersion(chunksAll);
    const chunks = await Promise.all(
      picked.map(async (c) => {
        const abs = path.join(sources, c.file);
        const durationSec = await getDurationSec(abs);
        return {
          filename: c.file,
          path: abs,
          chunk: c.chunk,
          version: c.version,
          durationSec,
        };
      }),
    );

    const sounds = findSoundsFolder(folder);
    let music: { filename: string; path: string } | null = null;
    if (sounds && existsSync(sounds)) {
      const found = readdirSync(sounds)
        .map((name) => {
          const m = name.match(MUSIC_RE);
          if (!m) return null;
          if (Number(m[1]) !== episode) return null;
          return { name, version: Number(m[2]) };
        })
        .filter((x): x is { name: string; version: number } => x !== null)
        .sort((a, b) => b.version - a.version);
      const top = found[0];
      if (top) {
        music = { filename: top.name, path: path.join(sounds, top.name) };
      }
    }

    json(res, 200, { chunks, music, seriesFolder: folder });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleAssetFile = async (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const filePath = url.searchParams.get("path");
    if (!filePath) return json(res, 400, { error: "path required" });

    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(GAME_GEARS_ROOT)) {
      return json(res, 403, { error: "outside GAME GEARS root" });
    }
    if (!existsSync(resolved)) return json(res, 404, { error: "not found" });

    const stat = statSync(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const mime =
      ext === ".mp4"
        ? "video/mp4"
        : ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".srt"
            ? "text/plain; charset=utf-8"
            : "application/octet-stream";

    cors(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Accept-Ranges", "bytes");

    createReadStream(resolved).pipe(res);
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};
