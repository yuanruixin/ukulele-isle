import { memo } from "react";

interface Props {
  /** 是否开启 */
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}

/** iOS 风格的滑动开关（51×31，滑块 27px，行程 20px） */
function AutoSwitch({ on, disabled, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="自动识别弦"
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

export default memo(AutoSwitch);
