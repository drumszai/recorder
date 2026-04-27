import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  generateDefaultClips,
  type Clip,
  type SubtitleCue,
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

type RenderState = {
  id: string;
  status: "queued" | "bundling" | "rendering" | "done" | "error";
  progress: number;
  outputName: string;
  outputPath: string;
  error?: string;
  tail?: string[];
} | null;

type WhisperStatusResponse = {
  install: {
    status:
      | "idle"
      | "installing-whisper"
      | "downloading-model"
      | "ready"
      | "error";
    progress: number;
    model: string;
    error?: string;
    tail?: string[];
  };
  transcribe: {
    status:
      | "idle"
      | "extracting-audio"
      | "transcribing"
      | "saving"
      | "done"
      | "error";
    progress: number;
    series: string | null;
    episode: number | null;
    transcriptPath?: string;
    srtPath?: string;
    error?: string;
    tail?: string[];
  };
};

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
  const [render, setRender] = useState<RenderState>(null);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleCue[] | null>(null);
  const [subtitlesStatus, setSubtitlesStatus] = useState<
    "idle" | "loading" | "missing" | "ok" | "error"
  >("idle");
  const [whisper, setWhisper] = useState<WhisperStatusResponse | null>(null);

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

  // poll whisper status (always — install state survives across episodes)
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/whisper/status");
        if (r.ok) {
          const data = (await r.json()) as WhisperStatusResponse;
          if (!cancelled) setWhisper(data);
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const onInstallWhisper = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/whisper/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "medium" }),
      });
      const data = (await r.json()) as { error?: string; ok?: boolean };
      if (data.error) setError(data.error);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const onTranscribe = useCallback(async () => {
    if (!selSeries || selEpisode === null) return;
    setError(null);
    try {
      const r = await fetch("/api/whisper/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          series: selSeries,
          episode: selEpisode,
          language: "auto",
        }),
      });
      const data = (await r.json()) as { error?: string; ok?: boolean };
      if (data.error) setError(data.error);
      // re-load subtitles when transcribe finishes (polling covers status,
      // user can flip the toggle to load fresh srt)
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selSeries, selEpisode]);

  const onAutoCut = useCallback(async () => {
    if (!selSeries || selEpisode === null) return;
    setError(null);
    try {
      // ensure latest edits are saved so the server reads our current clips
      if (dirty) await save(true);
      const r = await fetch("/api/auto-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series: selSeries, episode: selEpisode }),
      });
      const data = (await r.json()) as {
        error?: string;
        updated?: number;
        total?: number;
      };
      if (data.error) {
        setError(data.error);
        return;
      }
      // refresh state so the new edit.json takes effect
      void loadEpisode(selSeries, selEpisode);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selSeries, selEpisode, dirty, save, loadEpisode]);

  const onSkipSilence = useCallback(async () => {
    if (!selSeries || selEpisode === null) return;
    setError(null);
    try {
      if (dirty) await save(true);
      const r = await fetch("/api/skip-silence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          series: selSeries,
          episode: selEpisode,
          minGapSec: 1.5,
        }),
      });
      const data = (await r.json()) as {
        error?: string;
        removed?: number;
        clipsAfter?: number;
      };
      if (data.error) {
        setError(data.error);
        return;
      }
      void loadEpisode(selSeries, selEpisode);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selSeries, selEpisode, dirty, save, loadEpisode]);

  const transcriptDoneForCurrent =
    whisper?.transcribe.status === "done" &&
    whisper.transcribe.series === selSeries &&
    whisper.transcribe.episode === selEpisode;

  // load subtitles when toggle on or episode changes
  useEffect(() => {
    if (!showSubtitles || !selSeries || selEpisode === null || view !== "episode") {
      setSubtitles(null);
      setSubtitlesStatus("idle");
      return;
    }
    setSubtitlesStatus("loading");
    fetch(
      `/api/captions?series=${encodeURIComponent(selSeries)}&episode=${selEpisode}`,
    )
      .then(async (r) => {
        if (r.status === 404) {
          setSubtitles([]);
          setSubtitlesStatus("missing");
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { cues?: SubtitleCue[] };
        setSubtitles(data.cues ?? []);
        setSubtitlesStatus("ok");
      })
      .catch(() => {
        setSubtitles([]);
        setSubtitlesStatus("error");
      });
  }, [showSubtitles, selSeries, selEpisode, view]);

  const startRender = useCallback(async () => {
    if (!selSeries) return;
    if (view === "episode" && selEpisode === null) return;
    setError(null);
    // ensure latest edits are saved before kicking the render
    if (view === "episode" && dirty) await save(true);
    try {
      const body =
        view === "episode"
          ? { mode: "episode", series: selSeries, episode: selEpisode }
          : { mode: "series", series: selSeries };
      const r = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as {
        taskId?: string;
        outputPath?: string;
        error?: string;
      };
      if (data.error || !data.taskId) {
        throw new Error(data.error ?? "render failed to start");
      }
      setRender({
        id: data.taskId,
        status: "queued",
        progress: 0,
        outputName: "",
        outputPath: data.outputPath ?? "",
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selSeries, selEpisode, view, dirty, save]);

  // polling render status
  useEffect(() => {
    if (!render || render.status === "done" || render.status === "error") {
      return;
    }
    const id = render.id;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/render/status?id=${encodeURIComponent(id)}`);
        if (!r.ok) return;
        const data = (await r.json()) as {
          id: string;
          status: "queued" | "bundling" | "rendering" | "done" | "error";
          progress: number;
          outputPath: string;
          outputName: string;
          error?: string;
          tail?: string[];
        };
        setRender({
          id: data.id,
          status: data.status,
          progress: data.progress,
          outputPath: data.outputPath,
          outputName: data.outputName,
          error: data.error,
          tail: data.tail,
        });
      } catch {
        /* ignore transient */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [render]);

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
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                cursor: view === "episode" ? "pointer" : "not-allowed",
                opacity: view === "episode" ? 1 : 0.4,
              }}
              title={
                view === "episode"
                  ? "Покажет .ru.srt поверх превью (в финальный mp4 НЕ попадёт)"
                  : "Доступно только в режиме «Серия»"
              }
            >
              <input
                type="checkbox"
                checked={showSubtitles}
                disabled={view !== "episode"}
                onChange={(e) => setShowSubtitles(e.target.checked)}
              />
              Субтитры
              {showSubtitles && view === "episode" ? (
                <span style={{ opacity: 0.7 }}>
                  {subtitlesStatus === "loading"
                    ? "·загружаю"
                    : subtitlesStatus === "missing"
                      ? "·нет .ru.srt"
                      : subtitlesStatus === "ok"
                        ? `·${subtitles?.length ?? 0} строк`
                        : subtitlesStatus === "error"
                          ? "·ошибка"
                          : ""}
                </span>
              ) : null}
            </label>
            <Button
              onClick={() => void save(false)}
              disabled={!selSeries || saving || view === "series"}
            >
              {saving ? "Сохраняю…" : "Сохранить"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void startRender()}
              disabled={
                !selSeries ||
                (view === "episode" && selEpisode === null) ||
                (render !== null &&
                  render.status !== "done" &&
                  render.status !== "error")
              }
              title="Запустить npx remotion render — финальный mp4 ляжет в папку «Рендеры» сериала"
            >
              {render &&
              render.status !== "done" &&
              render.status !== "error"
                ? "Рендерю…"
                : "Рендерить mp4"}
            </Button>
            {whisper?.install.status === "ready" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void onTranscribe()}
                  disabled={
                    !selSeries ||
                    selEpisode === null ||
                    view !== "episode" ||
                    whisper.transcribe.status === "extracting-audio" ||
                    whisper.transcribe.status === "transcribing" ||
                    whisper.transcribe.status === "saving"
                  }
                  title="Распознать речь Whisper'ом, сохранить .ru.srt + transcript.json в .gg-editor/"
                >
                  {whisper.transcribe.status === "transcribing" ||
                  whisper.transcribe.status === "extracting-audio" ||
                  whisper.transcribe.status === "saving"
                    ? "Распознаю…"
                    : "Распознать речь"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void onAutoCut()}
                  disabled={!transcriptDoneForCurrent || view !== "episode"}
                  title="Подогнать inSec/outSec клипов под границы слов из transcript.json"
                >
                  Подогнать разрезы
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void onSkipSilence()}
                  disabled={!transcriptDoneForCurrent || view !== "episode"}
                  title="Найти паузы > 1.5 сек и вырезать их через split клипов"
                >
                  Убрать паузы
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => void onInstallWhisper()}
                disabled={
                  whisper?.install.status === "installing-whisper" ||
                  whisper?.install.status === "downloading-model"
                }
                title="Скачать whisper.cpp + multilingual модель medium (~1.5 ГБ, один раз)"
              >
                {whisper?.install.status === "installing-whisper"
                  ? "Ставлю движок…"
                  : whisper?.install.status === "downloading-model"
                    ? "Качаю модель…"
                    : "Установить движок речи"}
              </Button>
            )}
          </div>
        </div>

        {whisper &&
        (whisper.install.status === "installing-whisper" ||
          whisper.install.status === "downloading-model" ||
          whisper.install.status === "error" ||
          whisper.transcribe.status === "extracting-audio" ||
          whisper.transcribe.status === "transcribing" ||
          whisper.transcribe.status === "saving" ||
          whisper.transcribe.status === "error" ||
          (whisper.transcribe.status === "done" &&
            whisper.transcribe.episode === selEpisode &&
            whisper.transcribe.series === selSeries)) ? (
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontSize: 12,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {whisper.install.status === "installing-whisper" ||
            whisper.install.status === "downloading-model" ? (
              <>
                <div>
                  {whisper.install.status === "installing-whisper"
                    ? "Собираю whisper.cpp…"
                    : `Качаю модель ${whisper.install.model} (${Math.round(whisper.install.progress * 100)}%)…`}
                </div>
                <div
                  style={{
                    height: 4,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(2, whisper.install.progress * 100)}%`,
                      height: "100%",
                      background: "rgba(34,197,94,0.7)",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </>
            ) : null}
            {whisper.install.status === "error" ? (
              <div style={{ color: "#ef4444" }}>
                Ошибка установки: {whisper.install.error}
              </div>
            ) : null}
            {whisper.transcribe.status === "extracting-audio" ||
            whisper.transcribe.status === "transcribing" ||
            whisper.transcribe.status === "saving" ? (
              <>
                <div>
                  {whisper.transcribe.status === "extracting-audio"
                    ? "Извлекаю аудио из mp4…"
                    : whisper.transcribe.status === "transcribing"
                      ? `Распознаю речь (${Math.round(whisper.transcribe.progress * 100)}%)…`
                      : "Сохраняю файлы…"}
                </div>
                <div
                  style={{
                    height: 4,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(2, whisper.transcribe.progress * 100)}%`,
                      height: "100%",
                      background: "rgba(34,197,94,0.7)",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </>
            ) : null}
            {whisper.transcribe.status === "error" ? (
              <div style={{ color: "#ef4444" }}>
                Ошибка распознавания: {whisper.transcribe.error}
              </div>
            ) : null}
            {whisper.transcribe.status === "done" &&
            whisper.transcribe.episode === selEpisode &&
            whisper.transcribe.series === selSeries ? (
              <div>
                Готово · сохранено в <code>.gg-editor/E{selEpisode}.ru.srt</code>{" "}
                · включи чекбокс «Субтитры», чтобы увидеть.
              </div>
            ) : null}
          </div>
        ) : null}

        {render ? (
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                {render.status === "queued" && "В очереди…"}
                {render.status === "bundling" &&
                  `Собираю проект (${Math.round(render.progress * 100)}%)…`}
                {render.status === "rendering" &&
                  `Рендерю кадры (${Math.round(render.progress * 100)}%)…`}
                {render.status === "done" && (
                  <>
                    Готово: <code>{render.outputName}</code>
                  </>
                )}
                {render.status === "error" && (
                  <span style={{ color: "#ef4444" }}>
                    Ошибка: {render.error ?? "неизвестно"}
                  </span>
                )}
              </span>
              {render.status === "done" ? (
                <a
                  href={`/api/file?path=${encodeURIComponent(render.outputPath)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#a5b4fc" }}
                >
                  Открыть mp4
                </a>
              ) : null}
            </div>
            {render.status !== "done" && render.status !== "error" ? (
              <div
                style={{
                  height: 4,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, render.progress * 100)}%`,
                    height: "100%",
                    background: "rgba(99,102,241,0.7)",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            ) : null}
            {render.status === "error" && render.tail ? (
              <pre
                style={{
                  margin: 0,
                  padding: 6,
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 4,
                  fontSize: 10,
                  maxHeight: 80,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {render.tail.join("\n")}
              </pre>
            ) : null}
          </div>
        ) : null}

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
                subtitles={
                  showSubtitles && subtitles && subtitles.length > 0
                    ? subtitles
                    : undefined
                }
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
