export type Series = { name: string; folder: string };

export type Chunk = {
  filename: string;
  path: string;
  chunk: number;
  version: number;
  durationSec: number | null;
};

export type Music = { filename: string; path: string } | null;

export type AssetsResponse = {
  chunks?: Chunk[];
  music?: Music;
  seriesFolder?: string;
  error?: string;
};

export type EditState = {
  clips: import("../../remotion/Episode").Clip[];
  transitionFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
};
