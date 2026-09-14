// 把 alphaTab 的字体（Bravura）与 SoundFont 资源复制到 public/，
// 供谱面渲染与内置播放器使用。dev/build 前自动执行。
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distAssets = join(root, "node_modules", "@coderline", "alphatab", "dist");

const copies = [
  [join(distAssets, "font"), join(root, "public", "alphatab", "font")],
  [join(distAssets, "soundfont"), join(root, "public", "alphatab", "soundfont")],
];

for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.warn(`[prepare-alphatab] 源目录不存在，跳过：${from}`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[prepare-alphatab] ${from} -> ${to}`);
}
