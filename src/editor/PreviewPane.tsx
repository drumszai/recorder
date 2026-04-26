import { Player } from "@remotion/player";
import React from "react";
import {
  Episode,
  totalEpisodeFrames,
  type Clip,
  type EpisodeChunk,
  type EpisodeMusic,
} from "../../remotion/Episode";

type Props = {
  series: string;
  episode: number;
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  seriesFolder: string;
  clips: Clip[];
  transitionFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
};

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

export const PreviewPane: React.FC<Props> = ({
  series,
  episode,
  chunks,
  music,
  seriesFolder,
  clips,
  transitionFrames,
  fadeInFrames,
  fadeOutFrames,
}) => {
  const dur = Math.max(60, totalEpisodeFrames(clips, transitionFrames, FPS));
  return (
    <div style={wrap}>
      <div style={playerWrap}>
        <Player
          component={Episode}
          inputProps={{
            series,
            episode,
            chunks,
            music,
            seriesFolder,
            clips,
            transitionFrames,
            fadeInFrames,
            fadeOutFrames,
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
