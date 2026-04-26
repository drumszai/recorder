import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const GAME_GEARS_ROOT = "/Users/a1234/Documents/GAME GEARS";
const REGISTRY_PATH = path.join(GAME_GEARS_ROOT, ".pipeline_registry.json");

const cors = (res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  cors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const readRegistry = (): Record<string, string> => {
  const raw = readFileSync(REGISTRY_PATH, "utf-8");
  return (JSON.parse(raw) as { projects: Record<string, string> }).projects;
};

const candidatePaths = (
  seriesFolder: string,
  episode: number,
): string[] => {
  // search order — first match wins
  return [
    path.join(seriesFolder, ".gg-editor", `E${episode}.ru.srt`),
    path.join(seriesFolder, ".gg-editor", `E${episode}.srt`),
    // also check inside any "Рендеры"/"Исходники"/"Звук" folder
    ...readdirSync(seriesFolder, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /рендер|исходник|звук|субтитр/i.test(d.name))
      .map((d) => path.join(seriesFolder, d.name, `E${episode}.ru.srt`)),
  ];
};

type SubtitleCue = { start: number; end: number; text: string };

const parseTimestamp = (s: string): number => {
  // 00:00:01,500 or 00:00:01.500
  const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return (
    Number(m[1]) * 3600 +
    Number(m[2]) * 60 +
    Number(m[3]) +
    Number(m[4]) / 1000
  );
};

const parseSrt = (raw: string): SubtitleCue[] => {
  const blocks = raw.replace(/\r/g, "").split(/\n\n+/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    if (lines.length < 2) continue;
    const arrowLine = lines.find((l) => l.includes("-->"));
    if (!arrowLine) continue;
    const [a, b] = arrowLine.split("-->").map((s) => s.trim());
    if (!a || !b) continue;
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    const textLines = lines.slice(lines.indexOf(arrowLine) + 1);
    const text = textLines.join("\n").trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
};

export const handleCaptionsGet = (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const name = url.searchParams.get("series");
    const episode = Number(url.searchParams.get("episode"));
    if (!name || !episode)
      return json(res, 400, { error: "series + episode required" });

    const projects = readRegistry();
    const folder = projects[name];
    if (!folder || !existsSync(folder))
      return json(res, 404, { error: "series not found" });

    const candidates = candidatePaths(folder, episode);
    const found = candidates.find((p) => existsSync(p));
    if (!found) return json(res, 404, { error: "no srt found", checked: candidates });

    const raw = readFileSync(found, "utf-8");
    const cues = parseSrt(raw);
    json(res, 200, {
      sourcePath: found,
      cues,
      count: cues.length,
    });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
};

export const handleCaptionsGenerate = (
  _req: IncomingMessage,
  res: ServerResponse,
) => {
  // TODO: implement Whisper.cpp transcription + Claude API EN→RU translation.
  // Requires:
  //   - whisper.cpp compiled (npx remotion install-whisper-cpp)
  //   - ANTHROPIC_API_KEY in environment
  // Until then: pipeline pult or user provides .ru.srt manually inside
  // <seriesFolder>/.gg-editor/E<N>.ru.srt — handleCaptionsGet picks it up.
  json(res, 501, {
    error: "not implemented yet",
    hint:
      "Положи готовый .ru.srt в <папка-сериала>/.gg-editor/E<N>.ru.srt — редактор подхватит. Авто-генерация Whisper+Claude добавится в следующем обновлении (нужен ANTHROPIC_API_KEY и whisper.cpp).",
  });
};
