import { useEffect, useRef, type CSSProperties } from "react";
import type { CatPoseId } from "../../data/cats";
import { siteConfig } from "../../config/site.config";
import {
  createCatMotion,
  type CatMotionHandle,
  type DeepPartial,
  type CatConfig,
  type SceneSlot,
} from "../../lib/catMotion/engine";
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
  /**
   * 布局（默认 'row' = 横排等分）。
   *   - 'row'   老样子：flex 等分父容器宽 ⇒ 同宽、等距、齐平（适合"一排装饰"）
   *   - 'scene' 场景布局：位置与尺寸**交给调用方的 CSS**（见 globals.css 里 .home-scene 一段），
   *             引擎只建盒子并标 data-layout="scene"。破「整齐」就靠它。
   */
  layout?: "row" | "scene";
  /** scene 布局的占位表；给个 pose 就够（位置留给 CSS）。不传 = 按 poses 逐只建 */
  slots?: SceneSlot[];
  /**
   * 高度（px，桌面端）；默认取 siteConfig.cats.height。
   * ⚠️ **row 布局才用**：scene 布局的高度由 CSS 百分比给，这里传了也不会生效。
   */
  height?: number;
  /** 窄屏（<640px）高度（px）；默认取 siteConfig.cats.heightMobile。同上，仅 row 用 */
  heightMobile?: number;
  /** 是否响应指针（悬停 / 点击）；默认取 siteConfig.cats.interactive */
  interactive?: boolean;
  /** 覆盖任意动作参数（scene 布局常用来把跳跃行程收小，免得跳出布置好的位置） */
  config?: DeepPartial<CatConfig>;
  /** 额外类名（间距之类由调用方给） */
  className?: string;
}

export default function CatMotion({
  poses = siteConfig.cats.poses,
  layout = "row",
  slots,
  height = siteConfig.cats.height,
  heightMobile = siteConfig.cats.heightMobile,
  interactive = siteConfig.cats.interactive,
  config,
  className,
}: CatMotionProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<CatMotionHandle | null>(null);
  const mode = useThemeStore((s) => s.mode);
  /* 数组字面量每次渲染都是新引用 ⇒ 拿字符串当依赖，免得每次渲染重建一遍引擎 */
  const posesKey = poses.join(",");
  /* 占位表同理（它通常还是写在本文件外的字面量）；序列化一次当依赖 */
  const slotsKey = slots ? JSON.stringify(slots) : "";
  /* scene 布局的高度由 CSS 百分比给（见 globals.css 的 .home-scene 一段），
     这时候再把 --cat-h 写进去只会误导后来人 ⇒ 不写 */
  const isScene = layout === "scene";

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !posesKey) return;

    /* 系统开了「减弱动态效果」：不给它动，也不接点击 ——
       时间是停住的，这时点一下会僵在预备姿势里，不如索性不演 */
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handle = createCatMotion(host, {
      layout,
      frame: "thumb",
      poses: posesKey.split(","),
      slots,
      interactive: interactive && !still,
      /* 站点只管 bpm 这一个工艺参数（站点配置写的是「这几只按几拍走」）；
         其余动作参数留在引擎里，调用方要覆盖就通过 config 传 */
      config: { bpm: siteConfig.cats.bpm, ...config },
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
  }, [posesKey, interactive, layout, slotsKey]);

  /* 换外观：引擎只改色层 fill + 点缀色，几何不动 */
  useEffect(() => {
    handleRef.current?.setTheme(mode);
  }, [mode]);

  return (
    <div
      ref={hostRef}
      /* row：w-fit + mx-auto —— 一排猫整体居中，只占自己需要的宽度（不会把四只拉开）
         scene：铺满场景容器，具体站位由 CSS 的 .home-scene 一段决定。
                这里必须 pointer-events-none（否则这层会盖住吊牌的点击），
                再由 CSS 把 .cat 单独开回 auto —— 只有猫身上是可点的。 */
      className={`cat-motion select-none ${
        isScene ? "pointer-events-none absolute inset-0" : "flex w-fit mx-auto items-end"
      } ${className ?? ""}`}
      style={
        isScene
          ? undefined
          : ({
              "--cat-h": `${height}px`,
              "--cat-h-sm": `${heightMobile}px`,
            } as CSSProperties)
      }
      /* 纯装饰：点到只会跳一下，没有任何信息或功能是别处拿不到的 */
      aria-hidden="true"
    />
  );
}
