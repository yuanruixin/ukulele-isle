import { useCallback, useRef } from "react";
import type * as alphaTabNs from "@coderline/alphatab";
import { createSynthFx, type SynthFxHandle, type SynthFxOptions } from "../lib/synthFx";

/**
 * 通用 hook `useSynthFx` 与它的控制器 `SynthFxController`：
 * 把「低通 + 混响」效果链挂到一个 alphaTab 播放器实例上。
 *
 * 站点里有三个播放器各有一份自己的 AlphaTabApi（曲谱页、和弦库、虚拟尤克里里），
 * 三处要做的是同样两件事，所以收在这里一份实现：
 *   1. 建好播放器**之后**才能拿到输出节点 → 在「构造完」和「playerReady」两处都试一次
 *      （`attach` 自己会去重，重复调没有副作用）；
 *   2. 卸载时 `detach`：拆线、把被包过的 `play()` 还原回去。
 *
 * **有没有这条链只看 ★ 配置里的 `fx.enabled`（`player.fx` / `chords.fx` / `uke.fx`），
 * 页面上没有开关**：关掉时 `createSynthFx` 返回 null，这里就什么都不做——
 * 音频路径上不留任何痕迹。想调味道或想关掉，改配置、刷新页面即可。
 *
 * 用法（谁持有 api，谁负责 attach / detach）：
 * ```tsx
 * const fx = useSynthFx(siteConfig.player.fx);
 * // 建好 api 之后（两处都试，attach 会去重）：
 * fx.attach(api);
 * api.playerReady.on(() => fx.attach(api));
 * // 卸载时：fx.detach()
 * ```
 */
export interface SynthFxController {
  /** 把效果链接到这个播放器实例上；可重复调用，内部去重 */
  attach: (api: alphaTabNs.AlphaTabApi) => void;
  /** 拆线并释放（页面卸载时调） */
  detach: () => void;
}

export function useSynthFx(options: SynthFxOptions): SynthFxController {
  const fxRef = useRef<SynthFxHandle | null>(null);
  /** 参数放 ref，避免调用方每次渲染换个对象就把 attach 变成新函数 */
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const attach = useCallback((api: alphaTabNs.AlphaTabApi) => {
    if (fxRef.current || !api.player) return;
    fxRef.current = createSynthFx(api, optionsRef.current);
  }, []);

  const detach = useCallback(() => {
    fxRef.current?.dispose();
    fxRef.current = null;
  }, []);

  return { attach, detach };
}
