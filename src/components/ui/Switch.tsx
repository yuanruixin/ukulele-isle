import { memo } from "react";

/**
 * iOS 风格的滑动开关（51×31，滑块 27px，行程 20px）。
 *
 * 站点里目前**只有一处**用到它——调音器的「自动识别」。
 * （播放器的「音色润色」开关已经撤掉了：润色改为只由 `site.config.ts` 里的 fx 配置决定，
 *   页面上不放开关。以后再有第二个开关，也走这里，两处永远长得一样。）
 *
 * 视觉细节（沿用原设计，别随手改）：
 * - 轨道不画实边框，滑块与图标才能落在整数像素上；
 * - 滑块用两层阴影浮起来（大而软的一层 + 1px 硬边），像真的凸出来一颗；
 * - 开关只负责「开关」，旁边的文字标签由调用方摆——有的地方在左、有的地方在上。
 */

interface Props {
  /** 是否开启 */
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  /** 无障碍名称（读屏 / 鼠标悬停提示用），不显示在界面上 */
  label: string;
}

function Switch({ on, disabled, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50"
      style={{ background: on ? "#34c759" : "var(--switch-off)" }}
    >
      <span
        className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 ease-out"
        style={{
          transform: on ? "translateX(20px)" : "translateX(0)",
          boxShadow:
            "0 3px 8px rgba(0, 0, 0, 0.15), 0 1px 1px rgba(0, 0, 0, 0.16)",
        }}
      />
    </button>
  );
}

export default memo(Switch);
