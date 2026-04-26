import React from "react";

const outer: React.CSSProperties = {
  width: "100%",
  position: "absolute",
  height: "100%",
  justifyContent: "center",
  alignItems: "center",
  display: "flex",
  fontSize: "0.9em",
  color: "#ddd",
};

export const PermissionError: React.FC = () => {
  return (
    <div style={outer}>
      Это устройство, похоже, не может записывать одновременно видео и аудио.
      <br /> Камера и микрофон подключены?
    </div>
  );
};
