import React from "react";
import type { Clip } from "../../remotion/Episode";
import type { Chunk } from "./types";

type Props = {
  clips: Clip[];
  chunks: Chunk[];
};

const wrap: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.02)",
  padding: 16,
  flexShrink: 0,
  minHeight: 140,
};

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  opacity: 0.5,
  marginBottom: 8,
};

const track: React.CSSProperties = {
  display: "flex",
  gap: 4,
  alignItems: "stretch",
  height: 64,
};

const clipBox = (active: boolean): React.CSSProperties => ({
  background: active
    ? "rgba(99,102,241,0.45)"
    : "rgba(99,102,241,0.18)",
  border: `1px solid rgba(99,102,241,${active ? 0.8 : 0.4})`,
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 11,
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  minWidth: 60,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

const transitionPill: React.CSSProperties = {
  alignSelf: "center",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 10,
  color: "#fff",
  whiteSpace: "nowrap",
};

const clipDetail: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
};

const fmt = (s: number) => `${s.toFixed(2)} с`;

export const Timeline: React.FC<Props> = ({ clips, chunks }) => {
  if (clips.length === 0) {
    return (
      <div style={wrap}>
        <div style={titleStyle}>Тайм-лайн</div>
        <div style={{ opacity: 0.5, fontSize: 13 }}>
          Клипов нет. Загрузи серию слева.
        </div>
      </div>
    );
  }

  // proportional widths
  const lengths = clips.map((c) => Math.max(0.1, c.outSec - c.inSec));
  const total = lengths.reduce((a, b) => a + b, 0);

  return (
    <div style={wrap}>
      <div style={titleStyle}>
        Тайм-лайн ({clips.length} клип{clips.length === 1 ? "" : "а/ов"},{" "}
        {fmt(total)} сумма)
      </div>
      <div style={track}>
        {clips.flatMap((clip, i) => {
          const original =
            chunks.find((c) => c.filename === clip.source)?.durationSec ?? null;
          const visible = Math.max(0, clip.outSec - clip.inSec);
          const wPct = (lengths[i]! / total) * 100;
          const box = (
            <div
              key={`c-${clip.id}`}
              style={{ ...clipBox(false), flex: `0 0 ${wPct}%` }}
              title={`${clip.source}\nоригинал: ${original ? fmt(original) : "?"}\nin: ${fmt(clip.inSec)} → out: ${fmt(clip.outSec)}\nна тайм-лайне: ${fmt(visible)}`}
            >
              <div
                style={{
                  fontWeight: 600,
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                }}
              >
                {clip.source}
              </div>
              <div style={clipDetail}>
                {fmt(visible)}
                {original && Math.abs(visible - original) > 0.05 ? (
                  <> / из {fmt(original)}</>
                ) : null}
              </div>
            </div>
          );
          if (i === clips.length - 1) return [box];
          return [
            box,
            <div key={`t-${clip.id}`} style={transitionPill}>
              {clip.transitionAfter}
            </div>,
          ];
        })}
      </div>
    </div>
  );
};
