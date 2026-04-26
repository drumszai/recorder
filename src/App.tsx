import React from "react";
import "./App.css";
import { Button } from "./components/ui/button";

const outer: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  padding: 40,
  gap: 24,
};

const title: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
};

const subtitle: React.CSSProperties = {
  fontSize: 16,
  opacity: 0.7,
  maxWidth: 560,
  lineHeight: 1.5,
};

const App = () => {
  return (
    <div style={outer}>
      <div style={title}>Game Gears Editor</div>
      <div style={subtitle}>
        Монтаж short drama из готовых исходников Reteller. Запись с камеры
        отключена — этот инструмент собирает финал из mp4-чанков и музыки,
        которые скачивает пульт.
      </div>
      <Button asChild variant="outline">
        <a href="http://localhost:3000" target="_blank" rel="noreferrer">
          Открыть монтажку
        </a>
      </Button>
    </div>
  );
};

export default App;
