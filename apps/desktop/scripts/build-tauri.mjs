import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import "./prepare-tauri-config.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const repoRoot = resolve(desktopRoot, "..", "..");
const tauriBin = resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);
const targetDir = resolve(desktopRoot, "src-tauri", "target");

const args = [
  "build",
  "--config",
  resolve(desktopRoot, "src-tauri", "tauri.generated.conf.json"),
  ...process.argv.slice(2),
];

const child = spawn(tauriBin, args, {
  cwd: desktopRoot,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: targetDir,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
