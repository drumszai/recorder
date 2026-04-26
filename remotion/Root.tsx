import { Composition } from "remotion";
import { videoConf } from "../config/scenes";
import {
  Episode,
  episodeSchema,
  generateDefaultClips,
  totalEpisodeFrames,
  type Clip,
  type EpisodeChunk,
  type EpisodeMusic,
} from "./Episode";
import { GoToRecorder } from "./GoToRecorder";
import { Main } from "./Main";
import { Series, seriesSchema, type SeriesEpisodePack } from "./Series";
import { calcMetadata } from "./calculate-metadata/calc-metadata";

const FPS = 30;
const FALLBACK_CHUNK_FRAMES = 180; // ~6s @ 30fps — used when parseMedia fails
const DEFAULT_TRANSITION_FRAMES = 15; // ~0.5s @ 30fps
const DEFAULT_FADE_FRAMES = 0; // off by default

const fetchEpisodeAssets = async (
  series: string,
  episode: number,
): Promise<{
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  seriesFolder: string;
}> => {
  const url = `http://localhost:4000/api/assets?series=${encodeURIComponent(series)}&episode=${episode}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { chunks: [], music: null, seriesFolder: "" };
    const data = (await r.json()) as {
      chunks?: EpisodeChunk[];
      music?: EpisodeMusic;
      seriesFolder?: string;
    };
    return {
      chunks: data.chunks ?? [],
      music: data.music ?? null,
      seriesFolder: data.seriesFolder ?? "",
    };
  } catch {
    return { chunks: [], music: null, seriesFolder: "" };
  }
};

const fetchSeriesEpisodes = async (
  series: string,
): Promise<number[]> => {
  const url = `http://localhost:4000/api/episodes?series=${encodeURIComponent(series)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = (await r.json()) as { episodes?: number[] };
    return data.episodes ?? [];
  } catch {
    return [];
  }
};

type EpisodeEdit = {
  clips?: Clip[];
  transitionFrames?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
};

const fetchEpisodeEdit = async (
  series: string,
  episode: number,
): Promise<EpisodeEdit | null> => {
  const url = `http://localhost:4000/api/edit?series=${encodeURIComponent(series)}&episode=${episode}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as EpisodeEdit;
  } catch {
    return null;
  }
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
          clips: [] as Clip[],
          transitionFrames: DEFAULT_TRANSITION_FRAMES,
          fadeInFrames: DEFAULT_FADE_FRAMES,
          fadeOutFrames: DEFAULT_FADE_FRAMES,
          chunks: [] as EpisodeChunk[],
          music: null as EpisodeMusic,
          seriesFolder: "",
          fallbackChunkDurationFrames: FALLBACK_CHUNK_FRAMES,
        }}
        calculateMetadata={async ({ props }) => {
          const [{ chunks, music, seriesFolder }, edit] = await Promise.all([
            fetchEpisodeAssets(props.series, props.episode),
            fetchEpisodeEdit(props.series, props.episode),
          ]);
          // priority: explicit URL props > saved edit.json > defaults from chunks
          const clips =
            props.clips.length > 0
              ? props.clips
              : edit?.clips && edit.clips.length > 0
                ? edit.clips
                : generateDefaultClips(chunks);
          const transitionFrames =
            edit?.transitionFrames ?? props.transitionFrames;
          const fadeInFrames = edit?.fadeInFrames ?? props.fadeInFrames;
          const fadeOutFrames = edit?.fadeOutFrames ?? props.fadeOutFrames;
          return {
            props: {
              ...props,
              chunks,
              music,
              seriesFolder,
              clips,
              transitionFrames,
              fadeInFrames,
              fadeOutFrames,
            },
            durationInFrames: totalEpisodeFrames(
              clips,
              transitionFrames,
              FPS,
            ),
          };
        }}
      />
      <Composition
        component={Series}
        id="Series"
        schema={seriesSchema}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={60}
        defaultProps={{
          series: "Divorce in 5 Minutes",
          transitionBetweenEpisodes: "fade" as const,
          transitionFrames: DEFAULT_TRANSITION_FRAMES,
          fadeInFrames: DEFAULT_FADE_FRAMES,
          fadeOutFrames: DEFAULT_FADE_FRAMES,
          episodes: [] as SeriesEpisodePack[],
          fallbackChunkDurationFrames: FALLBACK_CHUNK_FRAMES,
        }}
        calculateMetadata={async ({ props }) => {
          const epNumbers = await fetchSeriesEpisodes(props.series);
          const packs: SeriesEpisodePack[] = await Promise.all(
            epNumbers.map(async (episode) => {
              const { chunks, music, seriesFolder } = await fetchEpisodeAssets(
                props.series,
                episode,
              );
              return {
                episode,
                clips: generateDefaultClips(chunks),
                chunks,
                music,
                seriesFolder,
              };
            }),
          );
          // total = sum(per-episode total) - (episodes-1) * transitionFrames if non-cut
          const perEp = packs.map((p) =>
            totalEpisodeFrames(p.clips, props.transitionFrames, FPS),
          );
          const sumEp = perEp.reduce((a, b) => a + b, 0);
          const overlap =
            props.transitionBetweenEpisodes !== "cut"
              ? Math.max(0, packs.length - 1) * props.transitionFrames
              : 0;
          return {
            props: { ...props, episodes: packs },
            durationInFrames: Math.max(60, sumEp - overlap),
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
