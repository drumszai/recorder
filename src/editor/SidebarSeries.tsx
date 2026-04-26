import React, { useEffect, useState } from "react";
import type { Series } from "./types";

type Props = {
  selectedSeries: string | null;
  selectedEpisode: number | null;
  onSelect: (series: string, episode: number) => void;
  onBackToHome: () => void;
};

const sidebar: React.CSSProperties = {
  width: 280,
  borderRight: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.02)",
  overflowY: "auto",
  padding: 12,
  flexShrink: 0,
};

const seriesBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  borderRadius: 6,
  fontSize: 14,
  marginBottom: 2,
};

const seriesBtnActive: React.CSSProperties = {
  ...seriesBtn,
  background: "rgba(99,102,241,0.25)",
};

const epBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "5px 10px",
  paddingLeft: 24,
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  borderRadius: 4,
  fontSize: 13,
  opacity: 0.85,
};

const epBtnActive: React.CSSProperties = {
  ...epBtn,
  background: "rgba(99,102,241,0.35)",
  opacity: 1,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  opacity: 0.5,
  margin: "8px 6px 4px",
};

const homeLink: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  opacity: 0.6,
  marginBottom: 12,
  cursor: "pointer",
};

export const SidebarSeries: React.FC<Props> = ({
  selectedSeries,
  selectedEpisode,
  onSelect,
  onBackToHome,
}) => {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [episodesByName, setEpisodesByName] = useState<
    Record<string, number[]>
  >({});

  useEffect(() => {
    fetch("/api/series")
      .then((r) => r.json())
      .then((d: { series?: Series[] }) => setSeries(d.series ?? []))
      .catch(() => setSeries([]));
  }, []);

  useEffect(() => {
    if (selectedSeries) setExpanded((prev) => ({ ...prev, [selectedSeries]: true }));
  }, [selectedSeries]);

  const onClickSeries = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
    if (!episodesByName[name]) {
      fetch(`/api/episodes?series=${encodeURIComponent(name)}`)
        .then((r) => r.json())
        .then((d: { episodes?: number[] }) =>
          setEpisodesByName((prev) => ({ ...prev, [name]: d.episodes ?? [] })),
        )
        .catch(() => setEpisodesByName((prev) => ({ ...prev, [name]: [] })));
    }
  };

  return (
    <div style={sidebar}>
      <a style={homeLink} onClick={onBackToHome}>
        ← К стартовому экрану
      </a>
      <div style={sectionTitle}>Сериалы</div>
      {series === null ? (
        <div style={{ ...sectionTitle, opacity: 0.4 }}>Загружаю…</div>
      ) : (
        series.map((s) => {
          const open = expanded[s.name];
          const eps = episodesByName[s.name];
          return (
            <div key={s.name}>
              <button
                style={
                  selectedSeries === s.name ? seriesBtnActive : seriesBtn
                }
                onClick={() => onClickSeries(s.name)}
                title={s.folder}
              >
                {open ? "▾" : "▸"} {s.name}
              </button>
              {open && eps ? (
                eps.length === 0 ? (
                  <div
                    style={{ ...epBtn, opacity: 0.5, cursor: "default" }}
                  >
                    нет эпизодов
                  </div>
                ) : (
                  eps.map((ep) => (
                    <button
                      key={ep}
                      style={
                        selectedSeries === s.name && selectedEpisode === ep
                          ? epBtnActive
                          : epBtn
                      }
                      onClick={() => onSelect(s.name, ep)}
                    >
                      Эпизод {ep}
                    </button>
                  ))
                )
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
};
