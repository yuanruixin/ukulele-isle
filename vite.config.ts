import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { alphaTab } from "@coderline/alphatab-vite";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * ★ 依赖体积分析 —— 只在 `npm run analyze`（= `vite build --mode analyze`）时挂载。
 *
 *   为什么用 `--mode` 而不是环境变量：不用装 cross-env，Windows / macOS 写法一致；
 *   且 mode 只是 "analyze" 时 NODE_ENV 仍是 production，产出内容和正式构建一致。
 *
 *   跑完打开 `dist/stats.html`：**方块面积 = 体积**，鼠标移上去看 gzip / brotli 后的体积。
 *   想知道「这个包是谁引进来的」就把 `sourcemap: true` 打开再看（会慢一些）。
 *
 *   ⚠️ 日常 `npm run build` 不会生成 stats.html —— 别让它成为每次构建的副产品。
 *
 *   本项目的预期：alphaTab 一家占绝大多数（1.2MB 主 chunk + 两个 1.15MB 的
 *   worker / worklet），它已经拆成独立 chunk；主包只剩 React + 路由 + 图标。
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    alphaTab(),

    visualizer({
      open:true,
      /** 产物落在 dist 里，跟构建产物一起看 */
      filename: "stats.html",
      /** 悬浮时同时显示 gzip / brotli 体积——线上传的就是压缩后的 */
      gzipSize: true,
      brotliSize: true,
    }),
  ],
}));
