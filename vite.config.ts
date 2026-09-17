import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { alphaTab } from "@coderline/alphatab-vite";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * ★ 依赖体积分析 —— 只在 `pnpm analyze`（= `vite build --mode analyze`）时挂载。
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
