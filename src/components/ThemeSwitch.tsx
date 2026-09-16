import { memo } from "react";
import { useThemeStore } from "../store/themeStore";

/** 太阳（亮色）：细线描边，与月亮同一套笔触 */
function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.6" />
      <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6" />
    </svg>
  );
}

/** 月牙（暗色） */
function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

/** 滑块内的图标：两个叠在滑块正中，按当前模式交叉旋转淡入淡出——同一时刻只看得见一个 */
function KnobIcon({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <span
      className="theme-switch-icon absolute"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.4)",
      }}
    >
      {children}
    </span>
  );
}

interface Props {
  /** 无障碍名称 */
  label?: string;
}

/**
 * 亮 / 暗外观开关：
 * 浅灰轨道 + 一个浮起的圆形滑块，滑块里只显示「当前模式」的那枚图标（暗色月亮 / 亮色太阳）。
 */
function ThemeSwitch({ label = "切换外观" }: Props) {
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const dark = mode === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={label}
      title={dark ? "切换到浅色" : "切换到深色"}
      onClick={toggle}
      className="theme-switch relative inline-flex shrink-0"
    >
      <span
        className="theme-switch-knob absolute top-[3px] left-[3px] flex items-center justify-center"
        style={{ transform: dark ? "translateX(20px)" : "translateX(0px)" }}
      >
        <KnobIcon show={!dark}>
          <SunIcon />
        </KnobIcon>
        <KnobIcon show={dark}>
          <MoonIcon />
        </KnobIcon>
      </span>
    </button>
  );
}

export default memo(ThemeSwitch);
