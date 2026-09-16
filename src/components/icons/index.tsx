/**
 * ★ 图标统一入口 —— 全站图标都从这里取，不要在页面里手写 SVG / 单字徽标 ★
 *
 * 为什么要多这一层：
 *   1. 换库、换风格时只改这一个文件，各页面的 import 名字不用动。
 *   2. 尺寸与线宽在这里统一（全部走 `currentColor`，颜色随文字色），
 *      所以同一个图标放在 accent 底、浅灰底、深色底上都直接用。
 *
 * 两个来源：
 *   ① **lucide-react**（默认来源）—— 1800+ 个图标，24 网格 / 2px 描边。
 *      加新图标先去这里找：https://lucide.dev/icons
 *      用法：`import { Search } from "lucide-react"`，或在本文件末尾补一行 re-export。
 *
 *   ② 本文件下方手写的少数图标 —— 库里**没有**的语义才在这里补。
 *      目前只有一个「音叉」：主流图标库（lucide / phosphor / tabler）都不提供
 *      调音相关图标，全库检索后只有 iconmind 的音叉可用（MIT，24 网格 / 2px 描边，
 *      与 lucide 是同一套线条语言，混排看不出差别）。
 */
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { Grid2x2, Guitar } from "lucide-react";
import type { ToolIconName } from "../../config/site.config";

/* ── ① lucide 图标：需要新的直接从 "lucide-react" 引，或在这里补一行 re-export ── */

export { Grid2x2, Guitar };

/* ── ② 库里没有的图标：手写在这里，签名与 lucide 保持一致（size / strokeWidth / className） ── */

/**
 * 音叉（来源 iconmind:tuning-fork-outline-regular，MIT）
 * —— 用来代表「调音器」：谱面上的一根 A 音音叉，比指针表盘更直白。
 */
export function TuningFork({
  size = 24,
  strokeWidth = 2,
  className,
  ...rest
}: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M8 3v10" />
      <path d="M16 3v10" />
      <path d="m8 13 4 4 4-4" />
      <path d="M12 17v4" />
    </svg>
  );
}

/* ── ★ 工具卡片图标表 ──────────────────────────────────────────────────────
 *   键名 = `siteConfig.tools.items[].icon` 里写的那个词。
 *   给某个工具换图标：在这里改指向的组件，然后把 site.config.ts 里的 icon 改成新键名。
 *   类型是 Record<ToolIconName, …>，所以**漏掉任何一个键都会在编译期报错**。
 * ────────────────────────────────────────────────────────────────────────── */

export const TOOL_ICONS: Record<ToolIconName, ComponentType<LucideProps>> = {
  /** 调音器：音叉 */
  "tuning-fork": TuningFork,
  /** 和弦库：四格网格（暗合指法图的格子） */
  "grid-2x2": Grid2x2,
  /** 虚拟尤克里里：吉他 */
  guitar: Guitar,
};
