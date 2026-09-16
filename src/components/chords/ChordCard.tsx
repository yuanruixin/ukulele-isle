import type { ChordConfig } from "../../config/site.config";
import ChordDiagram from "./ChordDiagram";

interface Props {
  chord: ChordConfig;
  /** 是否是当前点亮的那一个 */
  active: boolean;
  /** 点亮每根弦之间的间隔（ms），与扫弦发声同一组数字 */
  revealStepMs: number;
  onPlay: (name: string) => void;
}

/** 单张和弦卡片：整体可点，点一下试听并把指法图点亮 */
export default function ChordCard({
  chord,
  active,
  revealStepMs,
  onPlay,
}: Props) {
  return (
    <button
      type="button"
      onClick={() => onPlay(chord.name)}
      aria-label={`试听 ${chord.name} 和弦`}
      aria-pressed={active}
      className="card flex flex-col items-center px-3 pt-4 pb-3 transition-transform duration-200 active:scale-[0.97] sm:px-4 sm:pt-5 sm:pb-4"
      // 选中态用 accent 描边标出来（box-shadow 不占布局，卡片不会因此跳动）
      style={
        active
          ? {
              boxShadow:
                "0 0 0 1.5px var(--accent), var(--shadow-card-hover)",
            }
          : undefined
      }
    >
      <span
        className="text-[17px] font-semibold tracking-tight transition-colors duration-200 sm:text-lg"
        style={{ color: active ? "var(--accent)" : "var(--text)" }}
      >
        {chord.name}
      </span>

      <div className="mt-2.5 w-full max-w-[132px] sm:mt-3.5">
        <ChordDiagram
          frets={chord.frets}
          fingers={chord.fingers}
          active={active}
          revealStepMs={revealStepMs}
        />
      </div>
    </button>
  );
}
