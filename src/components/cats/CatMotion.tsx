import { useEffect, useRef, type CSSProperties } from "react";
import type { CatPoseId } from "../../data/cats";
import { siteConfig } from "../../config/site.config";
import { createCatMotion, type CatMotionHandle } from "../../lib/catMotion/engine";
import { useThemeStore } from "../../store/themeStore";

/**
 * 一排小猫（首页站点名底下的那排装饰）。
 *
 * 造型：手绘位图**逐像素描摹**来的，几何一字未改 —— 骨架是一个姿态一个的
 *   `src/assets/cats/<id>.svg`，元数据在 `src/data/cats.ts`（皆生成物）；
 *   文本怎么送到引擎手里见 `src/data/catArt.ts`。要重做造型须重新提供手绘位图。
 * 动作：由迪士尼 12 条动画准则推导，引擎在 `src/lib/catMotion/engine.ts`。
 *
 * 这个组件只做三件事，其余全在引擎里：
 *   1. 挂载时在容器里建一排气囊（`layout:'row'`，一只猫一个实例）；
 *   2. 跟随站点外观切换深浅配色；
 *   3. 卸载时销毁（引擎是模块级共享时钟，不销毁会一直空转）。
 *
 * ★ 站点级开关（要不要、摆几只、多大）在 `siteConfig.cats`；
 *   「动作怎么演」在引擎顶部的 CAT_CONFIG —— 别在这两个地方之间互相搬参数。
 *
 * 样式：外层布局用 Tailwind；引擎产出的节点（`.cat` / `.pose` / `.fx`）的规则在
 *      `src/styles/globals.css` 的 `.cat-motion` 一段里（引擎不注入任何样式）。
 */
export interface CatMotionProps {
  /** 摆哪几只、从左到右（默认取 siteConfig.cats.poses） */
  poses?: readonly CatPoseId[];
  /** 高度（px，桌面端）；默认取 siteConfig.cats.height */
  height?: number;
  /** 窄屏（<640px）高度（px）；默认取 siteConfig.cats.heightMobile */
  heightMobile?: number;
  /** 是否响应指针（悬停 / 点击）；默认取 siteConfig.cats.interactive */
  interactive?: boolean;
  /** 额外类名（间距之类由调用方给） */
  className?: string;
}

export default function CatMotion({
  poses = siteConfig.cats.poses,
  height = siteConfig.cats.height,
  heightMobile = siteConfig.cats.heightMobile,
  interactive = siteConfig.cats.interactive,
  className,
}: CatMotionProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<CatMotionHandle | null>(null);
  const mode = useThemeStore((s) => s.mode);
  /* 数组字面量每次渲染都是新引用 ⇒ 拿字符串当依赖，免得每次渲染重建一遍引擎 */
  const posesKey = poses.join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !posesKey) return;

    /* 系统开了「减弱动态效果」：不给它动，也不接点击 ——
       时间是停住的，这时点一下会僵在预备姿势里，不如索性不演 */
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handle = createCatMotion(host, {
      layout: "row",
      frame: "thumb",
      poses: posesKey.split(","),
      interactive: interactive && !still,
      /* 站点只管这一个工艺参数（站点配置写的是「这排猫按几拍走」）；
         其余动作参数留在引擎里 */
      config: { bpm: siteConfig.cats.bpm },
      theme: useThemeStore.getState().mode,
    });
    if (still) handle.setPlaying(false);
    handleRef.current = handle;

    /* 卸载即销毁：删掉节点、把实例从共享时钟上摘下来（一个都不剩时那条 rAF 自会停） */
    return () => {
      handleRef.current = null;
      handle.destroy();
    };
    // still 是「环境常量」，不进依赖：运行中改变系统偏好本来也不需要重建
  }, [posesKey, interactive]);

  /* 换外观：引擎只改色层 fill + 点缀色，几何不动 */
  useEffect(() => {
    handleRef.current?.setTheme(mode);
  }, [mode]);

  return (
    <div
      ref={hostRef}
      /* w-fit + mx-auto：一排猫整体居中，且只占自己需要的宽度（不会把四只拉开） */
      className={`cat-motion flex w-fit mx-auto items-end select-none ${className ?? ""}`}
      style={
        {
          "--cat-h": `${height}px`,
          "--cat-h-sm": `${heightMobile}px`,
        } as CSSProperties
      }
      /* 纯装饰：点到只会跳一下，没有任何信息或功能是别处拿不到的 */
      aria-hidden="true"
    />
  );
}
