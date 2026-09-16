import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { siteConfig } from "../config/site.config";
import { isVirtualInput, useTuner } from "../hooks/useTuner";
import TunerDial from "../components/tuner/TunerDial";
import StringPicker from "../components/tuner/StringPicker";
import AutoSwitch from "../components/tuner/AutoSwitch";
import TunerDiagnostics from "../components/tuner/TunerDiagnostics";

/**
 * 调音器页：两种模式互斥。
 * - 手动：点哪根弦就校哪根（默认不预选），未选弦时直接显示听到的音名与音准度。
 * - 自动：不用先选弦，弹哪根自动认哪根（连续若干帧一致才锁定，避免来回跳）。
 *
 * 版式：
 * - 移动端：单栏竖排——指示盘 / 琴头与选弦 / 麦克风开关。
 * - PC（≥1024px）：两栏——左栏「指示盘 + 麦克风开关」，右栏「琴头与选弦」。
 *   DOM 顺序保持移动端顺序，靠 grid 的列/行定位重排，避免渲染两套结构。
 *
 * 「信号诊断」面板默认不渲染，见 siteConfig.tuner.debug。
 */
export default function TunerPage() {
  const {
    strings,
    toleranceCents,
    instrument,
    tuningName,
    defaultStringId,
    defaultAuto,
    debug,
  } = siteConfig.tuner;

  const [activeId, setActiveId] = useState<string | null>(defaultStringId);
  const [auto, setAuto] = useState<boolean>(defaultAuto);

  /** 手动选中的弦 */
  const active = strings.find((s) => s.id === activeId) ?? null;
  /**
   * 已校准准了的弦 id。
   * 逐弦累积：某根弦被判定准了就点亮并**保持绿色**（否则琴弦余音一停绿色就消失，
   * 没法知道四根弦里哪些已经调好了、哪些还没）。
   * 之后再弹同一根弦明显不准时会熄灭，停止聆听则整轮清零。
   */
  const [tunedIds, setTunedIds] = useState<string[]>([]);

  // 候选弦：siteConfig 里是静态数组，这里缓存住引用，避免每帧同步 ref
  const candidates = useMemo(
    () => strings.map((s) => ({ id: s.id, freq: s.freq })),
    [strings],
  );

  const {
    status,
    error,
    reading,
    mismatch,
    autoStringId,
    device,
    log,
    permission,
    inputs,
    deviceId,
    selectDevice,
    telemetry,
    inTune,
    start,
    stop,
  } = useTuner({
    targetFreq: active?.freq ?? null,
    candidates,
    auto,
    toleranceCents,
  });

  // 调试模式：配置里打开，或用 ?debug=1 临时打开
  const { search } = useLocation();
  const debugMode = useMemo(
    () => debug || new URLSearchParams(search).has("debug"),
    [debug, search],
  );

  const listening = status === "listening";
  const starting = status === "starting";

  /** 自动模式下当前锁定的弦 */
  const autoTarget = auto
    ? (strings.find((s) => s.id === autoStringId) ?? null)
    : null;
  /** 当前真正在比对的目标弦（手动与自动互斥） */
  const target = auto ? autoTarget : active;

  const displayNote = target ? target.note : (reading?.note.name ?? null);
  const displayOctave = target ? target.octave : (reading?.note.octave ?? null);

  const currentId = target?.id ?? null;
  const readingActive = reading !== null;

  // 逐弦记录「已校准」：当前比对的那根弦判准了就点亮，之后弹不准就熄灭。
  // 余音衰减导致 reading 变 null 时不动状态，所以绿色会一直留着。
  useEffect(() => {
    if (!listening || currentId === null || !readingActive) return;
    setTunedIds((prev) => {
      const has = prev.includes(currentId);
      if (inTune && !has) return [...prev, currentId];
      if (!inTune && has) return prev.filter((id) => id !== currentId);
      return prev;
    });
  }, [inTune, currentId, listening, readingActive]);

  // 停止聆听 = 重新开始一轮校准
  useEffect(() => {
    if (!listening) setTunedIds([]);
  }, [listening]);

  /**
   * 选定目标弦 / 开自动时顺手把麦克风打开——省掉「先点弦、再点开启麦克风」两步。
   * start() 内部已按 statusRef 去重，这里再挡一层是为了不重复触发 setStatus。
   */
  const ensureListening = useCallback(() => {
    if (status === "listening" || status === "starting") return;
    void start();
  }, [start, status]);

  /** 开自动 = 取消手动选弦；点弦 = 退出自动。两种情况都要确保麦克风已开 */
  const handleAuto = useCallback(
    (on: boolean) => {
      setAuto(on);
      if (on) {
        setActiveId(null);
        ensureListening();
      }
    },
    [ensureListening],
  );

  const handlePick = useCallback(
    (id: string | null) => {
      if (auto) setAuto(false);
      setActiveId(id);
      // 取消选择（id === null）不需要麦克风
      if (id !== null) ensureListening();
    },
    [auto, ensureListening],
  );

  const caption = auto
    ? autoTarget
      ? `自动识别 · ${autoTarget.note} · ${autoTarget.label}`
      : listening
        ? "自动识别中 · 弹响任意一根弦"
        : "自动识别已开启，先开启麦克风"
    : activeId
      ? `${target?.note ?? ""} · ${target?.label ?? ""} · 再点一次取消`
      : "点一根弦开始校准";

  const virtualInput = isVirtualInput(device?.label);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-6 md:max-w-lg lg:max-w-5xl lg:px-8 lg:pb-10">
      {/* 标题 */}
      <header className="py-3 text-center lg:py-6">
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
          调音器
        </h1>
        <p className="text-secondary mt-1 text-xs lg:text-sm">
          {instrument} · {tuningName}调弦 GCEA
        </p>
      </header>

      {/*
        移动端：单栏竖排——指示盘 → 琴头 → 麦克风开关
        PC：两栏——左栏「指示盘 + 麦克风开关」（整列撑满、按钮贴底），右栏「琴头卡片」
        左栏容器在移动端用 display:contents 打散，子元素直接参与外层 flex 排序，
        这样只需要一套 DOM 结构就能同时满足两种版式的顺序要求。
      */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-stretch lg:gap-6">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {/* 指示盘 */}
          <section className="card order-1 flex flex-1 flex-col justify-center px-5 py-5 lg:order-none lg:px-8 lg:py-8">
            <TunerDial
              note={displayNote}
              octave={displayOctave}
              cents={reading?.cents ?? null}
              listening={listening}
              hasTarget={target !== null}
              mismatch={mismatch}
            />
          </section>

          {/* 麦克风开关 */}
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={starting}
            className="order-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.99] disabled:opacity-60 lg:order-none lg:shrink-0 lg:py-3.5 lg:text-base"
            style={{
              background: listening ? "var(--text-secondary)" : "var(--accent)",
            }}
          >
            {listening && (
              <span
                className="pulse-dot h-2 w-2 rounded-full bg-white"
                aria-hidden
              />
            )}
            {starting
              ? "正在开启…"
              : listening
                ? "正在聆听 · 点击停止"
                : "开启麦克风"}
          </button>
        </div>

        {/* 琴头 + 弦选择 + 自动开关 */}
        <section className="card order-2 flex flex-col px-5 pt-4 pb-4 lg:order-none lg:px-8 lg:pt-6 lg:pb-6">
          {/*
            开关组整体靠右，与卡片右内边距对齐。
            不再在标题旁挂「手动选弦 / 弹哪根认哪根」的解释——开关本身就是自解释的，
            当前处于哪种模式由下方提示行（caption）按实际状态回答，比一个静态标签更有用。
          */}
          <div className="mb-1 flex items-center justify-end gap-2 lg:mb-2 lg:gap-3">
            <span className="text-[13px] font-medium lg:text-sm">自动识别</span>
            <AutoSwitch on={auto} onChange={handleAuto} />
          </div>

          <div className="flex flex-1 items-center justify-center">
            <StringPicker
              strings={strings}
              activeId={activeId}
              autoId={autoStringId}
              auto={auto}
              tunedIds={tunedIds}
              listening={listening}
              onChange={handlePick}
            />
          </div>

          <p className="text-secondary mt-2 text-center text-[11px] lg:mt-3 lg:text-xs">
            {caption}
          </p>
        </section>
      </div>

      {/* 异常提示 */}
      <div className="mt-2 space-y-1 lg:mt-4">
        {virtualInput ? (
          <p
            className="text-center text-xs leading-relaxed"
            style={{ color: "#b45309" }}
          >
            当前输入是<strong>虚拟音频设备</strong>（{device?.label}），它收不到真实声音。
            请在系统「声音 → 输入」里选择你的麦克风后重试。
          </p>
        ) : null}

        {error ? (
          <p className="text-center text-xs" style={{ color: "#ff3b30" }}>
            {error}
          </p>
        ) : permission === "denied" ? (
          <p className="text-center text-xs" style={{ color: "#ff3b30" }}>
            浏览器已拒绝麦克风权限，请在地址栏的权限设置里允许后重试
          </p>
        ) : null}
      </div>

      {/* 信号诊断：仅调试模式渲染（siteConfig.tuner.debug 或 ?debug=1） */}
      {debugMode && (
        <div className="mt-3 lg:mt-6">
          <TunerDiagnostics
            status={status}
            device={device}
            permission={permission}
            inputs={inputs}
            deviceId={deviceId}
            onSelectDevice={selectDevice}
            telemetry={telemetry}
            log={log}
          />
        </div>
      )}
    </main>
  );
}
