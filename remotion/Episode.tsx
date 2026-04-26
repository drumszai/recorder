import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
} from "remotion";

export type EpisodeChunk = {
  filename: string;
  path: string;
  chunk: number;
  version: number;
};

export type EpisodeMusic = {
  filename: string;
  path: string;
} | null;

export type EpisodeProps = {
  series: string;
  episode: number;
  chunks: EpisodeChunk[];
  music: EpisodeMusic;
  chunkDurationFrames: number;
};

const fileUrl = (absPath: string) =>
  `http://localhost:4000/api/file?path=${encodeURIComponent(absPath)}`;

export const Episode: React.FC<EpisodeProps> = ({
  chunks,
  music,
  chunkDurationFrames,
}) => {
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
      {chunks.map((chunk, i) => (
        <Sequence
          key={chunk.filename}
          from={i * chunkDurationFrames}
          durationInFrames={chunkDurationFrames}
          name={`CH${chunk.chunk} v${chunk.version}`}
        >
          <OffthreadVideo src={fileUrl(chunk.path)} />
        </Sequence>
      ))}
      {music ? (
        <Audio src={fileUrl(music.path)} volume={0.3} loop />
      ) : null}
    </AbsoluteFill>
  );
};

// staticFile is unused here but re-exported keeps tree-shaking happy when
// other parts of the project want to use it.
export { staticFile };
