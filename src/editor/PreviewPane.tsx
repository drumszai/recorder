import { Player } from "@remotion/player";
import React from "react";
import {
  Episode,
  totalEpisodeFrames,
  type Clip,
  type EpisodeChunk,
  type EpisodeMusic,
  type SubtitleCue,
  type TransitionType,
} from "../../remotion/Episode";
import { Series, type SeriesEpisodePack } from "../../remotion/Series";

const FPS = 30;
const COMP_W = 1080;
const COMP_H = 1920;
const FALLBACK_FRAMES = 180;

const wrap: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#000",
  padding: 16,
  minHeight: 0,
};

const playerWrap: React.CSSProperties = {
  width: "min(100%, 360px)",
  aspectRatio: `${COMP_W} / ${COMP_H}`,
  maxHeight: "100%",
};

type EpisodeProps = {
  mode: "episode";
  series: string;
  episode: number;
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  seriesFolder: string;
  clips: Clip[];
  transitionFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  subtitles?: SubtitleCue[];
};

type SeriesProps = {
  mode: "series";
  series: string;
  episodes: SeriesEpisodePack[];
  transitionBetweenEpisodes: TransitionType;
  transitionFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
};

type Props = EpisodeProps | SeriesProps;

export const PreviewPane: React.FC<Props> = (props) => {
  if (props.mode === "episode") {
    const dur = Math.max(
      60,
      totalEpisodeFrames(props.clips, props.transitionFrames, FPS),
    );
    return (
      <div style={wrap}>
        <div style={playerWrap}>
          <Player
            component={Episode}
            inputProps={{
              series: props.series,
              episode: props.episode,
              chunks: props.chunks,
              music: props.music,
              seriesFolder: props.seriesFolder,
              clips: props.clips,
              transitionFrames: props.transitionFrames,
              fadeInFrames: props.fadeInFrames,
              fadeOutFrames: props.fadeOutFrames,
              fallbackChunkDurationFrames: FALLBACK_FRAMES,
              subtitles: props.subtitles,
            }}
            durationInFrames={dur}
            compositionWidth={COMP_W}
            compositionHeight={COMP_H}
            fps={FPS}
            controls
            style={{ width: "100%", height: "100%" }}
            acknowledgeRemotionLicense
          />
        </div>
      </div>
    );
  }

  // mode === "series"
  const perEp = props.episodes.map((p) =>
    totalEpisodeFrames(p.clips, props.transitionFrames, FPS),
  );
  const sumEp = perEp.reduce((a, b) => a + b, 0);
  const overlap =
    props.transitionBetweenEpisodes !== "cut"
      ? Math.max(0, props.episodes.length - 1) * props.transitionFrames
      : 0;
  const dur = Math.max(60, sumEp - overlap);

  return (
    <div style={wrap}>
      <div style={playerWrap}>
        <Player
          component={Series}
          inputProps={{
            series: props.series,
            episodes: props.episodes,
            transitionBetweenEpisodes: props.transitionBetweenEpisodes,
            transitionFrames: props.transitionFrames,
            fadeInFrames: props.fadeInFrames,
            fadeOutFrames: props.fadeOutFrames,
            fallbackChunkDurationFrames: FALLBACK_FRAMES,
          }}
          durationInFrames={dur}
          compositionWidth={COMP_W}
          compositionHeight={COMP_H}
          fps={FPS}
          controls
          style={{ width: "100%", height: "100%" }}
          acknowledgeRemotionLicense
        />
      </div>
    </div>
  );
};
