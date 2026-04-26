import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAME_GEARS_ROOT = "/Users/a1234/Documents/GAME GEARS";
const REGISTRY_PATH = path.join(GAME_GEARS_ROOT, ".pipeline_registry.json");

type RenderStatus =
  | "queued"
  | "bundling"
  | "rendering"
  | "done"
  | "error";

type RenderTask = {
  id: string;
  composition: "Episode" | "Series";
  series: string;
  episode: number | null;
  status: RenderStatus;
  progress: number;
  startedAt: number;
  finishedAt?: number;
  outputPath: string;
  outputName: string;
  error?: string;
  log: string[];
};

const tasks = new Map<string, RenderTask>();

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
  const parsed = JSON.parse(raw) as { projects: Record<string, string> };
  return parsed.projects;
};

const findRendersFolder = (seriesFolder: string): string => {
  const entries = readdirSync(seriesFolder, { withFileTypes: true });
  const match = entries.find((e) => e.isDirectory() && /рендер/i.test(e.name));
  if (match) return path.join(seriesFolder, match.name);
  // create plain "Рендеры" if none exists
  const fallback = path.join(seriesFolder, "Рендеры");
  if (!existsSync(fallback)) mkdirSync(fallback, { recursive: true });
  return fallback;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

const buildOutputPath = (
  seriesFolder: string,
  series: string,
  episode: number | null,
): { dir: string; file: string; full: string } => {
  const dir = findRendersFolder(seriesFolder);
  const ts = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .slice(0, 16);
  const epPart = episode !== null ? `E${episode}` : "all";
  const file = `${slug(series)}_${epPart}_${ts}.mp4`;
  return { dir, file, full: path.join(dir, file) };
};

export const handleRenderStart = async (
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
    const parsed = body ? JSON.parse(body) : {};
    const { series, episode, mode } = parsed as {
      series?: string;
      episode?: number;
      mode?: "episode" | "series";
    };
    if (!series) return json(res, 400, { error: "series required" });
    const isSeries = mode === "series";
    if (!isSeries && (typeof episode !== "number" || episode < 1)) {
      return json(res, 400, { error: "episode required for episode mode" });
    }

    const projects = readRegistry();
    const seriesFolder = projects[series];
    if (!seriesFolder || !existsSync(seriesFolder)) {
      return json(res, 404, { error: "series folder not found" });
    }

    const out = buildOutputPath(
      seriesFolder,
      series,
      isSeries ? null : (episode as number),
    );

    const id = randomUUID();
    const composition: "Episode" | "Series" = isSeries ? "Series" : "Episode";
    const inputProps = isSeries
      ? { series }
      : { series, episode: episode as number };

    const propsFile = path.join(tmpdir(), `gg-render-${id}.json`);
    writeFileSync(propsFile, JSON.stringify(inputProps), "utf-8");

    const task: RenderTask = {
      id,
      composition,
      series,
      episode: isSeries ? null : (episode as number),
      status: "queued",
      progress: 0,
      startedAt: Date.now(),
      outputPath: out.full,
      outputName: out.file,
      log: [],
    };
    tasks.set(id, task);

    // resolve project root (where package.json + remotion/index.ts lives) from this file's location
    const projectRoot = path.resolve(__dirname, "..", "..");

    const child = spawn(
      "npx",
      [
        "remotion",
        "render",
        "remotion/index.ts",
        composition,
        out.full,
        `--props=${propsFile}`,
      ],
      {
        cwd: projectRoot,
        env: { ...process.env, FORCE_COLOR: "0" },
      },
    );

    const onLine = (line: string) => {
      task.log.push(line);
      if (task.log.length > 200) task.log.splice(0, task.log.length - 200);
      const bundling = line.match(/Bundling[^0-9]*(\d+(?:\.\d+)?)%/i);
      const renderedFrames = line.match(/Rendered\s+(\d+)\s*\/\s*(\d+)/i);
      const renderingPct = line.match(/Rendering[^0-9]*(\d+(?:\.\d+)?)%/i);
      if (renderedFrames?.[1] && renderedFrames?.[2]) {
        const done = Number(renderedFrames[1]);
        const total = Math.max(1, Number(renderedFrames[2]));
        task.status = "rendering";
        task.progress = 0.5 + Math.min(0.5, (done / total) * 0.5);
      } else if (renderingPct?.[1]) {
        task.status = "rendering";
        task.progress = 0.5 + Math.min(0.5, Number(renderingPct[1]) / 200);
      } else if (bundling?.[1]) {
        task.status = "bundling";
        task.progress = Math.min(0.5, Number(bundling[1]) / 200);
      }
    };

    let stdoutBuf = "";
    child.stdout.on("data", (d: Buffer) => {
      stdoutBuf += d.toString("utf-8");
      const lines = stdoutBuf.split(/[\r\n]/);
      stdoutBuf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onLine(l.trim());
    });
    let stderrBuf = "";
    child.stderr.on("data", (d: Buffer) => {
      stderrBuf += d.toString("utf-8");
      const lines = stderrBuf.split(/[\r\n]/);
      stderrBuf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onLine(l.trim());
    });

    child.on("error", (err) => {
      task.status = "error";
      task.error = err.message;
      task.finishedAt = Date.now();
    });

    child.on("close", (code) => {
      task.finishedAt = Date.now();
      if (code === 0 && existsSync(out.full)) {
        task.status = "done";
        task.progress = 1;
      } else {
        task.status = "error";
        task.error = task.error ?? `exit ${code}`;
      }
    });

    json(res, 200, { taskId: id, outputPath: out.full });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleRenderStatus = (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const id = url.searchParams.get("id");
    if (!id) return json(res, 400, { error: "id required" });
    const t = tasks.get(id);
    if (!t) return json(res, 404, { error: "task not found" });
    json(res, 200, {
      id: t.id,
      status: t.status,
      progress: t.progress,
      outputPath: t.outputPath,
      outputName: t.outputName,
      error: t.error,
      tail: t.log.slice(-8),
    });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};
