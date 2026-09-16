import { useCallback, useEffect, useRef, useState } from "react";
import {
  centsBetween,
  detectPitch,
  foldToTarget,
  freqToNote,
  type NoteInfo,
} from "../lib/pitch";

export type TunerStatus = "idle" | "starting" | "listening" | "error";

export interface TunerReading {
  /** 实测基频（Hz） */
  freq: number;
  /**
   * 音分偏差：
   * - 手动选弦 → 相对所选弦（八度折叠后）的偏差
   * - 自动模式 → 相对自动识别出的那根弦（八度折叠后）的偏差
   * - 两者皆无 → 相对最近十二平均律音高的偏差
   */
  cents: number;
  /** 实测音名 */
  note: NoteInfo;
  /** 置信度 0-1 */
  clarity: number;
}

/** 实时诊断遥测：把采集链路的每一步都暴露出来，便于定位"没反应"的原因 */
export interface TunerTelemetry {
  /** 时域波形均方根（0-1） */
  rms: number;
  /** 时域波形峰值（0-1） */
  peak: number;
  /** 最近一次基频检测结果 */
  freq: number | null;
  clarity: number;
  /** 当前这一步的判定说明 */
  verdict: string;
  /** 处理过的帧数 / 采纳的帧数 */
  frames: number;
  adopted: number;
}

/** 采集设备信息 */
export interface TunerDevice {
  label: string;
  sampleRate: number;
  state: string;
}

/** 名字里带这些关键词的多半是虚拟声卡 / 环回设备，收不到真实声音 */
const VIRTUAL_HINTS = [
  "blackhole",
  "soundflower",
  "loopback",
  "virtual",
  "aggregate",
  "multi-output",
  "vb-cable",
  "null audio",
];

export function isVirtualInput(label: string | undefined | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return VIRTUAL_HINTS.some((h) => l.includes(h));
}

interface Options {
  /** 手动选定的弦频率；null = 未选弦 */
  targetFreq: number | null;
  /** 自动模式的候选弦（自动识别时从中挑最近的） */
  candidates?: { id: string; freq: number }[];
  /** 是否开启自动识别 */
  auto?: boolean;
  /** 音准容差（cent） */
  toleranceCents: number;
  /** 置信度门限 */
  minClarity?: number;
  /** 检测间隔（ms） */
  intervalMs?: number;
}

/** 中位数平滑窗口（帧） */
const HISTORY = 6;
/** 超过该时长没有有效信号，就认为「没在弹」 */
const SILENCE_MS = 400;
/** 已选弦时，偏差超过该值判为「弹的不是这根弦」 */
const MAX_DRIFT = 200;
/** 音量门限（RMS） */
const MIN_RMS = 0.0015;
/** 日志最短间隔（ms） */
const LOG_INTERVAL = 350;
/** 多帧一致性窗口：真实琴弦的泛音会让单帧置信度偏低，用频率稳定性兜底 */
const STABLE_WINDOW = 5;
/** 窗口内频率极差小于该比例即视为稳定 */
const STABLE_RATIO = 1.03;
/** 单帧置信度高于该值就直接采信，不必等窗口 */
const TRUST_CLARITY = 0.55;
/**
 * 自动识别：与某根弦的偏差在该范围内才算「像是这根弦」。
 * 相邻弦相距 200 音分（G→A），所以 ±100 正好铺满、且不重叠；
 * 取 60 的话弦偏离半音以上就完全认不出来，调音时很别扭。
 */
const AUTO_MATCH_CENTS = 100;
/** 自动识别：连续多少帧指向同一根弦才切换，避免来回跳 */
const AUTO_MATCH_FRAMES = 3;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 麦克风调音：持续采样 → 检测基频 → 计算音分偏差。
 * 同时输出逐帧遥测与事件日志，方便在界面上看到「到底听到了什么、为什么没出读数」。
 */
export function useTuner({
  targetFreq,
  candidates = [],
  auto = false,
  toleranceCents,
  minClarity = 0.25,
  intervalMs = 60,
}: Options) {
  const [status, setStatus] = useState<TunerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<TunerReading | null>(null);
  const [mismatch, setMismatch] = useState<NoteInfo | null>(null);
  /** 自动识别出来的弦 id（自动模式关闭时为 null） */
  const [autoStringId, setAutoStringId] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [device, setDevice] = useState<TunerDevice | null>(null);
  const [log, setLog] = useState<string[]>([]);
  /** 麦克风权限：granted / prompt / denied / unknown（浏览器不支持查询时为 unknown） */
  const [permission, setPermission] = useState<string>("unknown");
  /** 可用的音频输入设备（授权后 label 才有内容） */
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  /** 用户选定的输入设备；空 = 跟随系统默认 */
  const [deviceId, setDeviceId] = useState<string>("");
  const [telemetry, setTelemetry] = useState<TunerTelemetry>({
    rms: 0,
    peak: 0,
    freq: null,
    clarity: 0,
    verdict: "等待开始",
    frames: 0,
    adopted: 0,
  });

  const targetRef = useRef(targetFreq);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const historyRef = useRef<number[]>([]);
  const lastValidRef = useRef(0);
  const lastDetectRef = useRef(0);
  const lastFreqRef = useRef<number | null>(null);
  const lastClarityRef = useRef(0);
  const mismatchKeyRef = useRef<string | null>(null);
  const framesRef = useRef(0);
  const adoptedRef = useRef(0);
  const lastLogAtRef = useRef(0);
  const lastLogTextRef = useRef<string>("");
  /** 最近若干帧的原始检测频率，用于一致性判断 */
  const recentFreqRef = useRef<number[]>([]);
  /** 选中的输入设备（用 ref 传给 start，避免闭包过期） */
  const deviceIdRef = useRef<string>("");
  /** 状态的 ref 镜像：start 里用它判断，避免闭包读到过期的 status */
  const statusRef = useRef<TunerStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  /** start 的 ref：自动切换设备后需要重新启动采集 */
  const startRef = useRef<() => void>(() => {});
  /** 自动模式识别出的当前弦（ref 供 loop 读取） */
  const autoTargetRef = useRef<{ id: string; freq: number } | null>(null);
  /** 自动识别的候选计数：连续若干帧指向同一根弦才切换 */
  const autoCandidateRef = useRef<{ id: string | null; count: number }>({
    id: null,
    count: 0,
  });
  /** 自动识别：连续贴不上任何候选弦的帧数，超过阈值就释放锁定 */
  const autoMissRef = useRef(0);
  /** auto / candidates 的 ref 镜像，供 loop 闭包读取最新值 */
  const autoRef = useRef(auto);
  const candidatesRef = useRef(candidates);

  /** 列出可用输入设备（未授权时 label 为空，只能显示占位名） */
  const refreshDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return [];
    try {
      const list = (await md.enumerateDevices()).filter(
        (d) => d.kind === "audioinput",
      );
      setInputs(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  // 进页面先列一次设备，并在插拔设备时刷新
  useEffect(() => {
    void refreshDevices();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const handler = () => void refreshDevices();
    md.addEventListener("devicechange", handler);
    return () => md.removeEventListener("devicechange", handler);
  }, [refreshDevices]);

  const pushLog = useCallback((text: string) => {
    const now = Date.now();
    if (now - lastLogAtRef.current < LOG_INTERVAL) return;
    if (text === lastLogTextRef.current) return;
    lastLogAtRef.current = now;
    lastLogTextRef.current = text;
    setLog((prev) => [`${stamp()}  ${text}`, ...prev].slice(0, 6));
  }, []);

  // 进页面先查一次麦克风权限，权限被拒时能立刻告诉用户
  useEffect(() => {
    let cancelled = false;
    const query = navigator.permissions?.query;
    if (typeof query !== "function") return;
    query
      .call(navigator.permissions, {
        name: "microphone" as PermissionName,
      })
      .then((p: PermissionStatus) => {
        if (cancelled) return;
        setPermission(p.state);
        p.onchange = () => setPermission(p.state);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 切换目标弦：清空平滑窗口，避免上一根弦的读数干扰
  useEffect(() => {
    targetRef.current = targetFreq;
    historyRef.current = [];
    recentFreqRef.current = [];
    lastValidRef.current = 0;
    lastFreqRef.current = null;
    lastClarityRef.current = 0;
    mismatchKeyRef.current = null;
    setReading(null);
    setMismatch(null);
  }, [targetFreq]);

  // 同步给 loop 闭包使用
  useEffect(() => {
    autoRef.current = auto;
    candidatesRef.current = candidates;
  }, [auto, candidates]);

  // 开关自动模式时重置识别状态：每次开启都从「未选弦」开始重新识别
  useEffect(() => {
    autoTargetRef.current = null;
    autoCandidateRef.current = { id: null, count: 0 };
    autoMissRef.current = 0;
    historyRef.current = [];
    setAutoStringId(null);
    setReading(null);
    setMismatch(null);
  }, [auto]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => undefined);
      ctxRef.current = null;
    }
    historyRef.current = [];
    lastValidRef.current = 0;
    lastDetectRef.current = 0;
    lastFreqRef.current = null;
    recentFreqRef.current = [];
    mismatchKeyRef.current = null;
    framesRef.current = 0;
    adoptedRef.current = 0;
    autoTargetRef.current = null;
    autoCandidateRef.current = { id: null, count: 0 };
    autoMissRef.current = 0;
    setAutoStringId(null);
    setLevel(0);
    setReading(null);
    setMismatch(null);
    setDevice(null);
    setStatus("idle");
    setTelemetry({
      rms: 0,
      peak: 0,
      freq: null,
      clarity: 0,
      verdict: "已停止",
      frames: 0,
      adopted: 0,
    });
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current === "listening" || statusRef.current === "starting")
      return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前环境不支持麦克风采集，请改用 https 或 localhost 访问");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("starting");

    try {
      const audio: MediaTrackConstraints = {
        // 关掉浏览器的音效处理，否则会干扰基频判断
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
      if (deviceIdRef.current) {
        audio.deviceId = { exact: deviceIdRef.current };
      } else {
        // 显式要求「系统默认设备」：只省略 deviceId 的话，浏览器会复用本站点
        // 上次用过的设备（用户之前可能选到 BlackHole 这类虚拟声卡，导致收不到声音）
        audio.deviceId = { ideal: "default" };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: false,
      });
      streamRef.current = stream;

      // 授权后设备 label 才可见，刷新一次列表
      const list = await refreshDevices();

      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      ctxRef.current = ctx;

      const track = stream.getAudioTracks()[0];
      setDevice({
        label: track?.label || "默认输入设备",
        sampleRate: Math.round(ctx.sampleRate),
        state: ctx.state,
      });

      // 兜底：浏览器给的是虚拟声卡（它收不到真实声音）时，自动换到第一个真实输入设备
      if (!deviceIdRef.current && isVirtualInput(track?.label)) {
        const real = list.find((d) => d.label && !isVirtualInput(d.label));
        if (real) {
          pushLog(
            `输入是虚拟声卡「${track?.label}」，已自动切到「${real.label}」`,
          );
          stop();
          deviceIdRef.current = real.deviceId;
          setDeviceId(real.deviceId);
          window.setTimeout(() => startRef.current(), 150);
          return;
        }
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      // 分析节点必须挂在通向 destination 的链路上：部分浏览器（尤其 Safari）
      // 不会处理没有下游的节点，导致波形恒为 0、读数永远不出现。
      // 这里用一个零增益节点把音量归零，既不回授也不影响 analyser 取数。
      const mute = ctx.createGain();
      mute.gain.value = 0;
      analyser.connect(mute);
      mute.connect(ctx.destination);

      const buffer = new Float32Array(analyser.fftSize);
      const bytes = new Uint8Array(analyser.fftSize);
      const canReadFloat = typeof analyser.getFloatTimeDomainData === "function";

      const readWave = () => {
        if (canReadFloat) {
          analyser.getFloatTimeDomainData(buffer);
        } else {
          analyser.getByteTimeDomainData(bytes);
          for (let i = 0; i < buffer.length; i += 1) {
            buffer[i] = (bytes[i] - 128) / 128;
          }
        }
        return buffer;
      };

      let lastRun = 0;

      const loop = (now: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (now - lastRun < intervalMs) return;
        lastRun = now;

        const wave = readWave();

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < wave.length; i += 1) {
          const v = wave[i];
          sum += v * v;
          const abs = v < 0 ? -v : v;
          if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sum / wave.length);
        framesRef.current += 1;

        const target = targetRef.current;
        const result = detectPitch(wave, ctx.sampleRate);
        const freq = result?.freq ?? null;
        const clarity = result?.clarity ?? 0;

        let verdict = "分析中…";

        // 多帧一致性：窗口内频率够集中，就认为听清了一个稳定的音
        let stable = false;
        if (result) {
          const recent = recentFreqRef.current;
          recent.push(result.freq);
          if (recent.length > STABLE_WINDOW) recent.shift();
          if (recent.length >= STABLE_WINDOW - 1) {
            stable = Math.max(...recent) / Math.min(...recent) < STABLE_RATIO;
          }
        } else {
          recentFreqRef.current = [];
        }

        if (peak < 1e-5) {
          verdict = "麦克风没有输出波形（设备静音 / 未授权）";
        } else if (rms < MIN_RMS) {
          verdict = `音量太低（RMS ${rms.toFixed(4)}）`;
        } else if (!result) {
          verdict = "听不清——没有稳定的周期信号";
        } else if (
          !(clarity >= TRUST_CLARITY || (clarity >= minClarity && stable))
        ) {
          verdict = `音高不稳定（置信度 ${clarity.toFixed(2)}，多帧也不一致）`;
        } else {
          lastDetectRef.current = now;
          const info = freqToNote(result.freq);
          let cents: number | null = null;

          // ── 自动模式：先从候选弦里挑最接近的一根 ──────────────────────
          // 连中 AUTO_MATCH_FRAMES 帧才真正切弦（防抖）；锁定前不出读数，
          // 这样扫弦 / 泛音造成的瞬时误判不会让指针乱跳。
          const isAuto = autoRef.current && candidatesRef.current.length > 0;
          let effTarget = target;
          if (isAuto) {
            let best: { id: string; freq: number } | null = null;
            let bestAbs = Infinity;
            for (const cand of candidatesRef.current) {
              const c = Math.abs(
                centsBetween(foldToTarget(result.freq, cand.freq), cand.freq),
              );
              if (c < bestAbs) {
                bestAbs = c;
                best = cand;
              }
            }

            const lock = autoCandidateRef.current;
            if (best && bestAbs <= AUTO_MATCH_CENTS) {
              autoMissRef.current = 0;
              if (lock.id === best.id) lock.count += 1;
              else {
                lock.id = best.id;
                lock.count = 1;
              }
              if (
                lock.count >= AUTO_MATCH_FRAMES &&
                autoTargetRef.current?.id !== best.id
              ) {
                autoTargetRef.current = { id: best.id, freq: best.freq };
                setAutoStringId(best.id);
                // 换了目标弦，之前的音分中位数是相对旧弦的，作废
                historyRef.current = [];
                mismatchKeyRef.current = null;
                setMismatch(null);
              }
            } else {
              lock.id = null;
              lock.count = 0;
              // 听清了一个明显不属于任何一根弦的音（比如按错了品），
              // 连续若干帧都贴不上任何候选弦就释放锁定，免得拿旧弦硬比。
              autoMissRef.current += 1;
              if (
                autoMissRef.current >= AUTO_MATCH_FRAMES &&
                autoTargetRef.current !== null
              ) {
                autoTargetRef.current = null;
                setAutoStringId(null);
                historyRef.current = [];
                setReading(null);
              }
            }

            effTarget = autoTargetRef.current?.freq ?? null;
            if (effTarget === null) {
              // 还没锁定（或听清的音夹在两根弦中间）→ 下面退化成十二平均律读数，
              // 界面上不点亮任何弦，让用户知道「我听见了，但不属于某一根」。
              verdict = `还没锁定弦位 · 听见 ${info.name}${info.octave}（最近差 ${Math.round(bestAbs)} 音分）`;
            }
          }

          if (effTarget === null) {
            cents = info.cents;
          } else {
            const folded = foldToTarget(result.freq, effTarget);
            const c = centsBetween(folded, effTarget);
            if (Math.abs(c) <= MAX_DRIFT) {
              cents = c;
              if (mismatchKeyRef.current !== null) {
                mismatchKeyRef.current = null;
                setMismatch(null);
              }
            } else {
              // 自动模式下偏到别的音上时，锁定会在几帧内自动释放，
              // 这里不打「不是这根弦」的提示，免得闪一下误导用户。
              if (!isAuto) {
                const key = `${info.name}${info.octave}`;
                if (mismatchKeyRef.current !== key) {
                  mismatchKeyRef.current = key;
                  setMismatch(info);
                }
              }
              verdict = `偏差过大（${Math.round(c)} 音分）→ 判为 ${info.name}${info.octave}${
                isAuto ? "，正在重新识别弦位" : "，不是这根弦"
              }`;
            }
          }

          if (cents !== null) {
            const history = historyRef.current;
            history.push(cents);
            if (history.length > HISTORY) history.shift();
            lastValidRef.current = now;
            lastFreqRef.current = result.freq;
            lastClarityRef.current = result.clarity;
            adoptedRef.current += 1;
            verdict = `采纳 ${result.freq.toFixed(1)} Hz · 置信度 ${clarity.toFixed(2)}${stable ? " · 多帧稳定" : ""} · ${Math.round(cents)} 音分`;
          }
        }

        setLevel(Math.min(1, rms / 0.08));
        setTelemetry({
          rms,
          peak,
          freq,
          clarity,
          verdict,
          frames: framesRef.current,
          adopted: adoptedRef.current,
        });
        pushLog(verdict);

        if (now - lastValidRef.current > SILENCE_MS) {
          historyRef.current = [];
          recentFreqRef.current = [];
          setReading(null);
          if (
            now - lastDetectRef.current > 800 &&
            mismatchKeyRef.current !== null
          ) {
            mismatchKeyRef.current = null;
            setMismatch(null);
          }
          return;
        }

        if (historyRef.current.length < 3) return;

        const sorted = [...historyRef.current].sort((a, b) => a - b);
        const smoothed = sorted[sorted.length >> 1];
        const f =
          lastFreqRef.current ??
          autoTargetRef.current?.freq ??
          target ??
          440;

        setReading({
          freq: f,
          cents: smoothed,
          note: freqToNote(f),
          clarity: lastClarityRef.current,
        });
      };

      rafRef.current = requestAnimationFrame(loop);
      setStatus("listening");
      pushLog("麦克风已开启，开始采样");
    } catch (e) {
      const err = e as DOMException;
      const msg =
        err?.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在浏览器设置中允许后重试"
          : err?.name === "NotFoundError"
            ? "没有找到可用的麦克风设备"
            : `无法访问麦克风（${err?.name || "未知错误"}）`;
      setError(msg);
      setStatus("error");
      pushLog(msg);
    }
  }, [intervalMs, minClarity, pushLog, refreshDevices, stop]);

  startRef.current = () => {
    void start();
  };

  // 组件卸载时释放麦克风与音频上下文
  useEffect(() => stop, [stop]);

  /** 切换输入设备：正在聆听时自动用新设备重启 */
  const selectDevice = useCallback(
    (id: string) => {
      deviceIdRef.current = id;
      setDeviceId(id);
      if (status === "listening" || status === "starting") {
        stop();
        window.setTimeout(() => void start(), 150);
      } else if (status === "error") {
        setError(null);
        setStatus("idle");
      }
    },
    [start, status, stop],
  );

  const inTune = reading !== null && Math.abs(reading.cents) <= toleranceCents;

  return {
    status,
    error,
    reading,
    mismatch,
    /** 自动模式识别出的弦 id（未开启自动 / 尚未锁定时为 null） */
    autoStringId,
    level,
    device,
    permission,
    inputs,
    deviceId,
    selectDevice,
    log,
    telemetry,
    inTune,
    start,
    stop,
  };
}
