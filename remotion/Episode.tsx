import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
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

export const episodeSchema = z.object({
  series: z.string(),
  episode: z.number().int().min(1),
  transitions: z.array(transitionType),
  transitionFrames: z.number().int().min(0).max(120),
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

export type EpisodeProps = z.infer<typeof episodeSchema> & {
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  fallbackChunkDurationFrames: number;
};

const fileUrl = (absPath: string) =>
  `http://localhost:4000/api/file?path=${encodeURIComponent(absPath)}`;

// presentation type intentionally erased — Remotion's TransitionPresentation
// is generic over the inner component's props (FadeProps / WipeProps / ...).
// Mixing presets in a single map means we lose the union and have to widen.
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

export const Episode: React.FC<EpisodeProps> = ({
  chunks,
  music,
  transitions,
  transitionFrames,
  fallbackChunkDurationFrames,
}) => {
  const { fps, width, height } = useVideoConfig();

  if (chunks.length === 0) {
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
        Нет чанков. Проверь, что в папке «Исходники» есть файлы вида
        E&lt;N&gt; CH&lt;M&gt; V&lt;V&gt;.mp4.
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: "black" }}>
      <TransitionSeries>
        {chunks.flatMap((chunk, i) => {
          const dur =
            chunk.durationSec !== null
              ? Math.round(chunk.durationSec * fps)
              : fallbackChunkDurationFrames;
          const seq = (
            <TransitionSeries.Sequence
              key={`seq-${chunk.filename}`}
              durationInFrames={dur}
              name={`CH${chunk.chunk} v${chunk.version}`}
            >
              <OffthreadVideo src={fileUrl(chunk.path)} />
            </TransitionSeries.Sequence>
          );

          const isLast = i === chunks.length - 1;
          if (isLast) return [seq];

          const t = transitions[i] ?? "cut";
          const presentation = presentationFor(t, width, height);
          if (presentation === null || transitionFrames <= 0) {
            return [seq];
          }

          return [
            seq,
            <TransitionSeries.Transition
              key={`trans-${i}`}
              presentation={presentation}
              timing={linearTiming({ durationInFrames: transitionFrames })}
            />,
          ];
        })}
      </TransitionSeries>
      {music ? <Audio src={fileUrl(music.path)} volume={0.3} loop /> : null}
    </AbsoluteFill>
  );
};
