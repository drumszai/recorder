import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import {
  clipSchema,
  totalEpisodeFrames,
  transitionType,
  type Clip,
  type EpisodeChunk,
  type EpisodeMusic,
  type TransitionType,
} from "./Episode";

export const seriesEpisodePackSchema = z.object({
  episode: z.number().int().min(1),
  clips: z.array(clipSchema),
});

export type SeriesEpisodePack = z.infer<typeof seriesEpisodePackSchema> & {
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  seriesFolder: string;
};

export const seriesSchema = z.object({
  series: z.string(),
  transitionBetweenEpisodes: transitionType,
  transitionFrames: z.number().int().min(0).max(120),
  fadeInFrames: z.number().int().min(0).max(180),
  fadeOutFrames: z.number().int().min(0).max(180),
});

export type SeriesProps = z.infer<typeof seriesSchema> & {
  episodes: SeriesEpisodePack[];
  fallbackChunkDurationFrames: number;
};

const fileUrl = (absPath: string) =>
  `http://localhost:4000/api/file?path=${encodeURIComponent(absPath)}`;

type AnyPresentation = ReturnType<typeof fade>;

const presentationFor = (
  t: TransitionType,
  width: number,
  height: number,
): AnyPresentation | null => {
  switch (t) {
    case "fade":
      return fade();
    case "slide-left":
      return slide({ direction: "from-left" }) as unknown as AnyPresentation;
    case "slide-right":
      return slide({ direction: "from-right" }) as unknown as AnyPresentation;
    case "slide-up":
      return slide({ direction: "from-top" }) as unknown as AnyPresentation;
    case "slide-down":
      return slide({ direction: "from-bottom" }) as unknown as AnyPresentation;
    case "wipe-left":
      return wipe({ direction: "from-left" }) as unknown as AnyPresentation;
    case "wipe-right":
      return wipe({ direction: "from-right" }) as unknown as AnyPresentation;
    case "flip":
      return flip() as unknown as AnyPresentation;
    case "clock":
      return clockWipe({ width, height }) as unknown as AnyPresentation;
    default:
      return null;
  }
};

const findChunkPath = (
  chunks: EpisodeChunk[],
  source: string,
): string | null => {
  const found = chunks.find((c) => c.filename === source);
  return found ? found.path : null;
};

const EpisodeBlock: React.FC<{
  pack: SeriesEpisodePack;
  transitionFrames: number;
}> = ({ pack, transitionFrames }) => {
  const { fps, width, height } = useVideoConfig();

  return (
    <>
      <TransitionSeries>
        {pack.clips.flatMap((clip: Clip, i: number) => {
          const visible = Math.max(
            1,
            Math.round((clip.outSec - clip.inSec) * fps),
          );
          const startFromFrames = Math.max(0, Math.round(clip.inSec * fps));
          const path = findChunkPath(pack.chunks, clip.source);
          const seq = (
            <TransitionSeries.Sequence
              key={`s${pack.episode}-${clip.id}`}
              durationInFrames={visible}
              name={clip.source}
            >
              {path ? (
                <OffthreadVideo
                  src={fileUrl(path)}
                  startFrom={startFromFrames}
                />
              ) : null}
            </TransitionSeries.Sequence>
          );
          if (i === pack.clips.length - 1) return [seq];
          const presentation = presentationFor(
            clip.transitionAfter,
            width,
            height,
          );
          if (presentation === null || transitionFrames <= 0) return [seq];
          return [
            seq,
            <TransitionSeries.Transition
              key={`t${pack.episode}-${clip.id}`}
              presentation={presentation}
              timing={linearTiming({ durationInFrames: transitionFrames })}
            />,
          ];
        })}
      </TransitionSeries>
      {pack.music ? (
        <Audio src={fileUrl(pack.music.path)} volume={0.3} loop />
      ) : null}
    </>
  );
};

const FadeOverlay: React.FC<{
  fadeInFrames: number;
  fadeOutFrames: number;
  total: number;
}> = ({ fadeInFrames, fadeOutFrames, total }) => {
  const frame = useCurrentFrame();
  const inOpacity =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;
  const outOpacity =
    fadeOutFrames > 0
      ? interpolate(frame, [total - fadeOutFrames, total], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;
  const opacity = Math.max(inOpacity, outOpacity);
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

export const Series: React.FC<SeriesProps> = ({
  episodes,
  transitionBetweenEpisodes,
  transitionFrames,
  fadeInFrames,
  fadeOutFrames,
}) => {
  const { fps } = useVideoConfig();

  if (episodes.length === 0) {
    return (
      <AbsoluteFill
        style={{
          background: "#111",
          color: "#fff",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: "system-ui, sans-serif",
          fontSize: 40,
          textAlign: "center",
          padding: 40,
        }}
      >
        Эпизодов не найдено для этого сериала.
      </AbsoluteFill>
    );
  }

  // pre-compute per-episode total durations & where each one starts in the timeline
  const perEpisodeFrames = episodes.map((p) =>
    totalEpisodeFrames(p.clips, transitionFrames, fps),
  );
  const overlapPerSeam =
    transitionBetweenEpisodes !== "cut" ? transitionFrames : 0;

  const starts: number[] = [];
  let cursor = 0;
  for (let i = 0; i < episodes.length; i++) {
    starts.push(cursor);
    cursor += perEpisodeFrames[i]!;
    if (i < episodes.length - 1) cursor -= overlapPerSeam;
  }
  const total = Math.max(60, cursor);

  return (
    <AbsoluteFill style={{ background: "black" }}>
      {episodes.map((pack, i) => (
        <Sequence
          key={`ep-${pack.episode}`}
          from={starts[i]!}
          durationInFrames={perEpisodeFrames[i]!}
          name={`E${pack.episode}`}
        >
          <EpisodeBlock pack={pack} transitionFrames={transitionFrames} />
        </Sequence>
      ))}
      <FadeOverlay
        fadeInFrames={fadeInFrames}
        fadeOutFrames={fadeOutFrames}
        total={total}
      />
    </AbsoluteFill>
  );
};
