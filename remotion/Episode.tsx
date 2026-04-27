import { CameraMotionBlur } from "@remotion/motion-blur";
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

export const transitionType = z
  .enum([
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
  ])
  .describe(
    "Тип перехода между этим клипом и следующим. cut — без перехода, fade — плавное затемнение, slide — следующий клип въезжает с указанной стороны, wipe — стирание полосой, flip — переворот, clock — круговое раскрытие.",
  );

export type TransitionType = z.infer<typeof transitionType>;

export const clipEffect = z
  .enum(["none", "motion-blur"])
  .describe(
    "Эффект, накладываемый на клип целиком. motion-blur — размытие движения через @remotion/motion-blur (тяжелее по рендеру, ставь только если нужен).",
  );

export type ClipEffect = z.infer<typeof clipEffect>;

export const clipSchema = z
  .object({
    id: z.string().describe("Уникальный ID клипа. Не редактируй вручную."),
    source: z
      .string()
      .describe(
        "Имя mp4-файла из папки «Исходники». Должно совпадать в точности (E1 CH1 V1.mp4).",
      ),
    inSec: z
      .number()
      .min(0)
      .describe(
        "С какой секунды исходного mp4 начинается этот клип. 0 = с самого начала. Чтобы обрезать начало — увеличь это число.",
      ),
    outSec: z
      .number()
      .min(0)
      .describe(
        "На какой секунде исходного mp4 клип заканчивается. Чтобы обрезать конец — уменьши это число. Для split одного чанка на два клипа используй один и тот же source с разными inSec/outSec.",
      ),
    transitionAfter: transitionType,
    effect: clipEffect.optional(),
  })
  .describe(
    "Один клип на тайм-лайне. Чтобы разрезать чанк на куски — добавь несколько клипов с одним и тем же source.",
  );

export type Clip = z.infer<typeof clipSchema>;

export const episodeSchema = z.object({
  series: z
    .string()
    .describe(
      "Название сериала из .pipeline_registry.json. Меняй здесь, чтобы переключить серию.",
    ),
  episode: z
    .number()
    .int()
    .min(1)
    .describe("Номер серии (1, 2, 3...). Файлы вида E{N} CH{M} V{V}.mp4."),
  clips: z
    .array(clipSchema)
    .describe(
      "Тайм-лайн серии: список клипов по порядку. Если оставить пустым — соберётся автоматически из всех чанков серии (один клип на чанк, fade между ними).",
    ),
  transitionFrames: z
    .number()
    .int()
    .min(0)
    .max(120)
    .describe(
      "Длительность каждого перехода в кадрах (30 fps → 30 кадров = 1 сек). Применяется ко всем переходам между клипами.",
    ),
  fadeInFrames: z
    .number()
    .int()
    .min(0)
    .max(180)
    .describe(
      "Сколько кадров плавного появления из чёрного в начале серии. 0 = выключено.",
    ),
  fadeOutFrames: z
    .number()
    .int()
    .min(0)
    .max(180)
    .describe(
      "Сколько кадров плавного ухода в чёрное в конце серии. 0 = выключено.",
    ),
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

export type SubtitleCue = { start: number; end: number; text: string };

// chunks/music/seriesFolder are derived at calculateMetadata time and threaded
// through props so the component can resolve absolute paths without a second fetch.
export type EpisodeProps = z.infer<typeof episodeSchema> & {
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  seriesFolder: string;
  fallbackChunkDurationFrames: number;
  subtitles?: SubtitleCue[]; // shown only when supplied (not in render)
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

const SubtitleOverlay: React.FC<{ cues: SubtitleCue[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const active = cues.find((c) => t >= c.start && t <= c.end);
  if (!active) return null;
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 100,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          padding: "10px 18px",
          borderRadius: 8,
          fontSize: 36,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 500,
          maxWidth: "85%",
          textAlign: "center",
          lineHeight: 1.3,
          textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
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

export const Episode: React.FC<EpisodeProps> = ({
  clips,
  chunks,
  music,
  transitionFrames,
  fadeInFrames,
  fadeOutFrames,
  subtitles,
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
          const videoEl = path ? (
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
          );
          const wrapped =
            clip.effect === "motion-blur" ? (
              <CameraMotionBlur shutterAngle={180} samples={4}>
                {videoEl}
              </CameraMotionBlur>
            ) : (
              videoEl
            );
          const seq = (
            <TransitionSeries.Sequence
              key={`seq-${clip.id}`}
              durationInFrames={visible}
              name={clip.source}
            >
              {wrapped}
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
      {subtitles && subtitles.length > 0 ? (
        <SubtitleOverlay cues={subtitles} />
      ) : null}
      <FadeOverlay
        fadeInFrames={fadeInFrames}
        fadeOutFrames={fadeOutFrames}
        total={total}
      />
    </AbsoluteFill>
  );
};
