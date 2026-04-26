import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  generateDefaultClips,
  type Clip,
  type TransitionType,
} from "../../remotion/Episode";
import type { SeriesEpisodePack } from "../../remotion/Series";
import { Button } from "../components/ui/button";
import { PreviewPane } from "./PreviewPane";
import { SidebarSeries } from "./SidebarSeries";
import { Timeline } from "./Timeline";
import type { AssetsResponse, Chunk, Music } from "./types";

const root: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "row",
};

const main: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  flexShrink: 0,
  gap: 12,
  flexWrap: "wrap",
};

const topTitle: React.CSSProperties = { fontWeight: 600, fontSize: 15 };
const topMuted: React.CSSProperties = { opacity: 0.6, fontSize: 12 };
const empty: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.6,
  textAlign: "center",
  padding: 32,
  fontSize: 14,
};

const controlGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const controlBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  fontSize: 11,
  opacity: 0.85,
  gap: 2,
};

const numInput: React.CSSProperties = {
  width: 70,
  padding: "4px 6px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 12,
};

const toggleBar: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  overflow: "hidden",
};

const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  background: active ? "rgba(99,102,241,0.4)" : "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
});

type Props = {
  initialSeries: string;
  initialEpisode: number;
  onBackToHome: () => void;
};

const DEFAULT_TRANSITION_FRAMES = 15;
const AUTOSAVE_DELAY_MS = 800;

type ViewMode = "episode" | "series";

const fetchAssets = async (
  series: string,
  episode: number,
): Promise<AssetsResponse> => {
  const r = await fetch(
    `/api/assets?series=${encodeURIComponent(series)}&episode=${episode}`,
  );
  return r.json() as Promise<AssetsResponse>;
};

const fetchEdit = async (
  series: string,
  episode: number,
): Promise<{
  clips?: Clip[];
  transitionFrames?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  savedAt?: string;
} | null> => {
  const r = await fetch(
    `/api/edit?series=${encodeURIComponent(series)}&episode=${episode}`,
  );
  if (!r.ok) return null;
  return r.json();
};

export const EditorPage: React.FC<Props> = ({
  initialSeries,
  initialEpisode,
  onBackToHome,
}) => {
  const [view, setView] = useState<ViewMode>("episode");
  const [selSeries, setSelSeries] = useState<string | null>(initialSeries);
  const [selEpisode, setSelEpisode] = useState<number | null>(initialEpisode);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [music, setMusic] = useState<Music>(null);
  const [seriesFolder, setSeriesFolder] = useState<string>("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [transitionFrames, setTransitionFrames] = useState(
    DEFAULT_TRANSITION_FRAMES,
  );
  const [fadeInFrames, setFadeInFrames] = useState(0);
  const [fadeOutFrames, setFadeOutFrames] = useState(0);
  const [seriesPacks, setSeriesPacks] = useState<SeriesEpisodePack[]>([]);
  const [transitionBetweenEpisodes, setTransitionBetweenEpisodes] =
    useState<TransitionType>("fade");
  const [loading, setLoading] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEpisode = useCallback(async (s: string, ep: number) => {
    setLoading(true);
    setError(null);
    try {
      const [assets, edit] = await Promise.all([
        fetchAssets(s, ep),
        fetchEdit(s, ep),
      ]);
      if (assets.error) throw new Error(assets.error);
      setChunks(assets.chunks ?? []);
      setMusic(assets.music ?? null);
      setSeriesFolder(assets.seriesFolder ?? "");
      if (edit) {
        setClips(
          edit.clips && edit.clips.length > 0
            ? edit.clips
            : generateDefaultClips(assets.chunks ?? []),
        );
        setTransitionFrames(edit.transitionFrames ?? DEFAULT_TRANSITION_FRAMES);
        setFadeInFrames(edit.fadeInFrames ?? 0);
        setFadeOutFrames(edit.fadeOutFrames ?? 0);
        setSavedAt(edit.savedAt ?? null);
      } else {
        setClips(generateDefaultClips(assets.chunks ?? []));
        setTransitionFrames(DEFAULT_TRANSITION_FRAMES);
        setFadeInFrames(0);
        setFadeOutFrames(0);
        setSavedAt(null);
      }
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWholeSeries = useCallback(async (s: string) => {
    setSeriesLoading(true);
    setError(null);
    try {
      const epRes = await fetch(
        `/api/episodes?series=${encodeURIComponent(s)}`,
      );
      const epData = (await epRes.json()) as { episodes?: number[] };
      const epNums = epData.episodes ?? [];
      const packs: SeriesEpisodePack[] = await Promise.all(
        epNums.map(async (ep) => {
          const [assets, edit] = await Promise.all([
            fetchAssets(s, ep),
            fetchEdit(s, ep),
          ]);
          const ch = assets.chunks ?? [];
          const cl =
            edit?.clips && edit.clips.length > 0
              ? edit.clips
              : generateDefaultClips(ch);
          return {
            episode: ep,
            clips: cl,
            chunks: ch,
            music: assets.music ?? null,
            seriesFolder: assets.seriesFolder ?? "",
          };
        }),
      );
      setSeriesPacks(packs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSeriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "episode" && selSeries && selEpisode !== null) {
      void loadEpisode(selSeries, selEpisode);
    }
  }, [view, selSeries, selEpisode, loadEpisode]);

  useEffect(() => {
    if (view === "series" && selSeries) {
      void loadWholeSeries(selSeries);
    }
  }, [view, selSeries, loadWholeSeries]);

  const onSelectFromSidebar = useCallback((s: string, ep: number) => {
    setSelSeries(s);
    setSelEpisode(ep);
    setView("episode");
  }, []);

  const onClipsChange = useCallback((next: Clip[]) => {
    setClips(next);
    setDirty(true);
  }, []);

  const save = useCallback(
    async (silent = false) => {
      if (!selSeries || selEpisode === null) return;
      if (!silent) setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/edit?series=${encodeURIComponent(selSeries)}&episode=${selEpisode}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clips,
              transitionFrames,
              fadeInFrames,
              fadeOutFrames,
            }),
          },
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setSavedAt(new Date().toISOString());
        setDirty(false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (!silent) setSaving(false);
      }
    },
    [selSeries, selEpisode, clips, transitionFrames, fadeInFrames, fadeOutFrames],
  );

  // autosave on changes
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (view !== "episode") return;
    if (!dirty) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => void save(true), AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [view, dirty, save]);

  // mark dirty when these change
  useEffect(() => {
    setDirty(true);
  }, [transitionFrames, fadeInFrames, fadeOutFrames]);

  const headerLabel =
    view === "episode"
      ? `${selSeries ?? "—"} / ${selEpisode !== null ? `Эпизод ${selEpisode}` : "—"}`
      : `${selSeries ?? "—"} / Весь сериал`;

  const status = loading
    ? "Загружаю серию…"
    : seriesLoading
      ? "Собираю эпизоды…"
      : saving
        ? "Сохраняю…"
        : dirty
          ? "Несохранённые правки"
          : savedAt
            ? `Сохранено ${new Date(savedAt).toLocaleTimeString("ru-RU")}`
            : "Не сохранено";

  return (
    <div style={root}>
      <SidebarSeries
        selectedSeries={selSeries}
        selectedEpisode={view === "episode" ? selEpisode : null}
        onSelect={onSelectFromSidebar}
        onBackToHome={onBackToHome}
      />
      <div style={main}>
        <div style={topBar}>
          <div>
            <div style={topTitle}>{headerLabel}</div>
            <div style={topMuted}>
              {status}
              {error ? ` · Ошибка: ${error}` : ""}
            </div>
          </div>

          <div style={controlGroup}>
            <div style={toggleBar}>
              <button
                style={toggleBtn(view === "episode")}
                onClick={() => setView("episode")}
                disabled={!selSeries}
              >
                Серия
              </button>
              <button
                style={toggleBtn(view === "series")}
                onClick={() => setView("series")}
                disabled={!selSeries}
              >
                Весь сериал
              </button>
            </div>

            <div style={controlBlock}>
              <span>Длит. перехода (кадры)</span>
              <input
                type="number"
                min={0}
                max={120}
                style={numInput}
                value={transitionFrames}
                onChange={(e) =>
                  setTransitionFrames(Math.max(0, Number(e.target.value)))
                }
              />
            </div>
            <div style={controlBlock}>
              <span>Fade-in (кадры)</span>
              <input
                type="number"
                min={0}
                max={180}
                style={numInput}
                value={fadeInFrames}
                onChange={(e) =>
                  setFadeInFrames(Math.max(0, Number(e.target.value)))
                }
              />
            </div>
            <div style={controlBlock}>
              <span>Fade-out (кадры)</span>
              <input
                type="number"
                min={0}
                max={180}
                style={numInput}
                value={fadeOutFrames}
                onChange={(e) =>
                  setFadeOutFrames(Math.max(0, Number(e.target.value)))
                }
              />
            </div>
            {view === "series" ? (
              <div style={controlBlock}>
                <span>Переход между сериями</span>
                <select
                  value={transitionBetweenEpisodes}
                  onChange={(e) =>
                    setTransitionBetweenEpisodes(
                      e.target.value as TransitionType,
                    )
                  }
                  style={{ ...numInput, width: 130 }}
                >
                  <option value="cut">Без перехода</option>
                  <option value="fade">Затемнение</option>
                  <option value="slide-left">Сдвиг ← слева</option>
                  <option value="slide-right">Сдвиг → справа</option>
                  <option value="wipe-left">Шторка ← слева</option>
                  <option value="wipe-right">Шторка → справа</option>
                  <option value="flip">Переворот</option>
                  <option value="clock">Круговое</option>
                </select>
              </div>
            ) : null}
            <Button
              onClick={() => void save(false)}
              disabled={!selSeries || saving || view === "series"}
            >
              {saving ? "Сохраняю…" : "Сохранить"}
            </Button>
          </div>
        </div>

        {view === "episode" ? (
          selSeries && selEpisode !== null && !loading && chunks.length > 0 ? (
            <>
              <PreviewPane
                mode="episode"
                series={selSeries}
                episode={selEpisode}
                chunks={chunks}
                music={music}
                seriesFolder={seriesFolder}
                clips={clips}
                transitionFrames={transitionFrames}
                fadeInFrames={fadeInFrames}
                fadeOutFrames={fadeOutFrames}
              />
              <Timeline
                clips={clips}
                chunks={chunks}
                onClipsChange={onClipsChange}
              />
            </>
          ) : (
            <div style={empty}>
              {loading
                ? "Загружаю серию…"
                : "Выбери сериал и эпизод слева — справа появится превью и тайм-лайн."}
            </div>
          )
        ) : selSeries && !seriesLoading && seriesPacks.length > 0 ? (
          <PreviewPane
            mode="series"
            series={selSeries}
            episodes={seriesPacks}
            transitionBetweenEpisodes={transitionBetweenEpisodes}
            transitionFrames={transitionFrames}
            fadeInFrames={fadeInFrames}
            fadeOutFrames={fadeOutFrames}
          />
        ) : (
          <div style={empty}>
            {seriesLoading
              ? "Собираю эпизоды…"
              : "Выбери сериал слева — увидишь все эпизоды одним превью."}
          </div>
        )}
      </div>
    </div>
  );
};
