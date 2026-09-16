import { useState } from "react";
import { siteConfig } from "../config/site.config";
import { useTuner } from "../hooks/useTuner";
import TunerDial from "../components/tuner/TunerDial";
import StringPicker from "../components/tuner/StringPicker";
import TunerDiagnostics from "../components/tuner/TunerDiagnostics";

/**
 * 调音器页：手动模式（点哪根弦校哪根，默认不预选）。
 * 未选弦时直接显示听到的音名与该音准度，选弦后转为该弦的调高/调低指示。
 * 页面底部带信号诊断面板，实时显示采集 → 检测 → 判定的每一步。
 */
export default function TunerPage() {
  const { strings, toleranceCents, instrument, tuningName, defaultStringId } =
    siteConfig.tuner;

  const [activeId, setActiveId] = useState<string | null>(defaultStringId);
  const active = strings.find((s) => s.id === activeId) ?? null;

  const {
    status,
    error,
    reading,
    mismatch,
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
    toleranceCents,
  });

  const listening = status === "listening";
  const starting = status === "starting";

  // 未选弦时读数是实测音名；选弦后固定显示目标弦音名
  const displayNote = active ? active.note : (reading?.note.name ?? null);
  const displayOctave = active ? active.octave : (reading?.note.octave ?? null);

  return (
    <main className="mx-auto flex max-w-4xl flex-col px-5 pb-4">
      <section className="py-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">调音器</h1>
        <p className="text-secondary mt-0.5 text-xs">
          {instrument} · {tuningName}调弦 GCEA
        </p>
      </section>

      <div className="mx-auto flex w-full max-w-md flex-col gap-2">
        {/* 指示盘 */}
        <section className="card px-4 py-3">
          <TunerDial
            note={displayNote}
            octave={displayOctave}
            cents={reading?.cents ?? null}
            listening={listening}
            hasTarget={active !== null}
            mismatch={mismatch}
          />
        </section>

        {/* 琴头 + 弦选择 */}
        <section className="card px-4 pt-3 pb-2.5">
          <StringPicker
            strings={strings}
            activeId={activeId}
            listening={listening}
            inTune={inTune}
            onChange={setActiveId}
          />
          <p className="text-secondary mt-2 text-center text-[11px]">
            {active
              ? `${active.note} · ${active.label} · 再点一次取消`
              : "点一根弦开始校准"}
          </p>
        </section>

        {/* 麦克风开关 */}
        <button
          type="button"
          onClick={listening ? stop : start}
          disabled={starting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.99] disabled:opacity-60"
          style={{
            background: listening ? "var(--text-secondary)" : "var(--accent)",
          }}
        >
          {listening && (
            <span className="pulse-dot h-2 w-2 rounded-full bg-white" aria-hidden />
          )}
          {starting ? "正在开启…" : listening ? "正在聆听 · 点击停止" : "开启麦克风"}
        </button>

        {error ? (
          <p className="text-center text-xs" style={{ color: "#ff3b30" }}>
            {error}
          </p>
        ) : permission === "denied" ? (
          <p className="text-center text-xs" style={{ color: "#ff3b30" }}>
            浏览器已拒绝麦克风权限，请在地址栏的权限设置里允许后重试
          </p>
        ) : null}

        {/* 信号诊断 */}
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
    </main>
  );
}
