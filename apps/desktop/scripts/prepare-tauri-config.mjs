import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(root, "..");
const defaultDesktopPath = "/app/analyze";
const generatedConfigPath = resolve(
  desktopRoot,
  "src-tauri",
  "tauri.generated.conf.json",
);
const launcherPath = resolve(desktopRoot, "dist", "index.html");

const frontendUrl = process.env.DESKTOP_WEB_URL?.trim();
const desktopPath = process.env.DESKTOP_WEB_PATH?.trim();

if (!frontendUrl) {
  console.error(
    [
      "DESKTOP_WEB_URL is required for desktop production builds.",
      "Example:",
      "  DESKTOP_WEB_URL=https://your-web-domain.com npm run desktop:build",
    ].join("\n"),
  );
  process.exit(1);
}

let appUrl;
try {
  appUrl = new URL(frontendUrl);
} catch {
  console.error(`DESKTOP_WEB_URL must be a valid URL. Received: ${frontendUrl}`);
  process.exit(1);
}

if (desktopPath) {
  const normalizedDesktopPath = desktopPath.startsWith("/") ? desktopPath : `/${desktopPath}`;
  appUrl = new URL(normalizedDesktopPath, appUrl.origin);
} else if (appUrl.pathname === "/") {
  appUrl = new URL(defaultDesktopPath, appUrl.origin);
}

const generatedConfig = {
  app: {
    windows: [
      {
        title: "TuringFin",
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 720,
      },
    ],
  },
};

await mkdir(dirname(generatedConfigPath), { recursive: true });
await mkdir(dirname(launcherPath), { recursive: true });
await writeFile(
  generatedConfigPath,
  `${JSON.stringify(generatedConfig, null, 2)}\n`,
);
await writeFile(launcherPath, renderLauncherHtml(appUrl.toString()));

console.log(`Generated Tauri build config for ${appUrl.toString()}`);
console.log(`Generated local launcher at ${launcherPath}`);

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLauncherHtml(targetUrl) {
  const escapedTargetUrl = escapeHtml(targetUrl);
  const targetUrlJson = JSON.stringify(targetUrl);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TuringFin</title>
    <style>
      :root {
        color-scheme: dark;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        display: grid;
        min-height: 100vh;
        margin: 0;
        place-items: center;
        background:
          radial-gradient(circle at 50% 0%, rgb(117 78 255 / 0.38), transparent 36rem),
          linear-gradient(180deg, #12073a 0%, #030712 100%);
        color: #f8fafc;
      }

      main {
        width: min(560px, calc(100vw - 48px));
        border: 1px solid rgb(255 255 255 / 0.14);
        border-radius: 28px;
        background: rgb(15 23 42 / 0.72);
        box-shadow: 0 32px 96px rgb(0 0 0 / 0.38);
        padding: 40px;
        text-align: center;
      }

      .mark {
        display: inline-grid;
        width: 72px;
        height: 72px;
        margin-bottom: 24px;
        place-items: center;
        border-radius: 20px;
        background: linear-gradient(180deg, #4000d5, #001422);
        box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
        color: white;
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.08em;
      }

      h1 {
        margin: 0;
        font-size: 34px;
        letter-spacing: -0.04em;
      }

      p {
        margin: 14px auto 0;
        max-width: 420px;
        color: #cbd5e1;
        font-size: 15px;
        line-height: 1.7;
      }

      button {
        appearance: none;
        border: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 180px;
        margin-top: 28px;
        border-radius: 999px;
        background: #f8fafc;
        color: #12073a;
        font-weight: 700;
        padding: 13px 22px;
      }

      .url {
        margin-top: 18px;
        overflow-wrap: anywhere;
        color: #94a3b8;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">TF</div>
      <h1>TuringFin</h1>
      <p>桌面客户端已就绪。点击下方按钮进入投研工作台；如果线上服务正在验证登录状态，本地启动页仍会保持可见。</p>
      <button id="enter-button" type="button">进入 TuringFin</button>
      <div class="url">${escapedTargetUrl}</div>
    </main>
    <script>
      window.__TURINGFIN_WEB_URL__ = ${targetUrlJson};
      const enterButton = document.getElementById("enter-button");
      enterButton?.addEventListener("click", async () => {
        enterButton.disabled = true;
        enterButton.textContent = "正在进入...";
        try {
          const invoke = window.__TAURI__?.core?.invoke;
          if (invoke) {
            await invoke("navigate_to_workspace", { url: window.__TURINGFIN_WEB_URL__ });
            return;
          }
          window.location.href = window.__TURINGFIN_WEB_URL__;
        } catch (error) {
          console.error("Failed to open workspace", error);
          enterButton.disabled = false;
          enterButton.textContent = "重试进入 TuringFin";
          window.location.href = window.__TURINGFIN_WEB_URL__;
        }
      });
    </script>
  </body>
</html>
`;
}
