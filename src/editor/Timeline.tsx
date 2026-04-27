import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  transitionType,
  type Clip,
  type TransitionType,
} from "../../remotion/Episode";
import type { Chunk } from "./types";
import { Waveform } from "./Waveform";

const fileUrl = (absPath: string) =>
  `/api/file?path=${encodeURIComponent(absPath)}`;

type Props = {
  clips: Clip[];
  chunks: Chunk[];
  onClipsChange: (next: Clip[]) => void;
};

const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: "Без перехода",
  fade: "Затемнение",
  "slide-left": "Сдвиг ← слева",
  "slide-right": "Сдвиг → справа",
  "slide-up": "Сдвиг ↑ сверху",
  "slide-down": "Сдвиг ↓ снизу",
  "wipe-left": "Шторка ← слева",
  "wipe-right": "Шторка → справа",
  flip: "Переворот",
  clock: "Круговое раскрытие",
};

const TRANSITION_OPTIONS = transitionType.options as TransitionType[];

const wrap: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.02)",
  padding: 16,
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  opacity: 0.5,
  marginBottom: 4,
};

const helpStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.5,
  marginBottom: 10,
  lineHeight: 1.5,
};

const track: React.CSSProperties = {
  display: "flex",
  gap: 4,
  alignItems: "stretch",
  height: 84,
};

const HANDLE_W = 6;

const clipBox: React.CSSProperties = {
  background: "rgba(99,102,241,0.22)",
  border: "1px solid rgba(99,102,241,0.5)",
  borderRadius: 6,
  fontSize: 11,
  color: "#fff",
  position: "relative",
  overflow: "hidden",
  cursor: "crosshair",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  paddingLeft: HANDLE_W + 4,
  paddingRight: HANDLE_W + 4,
  paddingTop: 6,
  paddingBottom: 6,
  userSelect: "none",
  minWidth: 70,
};

const handleStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  bottom: 0,
  width: HANDLE_W,
  background: "rgba(99,102,241,0.7)",
  cursor: "ew-resize",
  zIndex: 2,
  [side]: 0,
});

const transitionPill = (active: boolean): React.CSSProperties => ({
  alignSelf: "center",
  background: active ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)",
  border: `1px solid rgba(99,102,241,${active ? 0.9 : 0.3})`,
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 10,
  color: "#fff",
  whiteSpace: "nowrap",
  cursor: "pointer",
  position: "relative",
});

const popover: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: "50%",
  transform: "translateX(-50%)",
  background: "#1e1e23",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  padding: 4,
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  zIndex: 10,
  minWidth: 180,
};

const popoverItem = (active: boolean): React.CSSProperties => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 10px",
  background: active ? "rgba(99,102,241,0.35)" : "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  borderRadius: 4,
  fontSize: 12,
});

const splitMarker: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 2,
  background: "#ef4444",
  pointerEvents: "none",
  zIndex: 1,
};

const fmt = (s: number) => `${s.toFixed(2)} с`;

type DragState =
  | null
  | {
      kind: "edge";
      clipId: string;
      side: "in" | "out";
      startX: number;
      startInSec: number;
      startOutSec: number;
      pxPerSec: number;
    };

type ReorderState = {
  draggingIdx: number;
  hoverIdx: number | null;
} | null;

export const Timeline: React.FC<Props> = ({ clips, chunks, onClipsChange }) => {
  const [drag, setDrag] = useState<DragState>(null);
  const [reorder, setReorder] = useState<ReorderState>(null);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [hoverSplit, setHoverSplit] = useState<{
    clipId: string;
    xPx: number;
    timeSec: number;
  } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const onDragStartClip = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
      setReorder({ draggingIdx: idx, hoverIdx: null });
    },
    [],
  );

  const onDragOverClip = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setReorder((prev) =>
        prev ? { ...prev, hoverIdx: idx } : prev,
      );
    },
    [],
  );

  const onDropClip = useCallback(
    (e: React.DragEvent, targetIdx: number) => {
      e.preventDefault();
      const sourceStr = e.dataTransfer.getData("text/plain");
      const sourceIdx = Number(sourceStr);
      if (Number.isNaN(sourceIdx) || sourceIdx === targetIdx) {
        setReorder(null);
        return;
      }
      const next = [...clips];
      const [moved] = next.splice(sourceIdx, 1);
      if (!moved) {
        setReorder(null);
        return;
      }
      const insertAt =
        sourceIdx < targetIdx ? targetIdx : targetIdx;
      next.splice(insertAt, 0, moved);
      onClipsChange(next);
      setReorder(null);
    },
    [clips, onClipsChange],
  );

  const onDragEndClip = useCallback(() => {
    setReorder(null);
  }, []);

  // close popover on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!openPopover) return;
      const target = e.target as HTMLElement;
      if (!target.closest("[data-popover]")) setOpenPopover(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openPopover]);

  // pointer move/up for edge drag
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (drag.kind !== "edge") return;
      const dxPx = e.clientX - drag.startX;
      const dxSec = dxPx / drag.pxPerSec;
      const next = clips.map((c) => {
        if (c.id !== drag.clipId) return c;
        const orig =
          chunks.find((ch) => ch.filename === c.source)?.durationSec ?? null;
        if (drag.side === "in") {
          let v = drag.startInSec + dxSec;
          v = Math.max(0, Math.min(v, drag.startOutSec - 0.1));
          return { ...c, inSec: Math.round(v * 100) / 100 };
        }
        let v = drag.startOutSec + dxSec;
        v = Math.max(drag.startInSec + 0.1, v);
        if (orig !== null) v = Math.min(v, orig);
        return { ...c, outSec: Math.round(v * 100) / 100 };
      });
      onClipsChange(next);
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, clips, chunks, onClipsChange]);

  const startEdgeDrag = useCallback(
    (
      e: React.PointerEvent,
      clip: Clip,
      side: "in" | "out",
      clipBoxEl: HTMLElement,
    ) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = clipBoxEl.getBoundingClientRect();
      const visible = Math.max(0.01, clip.outSec - clip.inSec);
      const pxPerSec = rect.width / visible;
      setDrag({
        kind: "edge",
        clipId: clip.id,
        side,
        startX: e.clientX,
        startInSec: clip.inSec,
        startOutSec: clip.outSec,
        pxPerSec,
      });
    },
    [],
  );

  const onClipDoubleClick = useCallback(
    (e: React.MouseEvent, clip: Clip, idx: number) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const visible = clip.outSec - clip.inSec;
      const pxPerSec = rect.width / visible;
      const splitTimeWithin = Math.max(0.1, Math.min(visible - 0.1, x / pxPerSec));
      const splitAbsoluteSec = clip.inSec + splitTimeWithin;
      const left: Clip = {
        ...clip,
        id: `${clip.id}-a-${Date.now()}`,
        outSec: Math.round(splitAbsoluteSec * 100) / 100,
        transitionAfter: "cut",
      };
      const right: Clip = {
        ...clip,
        id: `${clip.id}-b-${Date.now()}`,
        inSec: Math.round(splitAbsoluteSec * 100) / 100,
        transitionAfter: clip.transitionAfter,
      };
      const next = [...clips.slice(0, idx), left, right, ...clips.slice(idx + 1)];
      onClipsChange(next);
      setHoverSplit(null);
    },
    [clips, onClipsChange],
  );

  const onClipPointerMove = useCallback((e: React.MouseEvent, clip: Clip) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < HANDLE_W || x > rect.width - HANDLE_W) {
      setHoverSplit(null);
      return;
    }
    const visible = clip.outSec - clip.inSec;
    const pxPerSec = rect.width / visible;
    const tWithin = x / pxPerSec;
    setHoverSplit({
      clipId: clip.id,
      xPx: x,
      timeSec: clip.inSec + tWithin,
    });
  }, []);

  const onClipPointerLeave = useCallback(() => setHoverSplit(null), []);

  const onPickTransition = useCallback(
    (clipId: string, t: TransitionType) => {
      const next = clips.map((c) =>
        c.id === clipId ? { ...c, transitionAfter: t } : c,
      );
      onClipsChange(next);
      setOpenPopover(null);
    },
    [clips, onClipsChange],
  );

  const onDeleteClip = useCallback(
    (clipId: string) => {
      if (clips.length <= 1) return;
      onClipsChange(clips.filter((c) => c.id !== clipId));
    },
    [clips, onClipsChange],
  );

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

  const lengths = clips.map((c) => Math.max(0.05, c.outSec - c.inSec));
  const totalSec = lengths.reduce((a, b) => a + b, 0);

  return (
    <div style={wrap}>
      <div style={titleStyle}>
        Тайм-лайн · {clips.length} клип{clips.length === 1 ? "" : "а/ов"} ·
        итого {fmt(totalSec)}
      </div>
      <div style={helpStyle}>
        <b>Двойной клик</b> по клипу — разрезать в этом месте.{" "}
        <b>Тяни синюю полоску</b> на краю клипа — обрезать начало/конец.{" "}
        <b>Перетащи клип</b> на другой — поменять их местами.{" "}
        <b>Клик по кружку перехода</b> между клипами — поменять переход.
        Изменения автосохраняются.
      </div>
      <div ref={trackRef} style={track}>
        {clips.flatMap((clip, i) => {
          const original =
            chunks.find((c) => c.filename === clip.source)?.durationSec ?? null;
          const visible = Math.max(0, clip.outSec - clip.inSec);
          const wPct = (lengths[i]! / totalSec) * 100;
          const showHover =
            hoverSplit && hoverSplit.clipId === clip.id ? hoverSplit : null;
          const isHover = reorder?.hoverIdx === i;
          const isDragSource = reorder?.draggingIdx === i;
          const box = (
            <div
              key={`c-${clip.id}`}
              draggable
              onDragStart={(e) => onDragStartClip(e, i)}
              onDragOver={(e) => onDragOverClip(e, i)}
              onDrop={(e) => onDropClip(e, i)}
              onDragEnd={onDragEndClip}
              style={{
                ...clipBox,
                flex: `0 0 ${wPct}%`,
                opacity: isDragSource ? 0.4 : 1,
                outline: isHover && !isDragSource ? "2px solid #8b5cf6" : "none",
              }}
              onDoubleClick={(e) => onClipDoubleClick(e, clip, i)}
              onMouseMove={(e) => onClipPointerMove(e, clip)}
              onMouseLeave={onClipPointerLeave}
              title={`${clip.source}\nоригинал ${original ? fmt(original) : "?"}\nin ${fmt(clip.inSec)} → out ${fmt(clip.outSec)}\nдлится ${fmt(visible)}\n\nДвойной клик — разрезать\nТащи — поменять местами с другим клипом`}
            >
              <div
                style={handleStyle("left")}
                draggable={false}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startEdgeDrag(
                    e,
                    clip,
                    "in",
                    e.currentTarget.parentElement as HTMLElement,
                  );
                }}
                title="Тяни — обрезать начало"
              />
              <div
                style={handleStyle("right")}
                draggable={false}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startEdgeDrag(
                    e,
                    clip,
                    "out",
                    e.currentTarget.parentElement as HTMLElement,
                  );
                }}
                title="Тяни — обрезать конец"
              />
              {showHover ? (
                <div style={{ ...splitMarker, left: showHover.xPx }} />
              ) : null}
              <div
                style={{
                  fontWeight: 600,
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {clip.source}
              </div>
              <div style={{ fontSize: 10, opacity: 0.85 }}>
                {fmt(visible)}
                {original && Math.abs(visible - original) > 0.05 ? (
                  <span style={{ opacity: 0.6 }}> / из {fmt(original)}</span>
                ) : null}
              </div>
              {(() => {
                const chunkPath = chunks.find(
                  (c) => c.filename === clip.source,
                )?.path;
                if (!chunkPath) return null;
                return (
                  <Waveform
                    cacheKey={clip.source}
                    url={fileUrl(chunkPath)}
                    inSec={clip.inSec}
                    outSec={clip.outSec}
                    height={20}
                  />
                );
              })()}
              {clips.length > 1 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClip(clip.id);
                  }}
                  title="Удалить клип"
                  style={{
                    position: "absolute",
                    top: 2,
                    right: HANDLE_W + 2,
                    width: 16,
                    height: 16,
                    border: "none",
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    cursor: "pointer",
                    borderRadius: 8,
                    fontSize: 10,
                    lineHeight: "12px",
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );

          if (i === clips.length - 1) return [box];

          const t = clip.transitionAfter;
          const isOpen = openPopover === clip.id;

          return [
            box,
            <div key={`t-${clip.id}`} data-popover>
              <button
                style={transitionPill(t !== "cut")}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenPopover(isOpen ? null : clip.id);
                }}
                title="Сменить переход"
              >
                {TRANSITION_LABELS[t]}
              </button>
              {isOpen ? (
                <div style={popover}>
                  {TRANSITION_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      style={popoverItem(opt === t)}
                      onClick={() => onPickTransition(clip.id, opt)}
                    >
                      {TRANSITION_LABELS[opt]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>,
          ];
        })}
      </div>
    </div>
  );
};
