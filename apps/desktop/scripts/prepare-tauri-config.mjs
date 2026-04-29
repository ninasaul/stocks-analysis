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
const distIndexPath = resolve(desktopRoot, "dist", "index.html");

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
        url: appUrl.toString(),
      },
    ],
  },
};

await mkdir(dirname(generatedConfigPath), { recursive: true });
await mkdir(dirname(distIndexPath), { recursive: true });
await writeFile(
  generatedConfigPath,
  `${JSON.stringify(generatedConfig, null, 2)}\n`,
);
await writeFile(distIndexPath, renderDistIndexPlaceholder());

console.log(`Generated Tauri build config for ${appUrl.toString()}`);
console.log(`Wrote bundle placeholder at ${distIndexPath}`);

function renderDistIndexPlaceholder() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>TuringFin</title>
  </head>
  <body>
    <p>TuringFin</p>
  </body>
</html>
`;
}
