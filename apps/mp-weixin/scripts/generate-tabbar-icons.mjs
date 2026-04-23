/**
 * Renders tab bar PNGs from Heroicons SVGs (outline = default, solid = selected).
 * Source defaults to sibling repo: ../stocks-advisor/apps/mini-consumer/images/icons
 * Override with TABBAR_ICON_SRC=/absolute/path/to/icons
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mpRoot = path.join(__dirname, "..");
const repoRoot = path.join(mpRoot, "..", "..");
const defaultIconSrc = path.join(
  repoRoot,
  "..",
  "stocks-advisor",
  "apps",
  "mini-consumer",
  "images",
  "icons"
);
const iconSrc = process.env.TABBAR_ICON_SRC || defaultIconSrc;
const outDir = path.join(mpRoot, "miniprogram", "assets");
const SIZE = 81;
const inactiveColor = "#64748b";

const pairs = [
  ["tab-watch", "heroicons-outline/star.svg", "heroicons-solid/star.svg"],
  [
    "tab-analyze",
    "heroicons-outline/presentation-chart-line.svg",
    "heroicons-solid/presentation-chart-line.svg"
  ],
  [
    "tab-pick",
    "heroicons-outline/chat-bubble-left-right.svg",
    "heroicons-solid/chat-bubble-left-right.svg"
  ],
  ["tab-account", "heroicons-outline/user-circle.svg", "heroicons-solid/user-circle.svg"]
];

function readSvg(rel) {
  const full = path.join(iconSrc, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing SVG: ${full}`);
  }
  return fs.readFileSync(full, "utf8");
}

function outlineInactive(svgText) {
  return Buffer.from(
    svgText.replace(/#0F172A/gi, inactiveColor),
    "utf8"
  );
}

function renderPng(svgBuffer, destPath) {
  const resvg = new Resvg(svgBuffer, {
    fitTo: { mode: "width", value: SIZE }
  });
  const png = resvg.render();
  fs.writeFileSync(destPath, png.asPng());
}

if (!fs.existsSync(iconSrc)) {
  console.error(
    `Icon folder not found: ${iconSrc}\nSet TABBAR_ICON_SRC to your icons directory.`
  );
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const [base, outlineRel, solidRel] of pairs) {
  renderPng(outlineInactive(readSvg(outlineRel)), path.join(outDir, `${base}.png`));
  renderPng(Buffer.from(readSvg(solidRel), "utf8"), path.join(outDir, `${base}-active.png`));
  console.log("wrote", `${base}.png`, `${base}-active.png`);
}
