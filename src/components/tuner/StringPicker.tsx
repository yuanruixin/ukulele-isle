import { memo } from "react";
import type { TunerStringConfig } from "../../config/site.config";

/**
 * 按钮落点：与素材图上四个内侧弦钮的垂直中心对齐（相对图片高度）。
 * 上排弦钮在 17% 处、下排弦钮在 40% 处，再上移半个按钮高度（22px）使其居中。
 */
const SLOT_Y = ["calc(17% - 22px)", "calc(40% - 22px)"];

/** 选中光环：准了用绿色，否则用主题蓝 */
const GLOW = {
  "in-tune": "rgba(52, 199, 89, 0.22)",
  active: "rgba(0, 113, 227, 0.20)",
};

interface Props {
  strings: TunerStringConfig[];
  /** 手动选中的弦；null = 未选（默认状态，所有按钮均不高亮） */
  activeId: string | null;
  /** 自动识别锁定的弦；null = 未开启自动 / 还没认出来 */
  autoId: string | null;
  /** 是否处于自动模式（此时按钮仍可点，点了即退出自动并改手动选弦） */
  auto: boolean;
  /** 本轮已校准准了的弦 id —— 会一直保持绿色，直到停止聆听或又被弹跑调 */
  tunedIds: string[];
  listening: boolean;
  /** 再次点击已选中的弦可取消选择 */
  onChange: (id: string | null) => void;
}

function StringButton({
  s,
  active,
  autoHit,
  tuned,
  listening,
  onChange,
}: {
  s: TunerStringConfig;
  active: boolean;
  autoHit: boolean;
  tuned: boolean;
  listening: boolean;
  onChange: (id: string | null) => void;
}) {
  /** 当前正在比对的那根弦（手动选中或自动锁定） */
  const current = active || autoHit;
  /** 已校准：绿色填满并保持 */
  const green = tuned && listening;

  return (
    <button
      type="button"
      onClick={() => onChange(active ? null : s.id)}
      aria-pressed={current}
      aria-label={`${s.note} 音（${s.label}）${autoHit ? "，自动识别中" : ""}${
        green ? "，已校准" : ""
      }`}
      title={`${s.note} · ${s.label}${
        autoHit ? "（自动识别）" : active ? "（再点一次取消）" : ""
      }${green ? " · 已校准" : ""}`}
      className="relative flex h-[44px] w-[44px] items-center justify-center rounded-full text-[16px] font-semibold transition-all duration-200 active:scale-95"
      style={{
        background: green || current ? (green ? "#34c759" : "var(--accent)") : "var(--bg)",
        color: green || current ? "#ffffff" : "var(--text)",
        // 光环只留给「当前正在比对」的那根，已校准但不在比对的用普通投影
        boxShadow: current
          ? `0 0 0 4px ${green ? GLOW["in-tune"] : GLOW.active}, 0 6px 16px rgba(0, 0, 0, 0.12)`
          : green
            ? "0 6px 16px rgba(0, 0, 0, 0.12)"
            : "inset 0 0 0 0.5px var(--border)",
      }}
    >
      {s.note}
      {autoHit && (
        <span
          className="halo-ring pointer-events-none absolute"
          style={{ borderColor: green ? "#34c759" : "var(--accent)" }}
          aria-hidden
        />
      )}
    </button>
  );
}

/** 琴头 + 四根弦的选择按钮：默认都不高亮，点哪根弦就校哪根 */
function StringPicker({
  strings,
  activeId,
  autoId,
  auto,
  tunedIds,
  listening,
  onChange,
}: Props) {
  const column = (side: "left" | "right") =>
    strings
      .filter((s) => s.side === side)
      .slice(0, 2)
      .map((s, i) => (
        <div
          key={s.id}
          className="absolute"
          style={{
            top: SLOT_Y[i] ?? SLOT_Y[0],
            ...(side === "left"
              ? { right: "calc(100% + 6px)" }
              : { left: "calc(100% + 6px)" }),
          }}
        >
          <StringButton
            s={s}
            active={s.id === activeId}
            autoHit={auto && s.id === autoId}
            tuned={tunedIds.includes(s.id)}
            listening={listening}
            onChange={onChange}
          />
        </div>
      ));

  // 宽度按断点给：移动端跟视口宽走，PC 两栏布局里给到 200px。
  // 下限有硬约束——两排弦钮（44px）的间隙 = 0.23 × 图高 − 44px，图太小按钮会贴在一起。
  return (
    <div className="relative mx-auto w-[min(146px,37vw)] sm:w-[170px] lg:w-[184px]">
      <img
        src={`${import.meta.env.BASE_URL}images/ukulele-headstock.png`}
        alt="尤克里里琴头"
        draggable={false}
        className="w-full select-none"
        style={{ filter: "drop-shadow(0 12px 26px rgba(0, 0, 0, 0.18))" }}
      />
      {column("left")}
      {column("right")}
    </div>
  );
}

// 遥测每帧都会让页面重渲染，这里挡住与实时数据无关的重绘
export default memo(StringPicker);
