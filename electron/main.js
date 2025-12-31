import { app, BrowserWindow, dialog, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PORT = 5174;

function getPortableRoot() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, "..");
  }
  return path.dirname(app.getPath("exe"));
}

function configurePortablePaths(portableRoot) {
  const dataRoot = path.join(portableRoot, "data");

  app.setPath("appData", dataRoot);
  app.setPath("userData", path.join(dataRoot, "userData"));
  app.setPath("sessionData", path.join(dataRoot, "sessionData"));
  app.setPath("cache", path.join(dataRoot, "cache"));
  app.setPath("logs", path.join(dataRoot, "logs"));
  app.setPath("crashDumps", path.join(dataRoot, "crashDumps"));
}

let server;

async function createMainWindow() {
  const distRoot = path.resolve(__dirname, "..", "dist-electron");
  const result = await createServer({ root: distRoot, port: LOCAL_PORT });
  server = result.server;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.maximize();

  await win.loadURL(result.url);
}

const portableRoot = getPortableRoot();
configurePortablePaths(portableRoot);

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await createMainWindow();
  } catch (error) {
    dialog.showErrorBox(
      "Dynasty Tracker failed to start",
      `Could not start the local server on port ${LOCAL_PORT}.\n\n${error?.message ?? error}`
    );
    app.quit();
    return;
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (server) {
    server.close();
  }
});
