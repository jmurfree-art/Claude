/**
 * AvatarStudio desktop shell (Electron).
 *
 * Boots the Next.js server from the repo one directory up (installing deps
 * and building on first run), then opens the dashboard in a native window.
 * The server is stopped when the window closes.
 *
 * Dev:   cd desktop && npm install && npm start
 * Build: cd desktop && npm run dist   (installer lands in desktop/dist)
 *
 * NOTE: the packaged app still runs the server out of the repo checkout —
 * Node.js and the repo must exist on the machine. APP_DIR can be overridden
 * with the AVATARSTUDIO_DIR env var if the app is installed elsewhere.
 */

const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const APP_DIR =
  process.env.AVATARSTUDIO_DIR ?? path.resolve(__dirname, "..");
const PORT = Number(process.env.AVATARSTUDIO_PORT ?? 3210);
const URL = `http://127.0.0.1:${PORT}/dashboard`;
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

/** @type {import("child_process").ChildProcess | null} */
let serverProcess = null;
/** @type {BrowserWindow | null} */
let win = null;

const SPLASH_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><meta charset="utf-8"><title>AvatarStudio</title>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#141118;color:#eee;font-family:system-ui">
<div style="text-align:center">
  <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:14px;background:#6d4fd4;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px">&#9654;</div>
  <div id="msg">Starting AvatarStudio&hellip;</div>
  <div style="margin-top:8px;font-size:12px;color:#999">First run installs dependencies and builds &mdash; give it a minute.</div>
</div></body>`)}`;

function runStep(label, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(NPM, args, { cwd: APP_DIR, shell: false });
    let tail = "";
    const capture = (chunk) => {
      tail = (tail + chunk.toString()).slice(-2000);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} failed (exit ${code}):\n${tail}`))
    );
  });
}

function waitForServer(retriesLeft = 60) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host: "127.0.0.1", port: PORT, path: "/", timeout: 2000 },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (retriesLeft-- <= 0) {
        reject(new Error("Server did not become ready on port " + PORT));
        return;
      }
      setTimeout(attempt, 1000);
    };
    attempt();
  });
}

async function ensureBuiltAndStart() {
  if (!fs.existsSync(path.join(APP_DIR, "package.json"))) {
    throw new Error(
      `AvatarStudio repo not found at ${APP_DIR}. ` +
        "Set the AVATARSTUDIO_DIR environment variable to your checkout."
    );
  }
  if (!fs.existsSync(path.join(APP_DIR, ".env.local"))) {
    throw new Error(
      ".env.local is missing in the app folder. Copy .env.example to " +
        ".env.local and fill in your Supabase keys, then relaunch."
    );
  }
  if (!fs.existsSync(path.join(APP_DIR, "node_modules"))) {
    await runStep("npm install", ["install"]);
  }
  if (!fs.existsSync(path.join(APP_DIR, ".next"))) {
    await runStep("npm run build", ["run", "build"]);
  }

  serverProcess = spawn(NPM, ["run", "start", "--", "-p", String(PORT)], {
    cwd: APP_DIR,
    shell: false,
    env: { ...process.env, PORT: String(PORT) },
  });
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    // Server died underneath a live window — surface it rather than hang.
    if (win && !win.isDestroyed() && code !== 0 && code !== null) {
      dialog.showErrorBox(
        "AvatarStudio server stopped",
        `The local server exited with code ${code}. Check the terminal or relaunch.`
      );
      app.quit();
    }
  });

  await waitForServer();
}

function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  if (process.platform === "win32" && child.pid) {
    // npm.cmd spawns a process tree on Windows; taskkill clears it.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false });
  } else {
    child.kill("SIGTERM");
  }
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    backgroundColor: "#141118",
    autoHideMenuBar: true,
    webPreferences: {
      // The window only ever loads our local server; no Node in the page.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  await win.loadURL(SPLASH_HTML);

  try {
    await ensureBuiltAndStart();
    if (!win.isDestroyed()) await win.loadURL(URL);
  } catch (err) {
    if (!win.isDestroyed()) {
      dialog.showErrorBox(
        "AvatarStudio could not start",
        err instanceof Error ? err.message : String(err)
      );
    }
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    stopServer();
    app.quit();
  });
  app.on("before-quit", stopServer);
}
