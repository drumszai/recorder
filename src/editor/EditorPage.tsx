import React, { useCallback, useEffect, useState } from "react";
import {
  generateDefaultClips,
  type Clip,
} from "../../remotion/Episode";
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

type Props = {
  initialSeries: string;
  initialEpisode: number;
  onBackToHome: () => void;
};

const DEFAULT_TRANSITION_FRAMES = 15;

export const EditorPage: React.FC<Props> = ({
  initialSeries,
  initialEpisode,
  onBackToHome,
}) => {
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEpisode = useCallback(async (s: string, ep: number) => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, eRes] = await Promise.all([
        fetch(`/api/assets?series=${encodeURIComponent(s)}&episode=${ep}`),
        fetch(`/api/edit?series=${encodeURIComponent(s)}&episode=${ep}`),
      ]);
      const assets = (await aRes.json()) as AssetsResponse;
      if (assets.error) throw new Error(assets.error);
      setChunks(assets.chunks ?? []);
      setMusic(assets.music ?? null);
      setSeriesFolder(assets.seriesFolder ?? "");

      if (eRes.ok) {
        const edit = (await eRes.json()) as {
          clips?: Clip[];
          transitionFrames?: number;
          fadeInFrames?: number;
          fadeOutFrames?: number;
          savedAt?: string;
        };
        setClips(
          edit.clips && edit.clips.length > 0
            ? edit.clips
            : generateDefaultClips(assets.chunks ?? []),
        );
        setTransitionFrames(
          edit.transitionFrames ?? DEFAULT_TRANSITION_FRAMES,
        );
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selSeries && selEpisode !== null) {
      void loadEpisode(selSeries, selEpisode);
    }
  }, [selSeries, selEpisode, loadEpisode]);

  const onSelectFromSidebar = useCallback(
    (s: string, ep: number) => {
      setSelSeries(s);
      setSelEpisode(ep);
    },
    [],
  );

  const onSave = useCallback(async () => {
    if (!selSeries || selEpisode === null) return;
    setSaving(true);
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [selSeries, selEpisode, clips, transitionFrames, fadeInFrames, fadeOutFrames]);

  return (
    <div style={root}>
      <SidebarSeries
        selectedSeries={selSeries}
        selectedEpisode={selEpisode}
        onSelect={onSelectFromSidebar}
        onBackToHome={onBackToHome}
      />
      <div style={main}>
        <div style={topBar}>
          <div>
            <div style={topTitle}>
              {selSeries ?? "Сериал не выбран"} /{" "}
              {selEpisode !== null ? `Эпизод ${selEpisode}` : "—"}
            </div>
            <div style={topMuted}>
              {loading
                ? "Загружаю…"
                : savedAt
                  ? `Сохранено ${new Date(savedAt).toLocaleTimeString("ru-RU")}`
                  : "Не сохранено"}
              {error ? ` · Ошибка: ${error}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onSave} disabled={!selSeries || saving}>
              {saving ? "Сохраняю…" : "Сохранить"}
            </Button>
          </div>
        </div>

        {selSeries && selEpisode !== null && !loading && chunks.length > 0 ? (
          <>
            <PreviewPane
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
            <Timeline clips={clips} chunks={chunks} />
          </>
        ) : (
          <div style={empty}>
            {loading
              ? "Загружаю серию…"
              : "Выбери сериал и эпизод слева — справа появится превью и тайм-лайн."}
          </div>
        )}
      </div>
    </div>
  );
};
