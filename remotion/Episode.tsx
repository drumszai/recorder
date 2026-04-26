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
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";

export const transitionType = z.enum([
  "cut",
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "wipe-left",
  "wipe-right",
  "flip",
  "clock",
]);

export type TransitionType = z.infer<typeof transitionType>;

export const clipSchema = z.object({
  id: z.string(),
  source: z.string(), // mp4 filename inside the series sources folder
  inSec: z.number().min(0),
  outSec: z.number().min(0),
  transitionAfter: transitionType,
});

export type Clip = z.infer<typeof clipSchema>;

export const episodeSchema = z.object({
  series: z.string(),
  episode: z.number().int().min(1),
  clips: z.array(clipSchema),
  transitionFrames: z.number().int().min(0).max(120),
  fadeInFrames: z.number().int().min(0).max(180),
  fadeOutFrames: z.number().int().min(0).max(180),
});

export type EpisodeChunk = {
  filename: string;
  path: string;
  chunk: number;
  version: number;
  durationSec: number | null;
};

export type EpisodeMusic = {
  filename: string;
  path: string;
} | null;

// chunks/music/seriesFolder are derived at calculateMetadata time and threaded
// through props so the component can resolve absolute paths without a second fetch.
export type EpisodeProps = z.infer<typeof episodeSchema> & {
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  seriesFolder: string;
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

const findChunkPath = (chunks: EpisodeChunk[], source: string): string | null => {
  const found = chunks.find((c) => c.filename === source);
  return found ? found.path : null;
};

export const generateDefaultClips = (chunks: EpisodeChunk[]): Clip[] =>
  chunks.map((c, i) => ({
    id: `${c.filename}#0`,
    source: c.filename,
    inSec: 0,
    outSec: c.durationSec ?? 6,
    transitionAfter: i < chunks.length - 1 ? "fade" : "cut",
  }));

export const totalEpisodeFrames = (
  clips: Clip[],
  transitionFrames: number,
  fps: number,
): number => {
  if (clips.length === 0) return 60;
  const clipFrames = clips.reduce((sum, c) => {
    const visible = Math.max(1, Math.round((c.outSec - c.inSec) * fps));
    return sum + visible;
  }, 0);
  let overlap = 0;
  for (let i = 0; i < clips.length - 1; i++) {
    if (clips[i]!.transitionAfter !== "cut") overlap += transitionFrames;
  }
  return Math.max(60, clipFrames - overlap);
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

export const Episode: React.FC<EpisodeProps> = ({
  clips,
  chunks,
  music,
  transitionFrames,
  fadeInFrames,
  fadeOutFrames,
}) => {
  const { fps, width, height } = useVideoConfig();

  if (clips.length === 0 || chunks.length === 0) {
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
        Нет клипов. Проверь, что в папке «Исходники» есть файлы вида
        E&lt;N&gt; CH&lt;M&gt; V&lt;V&gt;.mp4.
      </AbsoluteFill>
    );
  }

  const total = totalEpisodeFrames(clips, transitionFrames, fps);

  return (
    <AbsoluteFill style={{ background: "black" }}>
      <TransitionSeries>
        {clips.flatMap((clip, i) => {
          const visible = Math.max(
            1,
            Math.round((clip.outSec - clip.inSec) * fps),
          );
          const startFromFrames = Math.max(0, Math.round(clip.inSec * fps));
          const path = findChunkPath(chunks, clip.source);
          const seq = (
            <TransitionSeries.Sequence
              key={`seq-${clip.id}`}
              durationInFrames={visible}
              name={clip.source}
            >
              {path ? (
                <OffthreadVideo src={fileUrl(path)} startFrom={startFromFrames} />
              ) : (
                <AbsoluteFill
                  style={{
                    background: "#400",
                    color: "#fff",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 24,
                    padding: 40,
                    textAlign: "center",
                  }}
                >
                  Не найден файл «{clip.source}»
                </AbsoluteFill>
              )}
            </TransitionSeries.Sequence>
          );

          const isLast = i === clips.length - 1;
          if (isLast) return [seq];

          const presentation = presentationFor(
            clip.transitionAfter,
            width,
            height,
          );
          if (presentation === null || transitionFrames <= 0) return [seq];

          return [
            seq,
            <TransitionSeries.Transition
              key={`trans-${clip.id}`}
              presentation={presentation}
              timing={linearTiming({ durationInFrames: transitionFrames })}
            />,
          ];
        })}
      </TransitionSeries>
      {music ? <Audio src={fileUrl(music.path)} volume={0.3} loop /> : null}
      <FadeOverlay
        fadeInFrames={fadeInFrames}
        fadeOutFrames={fadeOutFrames}
        total={total}
      />
    </AbsoluteFill>
  );
};
