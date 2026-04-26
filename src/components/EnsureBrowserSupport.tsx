import { useEffect, useState } from "react";
import { canUseWebFsWriter } from "../helpers/browser-support";

type WebFsState = "loading" | "yes" | "no" | "security-error";

export const EnsureBrowserSupport: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [canUseWebFs, setCanUseWebFs] = useState<WebFsState>("loading");
  useEffect(() => {
    canUseWebFsWriter()
      .then((result) => {
        setCanUseWebFs(result ? "yes" : "no");
      })
      .catch((err) => {
        if ((err as Error).message.includes("Security")) {
          setCanUseWebFs("security-error");
        } else {
          setCanUseWebFs("no");
          console.log(err);
        }
      });
  }, []);

  if (canUseWebFs === "loading") {
    return null;
  }

  if (canUseWebFs === "no") {
    return (
      <div className="justify-center text-white flex items-center flex-col absolute inset-0  text-sm">
        <strong>Браузер не поддерживается</strong>
        <p className="max-w-[500px] text-center text-balance">
          Этот браузер не поддерживает Web FS API, который нужен для работы
          приложения. Попробуй открыть в другом браузере.
        </p>
      </div>
    );
  }

  if (canUseWebFs === "security-error") {
    return (
      <div className="justify-center text-white flex items-center flex-col absolute inset-0  text-sm">
        <strong>Ошибка безопасности</strong>
        <p className="max-w-[500px] text-center text-balance">
          Ошибка при использовании Web File System API. Возможно, ты в режиме
          инкогнито. Попробуй открыть в обычном окне браузера.
        </p>
      </div>
    );
  }

  return children;
};
