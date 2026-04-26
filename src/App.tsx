import React, { useCallback, useEffect, useState } from "react";
import "./App.css";
import { Button } from "./components/ui/button";
import { EditorPage } from "./editor/EditorPage";

type Mode =
  | { kind: "home" }
  | { kind: "editor"; series: string; episode: number };

type Series = { name: string; folder: string };

type Chunk = {
  filename: string;
  path: string;
  chunk: number;
  version: number;
  durationSec: number | null;
};

type AssetsResponse = {
  chunks?: Chunk[];
  music?: { filename: string; path: string } | null;
  seriesFolder?: string;
  error?: string;
};

const outer: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 24,
  gap: 16,
  maxWidth: 920,
  margin: "0 auto",
  width: "100%",
  boxSizing: "border-box",
};

const h1: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 4,
};
const h2: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginTop: 12,
};
const muted: React.CSSProperties = { opacity: 0.6, fontSize: 13 };
const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 240,
  overflowY: "auto",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: 8,
};
const itemBtn: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  borderRadius: 6,
  fontSize: 14,
};
const itemBtnActive: React.CSSProperties = {
  ...itemBtn,
  background: "rgba(99,102,241,0.25)",
};
const errBox: React.CSSProperties = {
  color: "#ef4444",
  fontSize: 13,
  padding: 8,
  border: "1px solid #ef4444",
  borderRadius: 6,
};
const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: 14,
  background: "rgba(255,255,255,0.02)",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
  fontWeight: 600,
  opacity: 0.7,
};
const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  whiteSpace: "nowrap",
};

const fmtSec = (s: number | null | undefined) =>
  s === null || s === undefined ? "—" : `${s.toFixed(2)} с`;

const Howto: React.FC = () => (
  <div style={card}>
    <div style={{ fontWeight: 600, marginBottom: 6 }}>
      Как пользоваться (короткая версия)
    </div>
    <ol style={{ marginLeft: 18, lineHeight: 1.5, fontSize: 13 }}>
      <li>
        <b>Выбери сериал</b> и <b>номер серии</b> ниже. Снизу появится список
        исходных mp4-чанков с длительностями.
      </li>
      <li>
        Нажми <b>«Открыть в монтажке»</b> — откроется отдельная вкладка
        Remotion Studio (порт 3000) с твоей серией.
      </li>
      <li>
        В Studio справа есть панель <b>Props</b> — там JSON со всеми
        настройками: список клипов, переходы между ними, длительность
        переходов, fade-in/fade-out серии. У каждого поля есть русская
        подсказка — наведи мышью.
      </li>
      <li>
        Чтобы <b>разрезать чанк</b> на куски — добавь в массив <code>clips</code>{" "}
        несколько объектов с одним и тем же <code>source</code>, разными{" "}
        <code>inSec</code> / <code>outSec</code>. На стыке между ними выбери
        переход в <code>transitionAfter</code> (cut / fade / slide / wipe /
        flip / clock).
      </li>
      <li>
        Чтобы <b>увидеть весь сериал одним тайм-лайном</b> — нажми «Открыть
        весь сериал» (внизу страницы). Между сериями тоже есть свой переход.
      </li>
      <li>
        Кнопка <b>Render</b> в правом верхнем углу Studio — собирает финальный
        mp4 в папку <code>out/</code>.
      </li>
    </ol>
  </div>
);

const App = () => {
  const [mode, setMode] = useState<Mode>({ kind: "home" });
  const [series, setSeries] = useState<Series[] | null>(null);
  const [selSeries, setSelSeries] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<number[] | null>(null);
  const [selEp, setSelEp] = useState<number | null>(null);
  const [assets, setAssets] = useState<AssetsResponse | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode.kind === "editor") {
    return (
      <EditorPage
        initialSeries={mode.series}
        initialEpisode={mode.episode}
        onBackToHome={() => setMode({ kind: "home" })}
      />
    );
  }

  useEffect(() => {
    fetch("/api/series")
      .then((r) => r.json())
      .then((data: { series?: Series[]; error?: string }) => {
        if (data.error) setError(data.error);
        else setSeries(data.series ?? []);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const onPickSeries = useCallback((name: string) => {
    setSelSeries(name);
    setEpisodes(null);
    setSelEp(null);
    setAssets(null);
    setError(null);
    fetch(`/api/episodes?series=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then(
        (data: { episodes?: number[]; error?: string; reason?: string }) => {
          if (data.error) setError(data.error);
          else setEpisodes(data.episodes ?? []);
          if (data.reason && (data.episodes ?? []).length === 0) {
            setError(`Серии не найдены: ${data.reason}`);
          }
        },
      )
      .catch((e) => setError(String(e)));
  }, []);

  const onPickEpisode = useCallback(
    (ep: number) => {
      if (!selSeries) return;
      setSelEp(ep);
      setAssets(null);
      setAssetsLoading(true);
      fetch(
        `/api/assets?series=${encodeURIComponent(selSeries)}&episode=${ep}`,
      )
        .then((r) => r.json())
        .then((data: AssetsResponse) => {
          setAssets(data);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setAssetsLoading(false));
    },
    [selSeries],
  );

  const onOpenEditor = useCallback(() => {
    if (!selSeries || selEp === null) return;
    setMode({ kind: "editor", series: selSeries, episode: selEp });
  }, [selSeries, selEp]);

  const onOpenStudio = useCallback(() => {
    if (!selSeries || selEp === null) return;
    const inputProps = encodeURIComponent(
      JSON.stringify({ series: selSeries, episode: selEp }),
    );
    window.open(
      `http://localhost:3000/Episode?defaultProps=${inputProps}`,
      "_blank",
      "noreferrer",
    );
  }, [selSeries, selEp]);

  const onOpenWholeSeries = useCallback(() => {
    if (!selSeries) return;
    const inputProps = encodeURIComponent(
      JSON.stringify({ series: selSeries }),
    );
    window.open(
      `http://localhost:3000/Series?defaultProps=${inputProps}`,
      "_blank",
      "noreferrer",
    );
  }, [selSeries]);

  const totalChunkSec =
    assets?.chunks?.reduce((s, c) => s + (c.durationSec ?? 0), 0) ?? 0;

  return (
    <div style={outer}>
      <div style={h1}>Game Gears Editor</div>
      <div style={muted}>
        Монтаж short drama из готовых исходников Reteller. Запись с камеры
        отключена.
      </div>

      <Howto />

      {error ? <div style={errBox}>{error}</div> : null}

      <div style={h2}>1. Сериал</div>
      <div style={muted}>
        Список собран из реестра пульта (
        <code>.pipeline_registry.json</code>). Если сериала нет — добавь его в
        пульте сначала.
      </div>
      {series === null ? (
        <div style={muted}>Загружаю список…</div>
      ) : series.length === 0 ? (
        <div style={muted}>В реестре нет сериалов.</div>
      ) : (
        <div style={list}>
          {series.map((s) => (
            <button
              key={s.name}
              style={selSeries === s.name ? itemBtnActive : itemBtn}
              onClick={() => onPickSeries(s.name)}
              title={s.folder}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {selSeries ? (
        <>
          <div style={h2}>2. Серия</div>
          <div style={muted}>
            Номера эпизодов извлекаются из имён файлов вида{" "}
            <code>E1 CH1 V1.mp4</code> в папке «Исходники».
          </div>
          {episodes === null ? (
            <div style={muted}>Сканирую папку…</div>
          ) : episodes.length === 0 ? (
            <div style={muted}>Чанков не найдено.</div>
          ) : (
            <div style={list}>
              {episodes.map((ep) => (
                <button
                  key={ep}
                  style={selEp === ep ? itemBtnActive : itemBtn}
                  onClick={() => onPickEpisode(ep)}
                >
                  Эпизод {ep}
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}

      {selSeries && selEp !== null ? (
        <>
          <div style={h2}>3. Чанки серии E{selEp}</div>
          <div style={muted}>
            Это исходные mp4 — каждому в дефолте соответствует один клип на
            тайм-лайне. После открытия в Studio ты можешь резать каждый чанк
            на несколько клипов и менять переходы.
          </div>
          {assetsLoading ? (
            <div style={muted}>Анализирую длительности…</div>
          ) : assets?.chunks && assets.chunks.length > 0 ? (
            <div style={card}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Файл</th>
                    <th style={thStyle}>Чанк</th>
                    <th style={thStyle}>Версия</th>
                    <th style={thStyle}>Оригинал</th>
                    <th style={thStyle}>На тайм-лайне (по умолчанию)</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.chunks.map((c) => (
                    <tr key={c.filename}>
                      <td style={tdStyle}>
                        <code>{c.filename}</code>
                      </td>
                      <td style={tdStyle}>CH{c.chunk}</td>
                      <td style={tdStyle}>v{c.version}</td>
                      <td style={tdStyle}>{fmtSec(c.durationSec)}</td>
                      <td style={tdStyle}>
                        {fmtSec(c.durationSec)}{" "}
                        <span style={muted}>(не обрезан)</span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>Итого</td>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}></td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {fmtSec(totalChunkSec)}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {fmtSec(totalChunkSec)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ ...muted, marginTop: 8 }}>
                Музыка серии:{" "}
                {assets.music ? (
                  <code>{assets.music.filename}</code>
                ) : (
                  "не найдена в папке «Звук»"
                )}
              </div>
              <div style={{ ...muted, marginTop: 4 }}>
                <b>«На тайм-лайне»</b> = сколько секунд от чанка попадёт в
                итоговое видео после применения <code>inSec</code>/
                <code>outSec</code> в Studio. По умолчанию = весь чанк целиком.
                Если в Studio ты выставишь <code>inSec=2.0</code>,{" "}
                <code>outSec=10.0</code> — здесь это пока не отразится (значения
                редактируются в Studio Props panel, не тут).
              </div>
            </div>
          ) : (
            <div style={muted}>Чанков не найдено.</div>
          )}
        </>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {selSeries && selEp !== null ? (
          <Button onClick={onOpenEditor}>
            Открыть «{selSeries}» / E{selEp} в редакторе
          </Button>
        ) : null}

        {selSeries && selEp !== null ? (
          <Button variant="outline" onClick={onOpenStudio}>
            Открыть в Studio (для рендера)
          </Button>
        ) : null}

        {selSeries ? (
          <Button variant="outline" onClick={onOpenWholeSeries}>
            Открыть весь сериал в Studio
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default App;
