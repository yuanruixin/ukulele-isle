import { memo } from "react";
import type { TunerStringConfig } from "../../config/site.config";

/**
 * 按钮落点：与素材图上四个内侧弦钮的垂直中心对齐（相对图片高度）。
 * 上排弦钮在 17% 处、下排弦钮在 40% 处，再上移半个按钮高度使其居中。
 */
const SLOT_Y = ["calc(17% - 23px)", "calc(40% - 23px)"];

/** 选中光环：准了用绿色，否则用主题蓝 */
const GLOW = { "in-tune": "rgba(52, 199, 89, 0.22)", active: "rgba(0, 113, 227, 0.20)" };

interface Props {
  strings: TunerStringConfig[];
  /** 当前选中的弦；null = 未选（默认状态，所有按钮均不高亮） */
  activeId: string | null;
  listening: boolean;
  inTune: boolean;
  /** 再次点击已选中的弦可取消选择 */
  onChange: (id: string | null) => void;
}

function StringButton({
  s,
  active,
  inTune,
  listening,
  onChange,
}: {
  s: TunerStringConfig;
  active: boolean;
  inTune: boolean;
  listening: boolean;
  onChange: (id: string | null) => void;
}) {
  const done = active && inTune && listening;
  const fill = done ? "#34c759" : "var(--accent)";

  return (
    <button
      type="button"
      onClick={() => onChange(active ? null : s.id)}
      aria-pressed={active}
      aria-label={`${s.note} 音（${s.label}）`}
      title={`${s.note} · ${s.label}${active ? "（再点一次取消）" : ""}`}
      className="flex h-[46px] w-[46px] items-center justify-center rounded-full text-[17px] font-semibold transition-all duration-200 active:scale-95"
      style={{
        background: active ? fill : "var(--bg)",
        color: active ? "#ffffff" : "var(--text)",
        boxShadow: active
          ? `0 0 0 4px ${done ? GLOW["in-tune"] : GLOW.active}, 0 6px 16px rgba(0, 0, 0, 0.12)`
          : "inset 0 0 0 0.5px var(--border)",
      }}
    >
      {s.note}
    </button>
  );
}

/** 琴头 + 四根弦的选择按钮：默认都不高亮，点哪根弦就校哪根 */
function StringPicker({
  strings,
  activeId,
  listening,
  inTune,
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
            inTune={inTune}
            listening={listening}
            onChange={onChange}
          />
        </div>
      ));

  return (
    <div className="relative mx-auto w-[min(138px,35vw)] sm:w-[176px]">
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
