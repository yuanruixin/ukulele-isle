import { useEffect, useRef } from "react";
import type { UkeStringConfig } from "../../config/site.config";
import type { RecordedNote } from "../../hooks/useUkuleleRecording";

/**
 * 录制 / 回放条。
 *
 * 「标记」这项需求落在录制回放上：录下来的每个音在下方排成一条小谱（
 * 左边是弦的空弦音名、中间是品位数字，读法与 TAB 谱一致），回放时当前那个
 * 音会被点亮并自动滚到可见处——所以回放不只是「听见」，是看得见的一次重演。
 */

interface Props {
  /** 高音弦在前（下标 0 = 1 弦 A） */
  strings: UkeStringConfig[];
  recording: boolean;
  playing: boolean;
  playingIndex: number | null;
  notes: RecordedNote[];
  durationMs: number;
  maxNotes: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPlay: () => void;
  onClear: () => void;
  /** 紧凑模式（移动端一屏展示）：按钮、读法条都缩一号，并省掉下面那段说明 */
  compact?: boolean;
}

/** 录音按钮：空闲是描边 + 红点，录制中是红底 + 呼吸点 */
function RecordButton({
  recording,
  onClick,
  compact,
}: {
  recording: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={recording}
      className={`flex ${compact ? "h-9 text-[13px]" : "h-11 text-[15px]"} flex-1 items-center justify-center gap-2 rounded-full font-semibold transition-transform duration-200 active:scale-[0.98]`}
      style={
        recording
          ? { background: "#ff3b30", color: "#fff" }
          : {
              background: "transparent",
              color: "#ff3b30",
              boxShadow: "inset 0 0 0 1.5px rgba(255, 59, 48, 0.45)",
            }
      }
    >
      <span
        className={`${recording ? "pulse-dot" : ""} ${compact ? "h-2 w-2" : "h-2.5 w-2.5"} rounded-full`}
        style={recording ? { background: "#fff" } : { background: "#ff3b30" }}
        aria-hidden
      />
      {recording ? "停止录制" : "录制"}
    </button>
  );
}

export default function RecorderBar({
  strings,
  recording,
  playing,
  playingIndex,
  notes,
  durationMs,
  maxNotes,
  onStartRecording,
  onStopRecording,
  onPlay,
  onClear,
  compact = false,
}: Props) {
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 回放到哪个音就把它滚进视野（只动横向，不带着整页跳）
  useEffect(() => {
    if (playingIndex === null) return;
    chipRefs.current[playingIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [playingIndex]);

  const status = recording
    ? `录制中 · 已录 ${notes.length} 个音`
    : playing
      ? `回放中 · ${(playingIndex ?? 0) + 1} / ${notes.length}`
      : notes.length > 0
        ? `${notes.length} 个音 · ${(durationMs / 1000).toFixed(1)} 秒`
        : "按「录制」，弹一段试试";

  return (
    <section className={compact ? "card px-4 py-3" : "card px-5 py-4 sm:px-6 sm:py-5"}>
      <div className="flex items-baseline justify-between gap-4">
        <h2
          className={`font-semibold tracking-tight ${compact ? "text-[13px]" : "text-[15px] sm:text-base"}`}
        >
          录下这一段
        </h2>
        <span className="text-secondary text-[11px] sm:text-xs">{status}</span>
      </div>

      <div className={`flex items-center ${compact ? "mt-2 gap-2" : "mt-3 gap-2.5 sm:gap-3"}`}>
        <RecordButton
          recording={recording}
          onClick={recording ? onStopRecording : onStartRecording}
          compact={compact}
        />

        <button
          type="button"
          onClick={onPlay}
          disabled={notes.length === 0}
          className={`flex ${compact ? "h-9 text-[13px]" : "h-11 text-[15px]"} flex-1 items-center justify-center gap-2 rounded-full font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-40`}
          style={{ background: "var(--accent)" }}
        >
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <rect width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 1.2 10.4 6 2 10.8Z" fill="currentColor" />
            </svg>
          )}
          {playing ? "停止" : "回放"}
        </button>

        {notes.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className={`text-secondary ${compact ? "h-9 text-[13px]" : "h-11 text-[15px]"} shrink-0 rounded-full px-3 transition-colors duration-200 hover:opacity-70`}
          >
            清除
          </button>
        )}
      </div>

      {notes.length > 0 && (
        <div
          className={`-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 ${compact ? "mt-2" : "mt-3"}`}
        >
          {notes.map((n, i) => {
            const on = playingIndex === i;
            return (
              <div
                key={i}
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                className={`flex shrink-0 flex-col items-center justify-center rounded-xl transition-colors duration-150 ${
                  compact ? "h-9 w-8" : "h-11 w-9"
                }`}
                style={{
                  background: on ? "var(--accent)" : "var(--board-head)",
                  color: on ? "#fff" : "var(--text)",
                }}
              >
                <span
                  className={`font-semibold leading-none ${compact ? "text-[12px]" : "text-[13px]"}`}
                >
                  {n.fret === 0 ? "0" : n.fret}
                </span>
                <span
                  className={`text-[9px] leading-none ${compact ? "" : "mt-0.5"}`}
                  style={{ opacity: on ? 0.85 : 0.6 }}
                >
                  {strings[n.stringIndex]?.note ?? "?"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 说明只在宽松版式里出现——移动端一屏展示时这段文字要把指板往下挤 */}
      {notes.length > 0 && !compact && (
        <p className="text-secondary mt-2 text-[11px]">
          竖排读法与 TAB 一样：上面是品位，下面是弦（{strings.map((s) => s.note).join(" ")}）。
          {notes.length >= maxNotes && " 已录满，再录会从头开始。"}
        </p>
      )}
    </section>
  );
}
