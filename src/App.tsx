import React, { useCallback, useEffect, useState } from "react";
import "./App.css";
import { Button } from "./components/ui/button";

type Series = { name: string; folder: string };

const outer: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 24,
  gap: 16,
  maxWidth: 800,
  margin: "0 auto",
  width: "100%",
  boxSizing: "border-box",
};

const h1: React.CSSProperties = { fontSize: 28, fontWeight: 700, marginBottom: 4 };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 600, marginTop: 12 };
const muted: React.CSSProperties = { opacity: 0.6, fontSize: 13 };
const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 320,
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

const App = () => {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [selSeries, setSelSeries] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<number[] | null>(null);
  const [selEp, setSelEp] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    fetch(`/api/episodes?series=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data: { episodes?: number[]; error?: string; reason?: string }) => {
        if (data.error) setError(data.error);
        else setEpisodes(data.episodes ?? []);
        if (data.reason && (data.episodes ?? []).length === 0) {
          setError(`Серии не найдены: ${data.reason}`);
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  const onOpenStudio = useCallback(() => {
    if (!selSeries || selEp === null) return;
    // Remotion Studio principal URL params: defaultProps as JSON.
    const inputProps = encodeURIComponent(
      JSON.stringify({ series: selSeries, episode: selEp }),
    );
    window.open(
      `http://localhost:3000/Episode?defaultProps=${inputProps}`,
      "_blank",
      "noreferrer",
    );
  }, [selSeries, selEp]);

  return (
    <div style={outer}>
      <div style={h1}>Game Gears Editor</div>
      <div style={muted}>
        Выбери сериал и серию — откроется монтажка с подгруженными чанками и
        музыкой из «Исходников».
      </div>

      {error ? <div style={errBox}>{error}</div> : null}

      <div style={h2}>Сериал</div>
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
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {selSeries ? (
        <>
          <div style={h2}>Серия</div>
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
                  onClick={() => setSelEp(ep)}
                >
                  Эпизод {ep}
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}

      {selSeries && selEp !== null ? (
        <Button onClick={onOpenStudio} style={{ marginTop: 8 }}>
          Открыть «{selSeries}» / E{selEp} в монтажке
        </Button>
      ) : null}
    </div>
  );
};

export default App;
