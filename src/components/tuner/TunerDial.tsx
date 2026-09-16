import { memo } from "react";
import { siteConfig } from "../../config/site.config";
import type { NoteInfo } from "../../lib/pitch";

/**
 * 音准状态色。
 * 注意：这三个符号不要加 export —— 组件文件里混着非组件导出会让 React Fast Refresh
 * 失效（改这个文件就整页重载、麦克风与读数状态全丢）。
 */
const TONE = {
  idle: "var(--text-secondary)",
  "in-tune": "#34c759",
  low: "#ff9f0a",
  high: "#ff9f0a",
} as const;

type ToneKey = keyof typeof TONE;

/** 刻度条左右留白：保证指针圆环不会越出容器（PC 上指针更大，同步放到 30px） */
const PAD_CLASS = "[--dial-pad:28px] lg:[--dial-pad:32px]";

/** 音分偏差 → 0..1 的横向位置 */
function centsToRatio(cents: number, range: number): number {
  const clamped = Math.max(-range, Math.min(range, cents));
  return (clamped + range) / (2 * range);
}

interface Props {
  /** 音名：已选弦时为目标弦音名，未选弦时为实测音名 */
  note: string | null;
  octave: number | null;
  /** 音分偏差；null = 暂未听到有效信号 */
  cents: number | null;
  listening: boolean;
  /** 是否已经选了要校的弦 */
  hasTarget: boolean;
  /** 已选弦、但听到的是另一个音 */
  mismatch?: NoteInfo | null;
}

/**
 * 调音指示盘：横向音分刻度 + 圆形指针 + 音名读数。
 * 指针偏左 = 音偏低（调高），偏右 = 音偏高（调低）。
 */
export default memo(function TunerDial({
  note,
  octave,
  cents,
  listening,
  hasTarget,
  mismatch = null,
}: Props) {
  const { rangeCents, toleranceCents } = siteConfig.tuner;
  const hasSignal = cents !== null;

  const tone: ToneKey = !hasSignal
    ? "idle"
    : Math.abs(cents) <= toleranceCents
      ? "in-tune"
      : cents < 0
        ? "low"
        : "high";

  const statusText = hasSignal
    ? tone === "in-tune"
      ? hasTarget
        ? "准了"
        : "音是准的"
      : hasTarget
        ? tone === "low"
          ? "调高"
          : "调低"
        : tone === "low"
          ? "音偏低"
          : "音偏高"
    : mismatch
      ? `听到 ${mismatch.name}${mismatch.octave}，不是这根弦`
      : listening
        ? hasTarget
          ? "聆听中…"
          : "拨一根弦"
        : hasTarget
          ? "等待开始"
          : "先点一根弦，或直接拨响";

  /** 音名字色：准了转绿，有信号用正文色，无信号用次要色 */
  const noteColor = !hasSignal
    ? "var(--text-secondary)"
    : tone === "in-tune"
      ? TONE["in-tune"]
      : "var(--text)";

  const ratio = centsToRatio(cents ?? 0, rangeCents);
  const left = `calc(var(--dial-pad) + (100% - var(--dial-pad) * 2) * ${ratio})`;

  // 刻度线：每 5 音分一条，每 10 音分加长，0 位最长
  const ticks: { left: string; height: number; zero: boolean; major: boolean }[] =
    [];
  for (let c = -rangeCents; c <= rangeCents; c += 5) {
    ticks.push({
      left: `calc(var(--dial-pad) + (100% - var(--dial-pad) * 2) * ${centsToRatio(c, rangeCents)})`,
      height: c === 0 ? 26 : c % 10 === 0 ? 16 : 9,
      zero: c === 0,
      major: c % 10 === 0,
    });
  }

  return (
    // --dial-scale / --dial-pad 按断点缩放刻度线与两侧留白（指针、音名用响应式类单独控）
    <div
      className={`flex flex-col items-center [--dial-scale:1] lg:[--dial-scale:1.9] ${PAD_CLASS}`}
    >
      {/* 音名：准了整体转绿，有信号为正文色，无信号为次要色 */}
      <div className="flex items-start gap-0.5 lg:gap-1">
        <span
          className="text-[34px] leading-none font-semibold tracking-tight transition-colors lg:text-[72px]"
          style={{ color: noteColor }}
        >
          {note ?? "–"}
        </span>
        {octave !== null && (
          <span
            className="mt-0.5 text-sm font-medium transition-colors lg:mt-1 lg:text-lg"
            style={{ color: noteColor }}
          >
            {octave}
          </span>
        )}
      </div>

      {/* 横向刻度 + 指针 */}
      <div className="relative mt-3 h-[64px] w-full lg:mt-6 lg:h-[148px]">
        {/* 基线 */}
        <div
          className="absolute top-1/2 right-0 left-0 h-px"
          style={{ background: "var(--tick)" }}
          aria-hidden
        />

        {/* 刻度 */}
        {ticks.map((t) => (
          <div
            key={t.left}
            className="absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2"
            style={{
              left: t.left,
              height: `calc(${t.height}px * var(--dial-scale))`,
              background: t.zero ? "var(--accent)" : "var(--tick)",
            }}
            aria-hidden
          />
        ))}

        {/* 左右端点：降号 / 升号 */}
        <span
          className="text-secondary absolute top-1/2 left-0 -translate-y-1/2 text-lg leading-none lg:text-2xl"
          aria-hidden
        >
          ♭
        </span>
        <span
          className="text-secondary absolute top-1/2 right-0 -translate-y-1/2 text-lg leading-none lg:text-2xl"
          aria-hidden
        >
          ♯
        </span>

        {/* 指针 */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-150 ease-out"
          style={{ left }}
        >
          <span
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] text-[13px] font-semibold tabular-nums transition-colors lg:h-[64px] lg:w-[64px] lg:text-[16px]"
            style={{
              borderColor: TONE[tone],
              background: "var(--card)",
              color: hasSignal ? TONE[tone] : "var(--text-secondary)",
              boxShadow: hasSignal
                ? `0 0 0 4px ${TONE[tone]}1f`
                : "0 1px 4px rgba(0, 0, 0, 0.06)",
            }}
          >
            {hasSignal ? Math.round(cents) : "–"}
          </span>
        </div>
      </div>

      {/* 状态提示 */}
      <span
        className="mt-1 text-xs font-medium transition-colors lg:mt-3 lg:text-base"
        style={{ color: TONE[tone] }}
      >
        {statusText}
      </span>
    </div>
  );
});
