import { useCallback, useEffect, useRef, useState } from "react";
import type * as alphaTabNs from "@coderline/alphatab";
import type { ChordConfig } from "../config/site.config";
import { chordTex } from "../lib/chord";

/**
 * 和弦试听。
 *
 * 三点设计取舍：
 * 1. **alphaTab 只动态 import**，所以它落到独立 chunk 里，主包不会因此变大
 *    （页面本身照常秒开，指法图不依赖它）。
 * 2. **进页面就后台静默预加载**（挂在 requestIdleCallback 上，不跟首屏抢带宽），
 *    等用户点的时候音色已经就绪，点下去就响。
 * 3. **合成器挂在屏幕外的容器上**：我们只要声音，不要谱面，所以给它一个
 *    固定定位到屏幕外、有真实尺寸的 div（尺寸为 0 会让渲染器算不出布局）。
 *
 * 播放靠「重试到播放器就绪」而不是「等固定时长」：alphaTab 换谱后要重新生成 MIDI，
 * 这期间 play() 会直接返回 false，猜时间不如看返回值。
 */

/** 换谱后重试起播的间隔与次数上限（实测换谱到可播约需 150ms 左右） */
const PLAY_RETRY_INTERVAL_MS = 25;
const PLAY_RETRY_LIMIT = 60;

export type ChordPlayerStatus = "preparing" | "ready" | "error";

interface Options {
  chords: ChordConfig[];
  tuning: string;
  strumSpreadMs: number;
  ringSeconds: number;
  volume: number;
}

export function useChordPlayer({
  chords,
  tuning,
  strumSpreadMs,
  ringSeconds,
  volume,
}: Options) {
  const [status, setStatus] = useState<ChordPlayerStatus>("preparing");
  const [error, setError] = useState<string | null>(null);
  /** 最近一次点了哪个和弦（视觉上保持点亮，不随余音衰减消失） */
  const [activeName, setActiveName] = useState<string | null>(null);

  const apiRef = useRef<alphaTabNs.AlphaTabApi | null>(null);
  const pendingRef = useRef<string | null>(null);
  const retryRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  /** 播放参数放进 ref，避免把 init 的 effect 拖进依赖数组反复重建 */
  const playOptionsRef = useRef({ strumSpreadMs, ringSeconds, tuning });
  playOptionsRef.current = { strumSpreadMs, ringSeconds, tuning };
  const chordsRef = useRef(chords);
  chordsRef.current = chords;

  const clearRetry = useCallback(() => {
    if (retryRef.current !== null) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  }, []);

  /**
   * 反复尝试起播，直到播放器就绪。
   * play() 在「音色还没加载完」或「新谱的 MIDI 还没生成完」时返回 false。
   */
  const playWhenReady = useCallback(
    (api: alphaTabNs.AlphaTabApi, attempt = 0) => {
      if (!aliveRef.current) return;
      if (api.play()) return;
      if (attempt >= PLAY_RETRY_LIMIT) return;
      retryRef.current = window.setTimeout(
        () => playWhenReady(api, attempt + 1),
        PLAY_RETRY_INTERVAL_MS,
      );
    },
    [],
  );

  /** 换谱并起播（音色已就绪时走这里） */
  const playNow = useCallback(
    (api: alphaTabNs.AlphaTabApi, chord: ChordConfig) => {
      clearRetry();
      api.stop();
      api.tex(chordTex(chord, playOptionsRef.current));
      playWhenReady(api);
    },
    [clearRetry, playWhenReady],
  );

  /** 点击一个和弦：先点亮（立即反馈），再发声 */
  const play = useCallback(
    (name: string) => {
      setActiveName(name);
      const chord = chordsRef.current.find((c) => c.name === name);
      if (!chord) return;
      const api = apiRef.current;
      if (!api) {
        // 音色还在后台加载：记下来，就绪后补播
        pendingRef.current = name;
        return;
      }
      playNow(api, chord);
    },
    [playNow],
  );

  // 静默预加载 alphaTab + 音色，并加载第一个和弦的谱面
  useEffect(() => {
    aliveRef.current = true;

    // 屏幕外的合成器宿主：有真实尺寸，但用户看不到也点不到
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-10000px;top:-10000px;width:480px;height:160px;" +
      "overflow:hidden;pointer-events:none;opacity:0;";
    document.body.appendChild(host);

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const boot = async () => {
      try {
        const alphaTab = await import("@coderline/alphatab");
        if (cancelled) return;

        const api = new alphaTab.AlphaTabApi(host, {
          core: { fontDirectory: "/font/", tex: true },
          player: {
            enablePlayer: true,
            soundFont: "/soundfont/sonivox.sf3",
            // 只听声音，不需要光标 / 点谱跳转
            enableCursor: false,
            enableAnimatedBeatCursor: false,
            enableUserInteraction: false,
          },
        } as unknown as alphaTabNs.json.SettingsJson);

        api.masterVolume = volume;
        // 先随便载一个和弦，让播放器有谱可播（playerReady 需要「音色 + MIDI」都就绪）
        const first = chordsRef.current[0];
        if (first) api.tex(chordTex(first, playOptionsRef.current));

        // playerReady 自带就绪检查，注册时会立刻回调，不存在错过事件的问题
        api.playerReady.on(() => {
          if (cancelled) return;
          setStatus("ready");
          const pending = pendingRef.current;
          if (pending) {
            pendingRef.current = null;
            playNow(api, chordsRef.current.find((c) => c.name === pending)!);
          }
        });
        api.error.on((e) => {
          console.error("[alphaTab]", e);
          if (cancelled) return;
          setStatus("error");
          setError("音色加载失败，试听暂时不可用");
        });

        apiRef.current = api;
      } catch (e) {
        console.error("[alphaTab] 加载失败", e);
        if (cancelled) return;
        setStatus("error");
        setError("音色加载失败，试听暂时不可用");
      }
    };

    // 等浏览器空闲再下载，避免和首屏渲染抢带宽
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(() => void boot(), { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(() => void boot(), 300);
    }

    return () => {
      cancelled = true;
      aliveRef.current = false;
      clearRetry();
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      apiRef.current?.destroy();
      apiRef.current = null;
      host.remove();
    };
    // 只在挂载时跑一次；播放参数走 ref 取最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 音量跟随配置
  useEffect(() => {
    if (apiRef.current) apiRef.current.masterVolume = volume;
  }, [volume]);

  return { status, error, activeName, play };
}
