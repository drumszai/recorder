import { Composition } from "remotion";
import { videoConf } from "../config/scenes";
import {
  Episode,
  episodeSchema,
  type EpisodeChunk,
  type EpisodeMusic,
  type TransitionType,
} from "./Episode";
import { GoToRecorder } from "./GoToRecorder";
import { Main } from "./Main";
import { calcMetadata } from "./calculate-metadata/calc-metadata";

const FPS = 30;
const FALLBACK_CHUNK_FRAMES = 180; // ~6s @ 30fps — used when parseMedia fails
const DEFAULT_TRANSITION_FRAMES = 15; // ~0.5s @ 30fps

const fetchEpisodeAssets = async (
  series: string,
  episode: number,
): Promise<{ chunks: EpisodeChunk[]; music: EpisodeMusic }> => {
  const url = `http://localhost:4000/api/assets?series=${encodeURIComponent(series)}&episode=${episode}`;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      return { chunks: [], music: null };
    }
    const data = (await r.json()) as {
      chunks?: EpisodeChunk[];
      music?: EpisodeMusic;
    };
    return { chunks: data.chunks ?? [], music: data.music ?? null };
  } catch {
    return { chunks: [], music: null };
  }
};

const totalDurationFrames = (
  chunks: EpisodeChunk[],
  transitions: TransitionType[],
  transitionFrames: number,
  fps: number,
): number => {
  if (chunks.length === 0) return 60;
  const sumChunks = chunks.reduce((sum, c) => {
    const f =
      c.durationSec !== null
        ? Math.round(c.durationSec * fps)
        : FALLBACK_CHUNK_FRAMES;
    return sum + f;
  }, 0);
  // each non-cut transition between two chunks overlaps both, shortening the total by transitionFrames
  let overlap = 0;
  for (let i = 0; i < chunks.length - 1; i++) {
    const t = transitions[i] ?? "cut";
    if (t !== "cut") overlap += transitionFrames;
  }
  return Math.max(60, sumChunks - overlap);
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        component={Episode}
        id="Episode"
        schema={episodeSchema}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={60}
        defaultProps={{
          series: "Divorce in 5 Minutes",
          episode: 1,
          transitions: ["fade", "fade", "fade", "fade"] as TransitionType[],
          transitionFrames: DEFAULT_TRANSITION_FRAMES,
          chunks: [] as EpisodeChunk[],
          music: null as EpisodeMusic,
          fallbackChunkDurationFrames: FALLBACK_CHUNK_FRAMES,
        }}
        calculateMetadata={async ({ props }) => {
          const { chunks, music } = await fetchEpisodeAssets(
            props.series,
            props.episode,
          );
          // pad transitions array to chunks.length - 1 with 'fade' default
          const need = Math.max(0, chunks.length - 1);
          const padded: TransitionType[] = [];
          for (let i = 0; i < need; i++) {
            padded.push(props.transitions[i] ?? "fade");
          }
          return {
            props: { ...props, chunks, music, transitions: padded },
            durationInFrames: totalDurationFrames(
              chunks,
              padded,
              props.transitionFrames,
              FPS,
            ),
          };
        }}
      />
      <Composition
        component={Main}
        id="welcome"
        schema={videoConf}
        defaultProps={{
          theme: "light" as const,
          canvasLayout: "square" as const,
          scenes: [
            {
              type: "recorder" as const,
              durationInFrames: 80,
              music: "epic" as const,
              transitionToNextScene: true,
            },
            {
              type: "videoscene" as const,
              webcamPosition: "previous" as const,
              endOffset: 0,
              transitionToNextScene: true,
              newChapter: "",
              stopChapteringAfterThis: false,
              music: "previous" as const,
              startOffset: 0,
              bRolls: [],
            },
            {
              type: "videoscene" as const,
              webcamPosition: "previous" as const,
              endOffset: 0,
              transitionToNextScene: true,
              newChapter: "",
              stopChapteringAfterThis: false,
              music: "previous" as const,
              startOffset: 0,
              bRolls: [],
            },
            {
              type: "videoscene" as const,
              webcamPosition: "previous" as const,
              endOffset: 0,
              transitionToNextScene: true,
              newChapter: "",
              stopChapteringAfterThis: false,
              music: "previous" as const,
              startOffset: 0,
              bRolls: [],
            },
            {
              type: "videoscene" as const,
              webcamPosition: "previous" as const,
              endOffset: 0,
              transitionToNextScene: true,
              newChapter: "",
              stopChapteringAfterThis: false,
              music: "previous" as const,
              startOffset: 0,
              bRolls: [],
            },
            {
              music: "previous" as const,
              transitionToNextScene: true,
              type: "endcard" as const,
              durationInFrames: 200,
              channel: "remotion" as const,
              links: [
                { link: "remotion.dev/recorder" },
                { link: "remotion.dev/discord" },
              ],
            },
          ],
          scenesAndMetadata: [],
          platform: "x" as const,
        }}
        calculateMetadata={calcMetadata}
      />
      <Composition
        component={GoToRecorder}
        id="record"
        width={1080}
        height={1080}
        fps={30}
        durationInFrames={100}
      />
      <Composition
        component={Main}
        id="empty"
        schema={videoConf}
        defaultProps={{
          theme: "light" as const,
          canvasLayout: "square" as const,
          platform: "youtube",
          scenes: [],
          scenesAndMetadata: [],
        }}
        calculateMetadata={calcMetadata}
      />
    </>
  );
};
