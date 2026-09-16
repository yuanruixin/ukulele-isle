import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { siteConfig } from "../config/site.config";
import { noteAt } from "../lib/ukulele";
import { keyRowBindings } from "../lib/ukeKeys";
import { useUkulelePlayer } from "../hooks/useUkulelePlayer";
import { useUkuleleRecording } from "../hooks/useUkuleleRecording";
import Fretboard, { type PluckEvent } from "../components/uke/Fretboard";
import RecorderBar from "../components/uke/RecorderBar";

/**
 * 虚拟尤克里里：点指板出声，也能用键盘弹，能录能回放。
 *
 * 数据流（只有一条通路，所以「看到的」和「听到的」不可能走岔）：
 *   点格子 / 按键 / 回放 → emit() → ①发声（useUkulelePlayer）②起一次弦晃动
 *                                  ③更新读数 ④录制中顺便记一笔
 *
 * 版式：
 *   - **窄屏（<640px，手机竖屏）**：指板竖置（琴枕在上、弦左右排开），整页锁在一屏内
 *     不滚动——高度是稀缺资源，所以指板按剩余高度撑满、标题与录制条都缩到最小。
 *   - **宽屏**：指板横置（琴枕在左），沿用宽松、可滚动的版式。
 *
 * 弦的堆叠顺序（横置的上下 = 竖置的左右）由 ★ `uke.stringOrder` 一个开关管，
 * 键位行与弦的对应关系会跟着一起翻——不要在这页里写死任何「第几弦在哪一侧」。
 *
 * 页面本身不导入 alphaTab（由 useUkulelePlayer 动态 import），
 * 首屏只有一张自绘指板，4MB 上下的音色是在后台空闲时才去取的。
 */

/**
 * 吸顶导航栏的实际高度。它是 `h-14`（56px）**再加 0.5px 下描边**，量出来是 57
 * ——一屏布局差 1px 就会冒出滚动条，所以这里量一次真实值，不把 57 写死。
 */
function navHeight(): number {
  return document.querySelector("header")?.getBoundingClientRect().height ?? 57;
}

/** 窄屏（<640px）：指板竖置 + 只显示前几品，格子才够大点得准 */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export default function UkulelePage() {
  const {
    volume,
    instrument,
    fx,
    frets,
    fretsMobile,
    rowGap,
    rowGapMobile,
    ringSeconds,
    wobbleAmplitude,
    wobbleHz,
    maxRecordNotes,
    replayTailMs,
    tuning,
    stringOrder,
    strings,
  } = siteConfig.uke;

  const narrow = useIsNarrow();
  /** 一屏布局要减掉的导航栏高度（首帧先按 57 估，挂载后量真实值） */
  const [navH, setNavH] = useState(navHeight);
  useEffect(() => {
    const id = requestAnimationFrame(() => setNavH(navHeight()));
    return () => cancelAnimationFrame(id);
  }, []);
  /** 手机竖屏 → 指板竖置（琴枕在上），同时少显示几品 */
  const orientation = narrow ? "vertical" : "horizontal";
  const viewFrets = narrow ? Math.min(fretsMobile, frets) : frets;

  const { status, error, pluck } = useUkulelePlayer({
    // 谱面数据始终按完整音域生成，窄屏只是「少显示几品」
    frets,
    stringCount: strings.length,
    tuning,
    instrument,
    ringSeconds,
    volume,
    fx,
  });

  /** 每根弦当前按住的位置（null = 还没弹过，不画按弦点） */
  const [held, setHeld] = useState<(number | null)[]>(() =>
    strings.map(() => null),
  );
  /** 最近弹出的那个音（读数区） */
  const [last, setLast] = useState<{ s: number; f: number } | null>(null);
  /** 拨弦事件：id 变化 → 指板起一次晃动 + 扩散圈 */
  const [pluckEvent, setPluckEvent] = useState<PluckEvent | null>(null);
  const playingRef = useRef(false);

  /** 只负责「发声 + 视觉 + 读数」，不含录制判定（回放也走这里） */
  const emit = useCallback(
    (s: number, f: number) => {
      pluck(s, f);
      setHeld((prev) => {
        const next = [...prev];
        next[s] = f;
        return next;
      });
      setLast({ s, f });
      setPluckEvent((prev) => ({
        id: (prev?.id ?? 0) + 1,
        stringIndex: s,
        fret: f,
      }));
    },
    [pluck],
  );

  const {
    recording,
    notes,
    durationMs,
    playing,
    playingIndex,
    startRecording,
    stopRecording,
    record,
    play,
    stopPlayback,
    clear,
  } = useUkuleleRecording({
    maxNotes: maxRecordNotes,
    tailMs: replayTailMs,
    onPlay: (n) => emit(n.stringIndex, n.fret),
  });

  playingRef.current = playing;
  // record 内部会挡掉「不在录制中」和「回放中」两种情况，这里只管转发
  const recordRef = useRef(record);
  recordRef.current = record;

  /** 手动点指板 / 按键：会打断回放，录制中则顺手记一笔 */
  const handlePluck = useCallback(
    (s: number, f: number) => {
      if (playingRef.current) stopPlayback();
      recordRef.current(s, f);
      emit(s, f);
    },
    [emit, stopPlayback],
  );

  // 换了指板显示范围 / 朝向 / 弦序就把按弦状态清掉——不然会残留对不上位置的按弦点
  useEffect(() => {
    setHeld(strings.map(() => null));
  }, [viewFrets, orientation, stringOrder, strings]);

  const current = useMemo(
    () => (last ? noteAt(strings[last.s], last.f) : null),
    [last, strings],
  );

  const caption =
    status === "preparing"
      ? "正在准备音色…（现在点也行，就绪后会自动补响）"
      : narrow
        ? "点格子出声 · 按弦位置会留在指板上"
        : "点格子出声 · 每根弦的按弦位置会留在指板上";

  /** 键盘图例：从键位表 + 弦序反推文案，改键位表或翻弦序都会自动跟着变 */
  const keyRows = useMemo(
    () => keyRowBindings(stringOrder, strings.length),
    [stringOrder, strings.length],
  );
  const keyLegend = keyRows
    .map((r) => `${r.rowLabel}＝${strings[r.stringIndex].id} 弦`)
    .join(" · ");
  /** 键少的那几行够不到最高几品，明说比让人按不出来再猜好 */
  const shortRows = keyRows
    .filter((r) => r.maxFret < viewFrets)
    .map((r) => `${r.rowLabel}（${strings[r.stringIndex].id} 弦）到 ${r.maxFret} 品`);

  return (
    <main
      className={
        narrow
          ? // 一屏展示：整页高度 = 视口 − 导航栏，内部用 flex 把剩余高度全给指板
            "flex flex-col overflow-hidden px-4 pb-3"
          : "mx-auto flex w-full max-w-md flex-col px-5 pb-16 md:max-w-2xl lg:max-w-4xl lg:px-8"
      }
      style={narrow ? { height: `calc(100dvh - ${navH}px)` } : undefined}
    >
      <header
        className={narrow ? "shrink-0 pt-3 pb-2" : "py-7 sm:py-9"}
      >
        <div className="text-center">
          <h1
            className={
              narrow
                ? "text-lg font-semibold tracking-tight"
                : "text-2xl font-semibold tracking-tight sm:text-3xl"
            }
          >
            虚拟尤克里里
          </h1>
          <p
            className={
              narrow
                ? "text-secondary mt-0.5 text-[11px]"
                : "text-secondary mt-1 text-xs sm:text-sm"
            }
          >
            {siteConfig.tuner.instrument} · 标准调弦 GCEA
          </p>
        </div>
      </header>

      <section
        className={
          narrow
            ? "card flex min-h-0 flex-1 flex-col px-3 py-3"
            : "card px-4 py-4 sm:px-6 sm:py-6"
        }
      >
        {/* 读数：左边是这个音，右边是它在哪根弦的哪一品 */}
        <div
          className={
            narrow
              ? "mb-1.5 flex shrink-0 items-end justify-between gap-3"
              : "mb-3 flex items-end justify-between gap-4 sm:mb-4"
          }
        >
          <div className="flex items-baseline gap-0.5">
            <span
              className={
                narrow
                  ? "font-semibold leading-none tracking-tight tabular-nums"
                  : "text-[34px] font-semibold leading-none tracking-tight tabular-nums sm:text-[40px]"
              }
              style={{
                fontSize: narrow ? 28 : undefined,
                color: current ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {current ? current.name : "—"}
            </span>
            <span
              className={
                narrow
                  ? "text-base font-medium leading-none"
                  : "text-lg font-medium leading-none sm:text-xl"
              }
              style={{
                color: current ? "var(--accent)" : "var(--text-secondary)",
                opacity: 0.7,
              }}
            >
              {current ? current.octave : ""}
            </span>
          </div>

          <div className="text-right">
            {last ? (
              <>
                <p className="font-medium leading-tight text-[12px] sm:text-sm">
                  {strings[last.s].label} ·{" "}
                  {last.f === 0 ? "空弦" : `第 ${last.f} 品`}
                </p>
                <p className="text-secondary text-[10px] leading-tight sm:text-xs">
                  {current ? `${current.freq.toFixed(1)} Hz` : ""}
                </p>
              </>
            ) : (
              <p className="text-secondary text-[10px] leading-tight sm:text-xs">
                点指板上的任意一格
              </p>
            )}
          </div>
        </div>

        {/* 指板：窄屏 flex-1 吃掉剩余高度（竖置的 svg 按高度撑满），宽屏就是普通流式摆放 */}
        <div
          className={
            narrow
              ? "flex min-h-0 flex-1 items-center justify-center"
              : undefined
          }
        >
          <Fretboard
            strings={strings}
            frets={viewFrets}
            orientation={orientation}
            stringOrder={stringOrder}
            held={held}
            pluck={pluckEvent}
            onPluck={handlePluck}
            wobbleAmplitude={wobbleAmplitude}
            wobbleHz={wobbleHz}
            ringSeconds={ringSeconds}
            rowGap={narrow ? rowGapMobile : rowGap}
            compact={narrow}
          />
        </div>

        {error ? (
          <p
            className="mt-2 shrink-0 text-center text-[11px] leading-relaxed"
            style={{ color: "#ff3b30" }}
          >
            {error}
          </p>
        ) : (
          <p
            className={
              narrow
                ? "text-secondary mt-1 shrink-0 text-center text-[10px] leading-relaxed"
                : "text-secondary mt-3 text-center text-[11px] leading-relaxed sm:text-xs"
            }
          >
            {caption}
          </p>
        )}
      </section>

      <div className={narrow ? "mt-2 shrink-0" : "mt-4"}>
        <RecorderBar
          strings={strings}
          recording={recording}
          playing={playing}
          playingIndex={playingIndex}
          notes={notes}
          durationMs={durationMs}
          maxNotes={maxRecordNotes}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onPlay={play}
          onClear={clear}
          compact={narrow}
        />
      </div>

      {/* 键盘图例：只有带实体键盘的宽屏才显示 */}
      {!narrow && (
        <p className="text-secondary mt-3 text-center text-[11px] leading-relaxed">
          键盘：{keyLegend}，每行最左是空弦、往右数就是品位。
          {shortRows.length > 0 && (
            <>
              {" "}
              {shortRows.join("、")}
              ，再往上请用鼠标点。
            </>
          )}{" "}
          Esc 取消高亮。
        </p>
      )}
    </main>
  );
}
