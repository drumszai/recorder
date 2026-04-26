import { Composition } from "remotion";
import { videoConf } from "../config/scenes";
import { Episode, type EpisodeChunk, type EpisodeMusic } from "./Episode";
import { GoToRecorder } from "./GoToRecorder";
import { Main } from "./Main";
import { calcMetadata } from "./calculate-metadata/calc-metadata";

const FPS = 30;
const DEFAULT_CHUNK_DURATION_FRAMES = 180; // ~6s @ 30fps — приближение

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

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        component={Episode}
        id="Episode"
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={60}
        defaultProps={{
          series: "Divorce in 5 Minutes",
          episode: 1,
          chunks: [] as EpisodeChunk[],
          music: null as EpisodeMusic,
          chunkDurationFrames: DEFAULT_CHUNK_DURATION_FRAMES,
        }}
        calculateMetadata={async ({ props }) => {
          const { chunks, music } = await fetchEpisodeAssets(
            props.series,
            props.episode,
          );
          const dur = props.chunkDurationFrames || DEFAULT_CHUNK_DURATION_FRAMES;
          const total = Math.max(60, chunks.length * dur);
          return {
            props: { ...props, chunks, music },
            durationInFrames: total,
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
