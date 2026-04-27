import react from "@vitejs/plugin-react-swc";
import connect from "connect";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { SERVER_PORT } from "../../config/server";
import {
  CANCEL_TRANSCRIBE,
  CREATE_FOLDER,
  GET_FOLDERS,
  TRANSCRIBE_VIDEO,
  UPLOAD_VIDEO,
} from "./constants";
import { createProject } from "./create-project";
import {
  handleAssetFile,
  handleEditGet,
  handleEditPost,
  handleEpisodeAssets,
  handleSeriesEpisodes,
  handleSeriesList,
} from "./episodes";
import {
  handleCaptionsGenerate,
  handleCaptionsGet,
} from "./captions";
import { handleRenderStart, handleRenderStatus } from "./render";
import {
  handleWhisperInstall,
  handleWhisperStatus,
  handleWhisperTranscribe,
} from "./whisper";
import { handleAutoCut, handleSkipSilence } from "./auto-edit";
import { indexHtmlDev } from "./index-html";
import { getProjectFolder } from "./projects";
import {
  handleCancelTranscription,
  handleTranscribeVideo,
  handleVideoUpload,
} from "./upload-video";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const startServer = async () => {
  const app = connect();

  const rootDir = path.join(__dirname, "..", "..");
  const publicDir = path.join(rootDir, "public");

  const vite = await createServer({
    configFile: false,
    root: rootDir,
    server: {
      middlewareMode: true,
      watch: {
        ignored: [path.join(rootDir, "whisper.cpp/**")],
      },
    },
    appType: "custom",
    plugins: [react()],
    publicDir,
  });

  app.use((req, res, next) => {
    vite.middlewares.handle(req, res, next);
  });

  app.use(GET_FOLDERS, (req: IncomingMessage, res: ServerResponse) => {
    getProjectFolder(req, res, rootDir);
  });

  app.use(CREATE_FOLDER, (req: IncomingMessage, res: ServerResponse) => {
    createProject(req, res, rootDir);
  });

  app.use(UPLOAD_VIDEO, handleVideoUpload);
  app.use(TRANSCRIBE_VIDEO, handleTranscribeVideo);
  app.use(CANCEL_TRANSCRIBE, handleCancelTranscription);

  app.use("/api/series", handleSeriesList);
  app.use("/api/episodes", handleSeriesEpisodes);
  app.use("/api/assets", handleEpisodeAssets);
  app.use("/api/file", handleAssetFile);
  app.use("/api/edit", (req: IncomingMessage, res: ServerResponse) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "POST") return handleEditPost(req, res);
    return handleEditGet(req, res);
  });
  app.use("/api/render/status", handleRenderStatus);
  app.use("/api/render", handleRenderStart);
  app.use("/api/captions/generate", handleCaptionsGenerate);
  app.use("/api/captions", handleCaptionsGet);
  app.use("/api/whisper/install", handleWhisperInstall);
  app.use("/api/whisper/transcribe", handleWhisperTranscribe);
  app.use("/api/whisper/status", handleWhisperStatus);
  app.use("/api/auto-cut", handleAutoCut);
  app.use("/api/skip-silence", handleSkipSilence);

  app.use("/", indexHtmlDev(vite, rootDir));

  const port = process.env.PORT || SERVER_PORT;

  app.listen(port);
  console.log(`Recording interface running on http://localhost:${port}`);
};
