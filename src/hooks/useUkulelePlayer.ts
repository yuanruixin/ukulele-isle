import { useCallback, useEffect, useRef, useState } from "react";
import type * as alphaTabNs from "@coderline/alphatab";
import { boardTex, stringIndexFromNote } from "../lib/ukulele";
import type { SynthFxOptions } from "../lib/synthFx";
import { useSynthFx } from "./useSynthFx";

/**
 * 虚拟尤克里里的发声层：点指板 → 出声。
 *
 * 做法与和弦库（useChordPlayer）一脉相承，但**不用「换谱再播」**：
 * 挂载时一次性把**整块指板**（每格一个小节的全音符）交给 alphaTab 解析好，
 * 之后就只调 `api.playNote(note)` —— 它内部把单个音生成一份「一次性 MIDI」
 * 直接推给合成器，**不重新算整份谱面**，所以点下去几乎立刻响（和弦页那
 * 150–200ms 的换谱延迟在这里没有）。
 *
 * 代价（已知并接受）：`playOneTimeMidiFile` 会打断正在响的上一个一次性音，
 * 所以这里是**单音**乐器——同一个音域里后一个音会掐掉前一个音（余音不叠加）。
 * 想要和弦叠加请用和弦库；这一页要的是「点哪响哪」的手感。
 *
 * 音色分两层，都在 ★ `siteConfig.uke` 里调：
 * - `instrument`：GM 音色号。不指定的话 alphaTab 默认 **25 = 钢弦吉他**，
 *   而尤克里里是尼龙弦，钢弦音色会明显偏尖，所以默认换成 24 尼龙吉他。
 * - `fx`：alphaTab 的合成器本身**没有任何效果**，音色库也注明 no reverb，
 *   于是声音干、贴耳。这里额外挂一条低通 + 混响支路（见 `lib/synthFx.ts`）。
 *
 * 效果链有没有、什么味道，**全部由 ★ `siteConfig.uke.fx` 那块配置决定，页面上没有开关**：
 * `enabled: false` 时整条链都不挂（音频路径上不留痕迹）。改完刷新页面生效。
 */

export type UkePlayerStatus = "preparing" | "ready" | "error";

interface Options {
  /** 指板到第几品（谱面数据范围，应取布局里更大的那个） */
  frets: number;
  stringCount: number;
  tuning: string;
  /** 试听音色（GM 音色号，0 基） */
  instrument: number;
  ringSeconds: number;
  volume: number;
  /** 输出效果链（低通 + 混响） */
  fx: SynthFxOptions;
}

export function useUkulelePlayer({
  frets,
  stringCount,
  tuning,
  instrument,
  ringSeconds,
  volume,
  fx: fxOptions,
}: Options) {
  const [status, setStatus] = useState<UkePlayerStatus>("preparing");
  const [error, setError] = useState<string | null>(null);
  /** 输出效果链（低通 + 混响）：接线在通用 hook 里；挂不挂由配置的 `fx.enabled` 决定 */
  const fx = useSynthFx(fxOptions);

  const apiRef = useRef<alphaTabNs.AlphaTabApi | null>(null);
  /** `${弦下标}:${品}` → alphaTab 的 Note，按弦下标（0 = 1 弦 A）编号 */
  const notesRef = useRef(new Map<string, alphaTabNs.model.Note>());
  /** 音色还没就绪时点的那一下，就绪后补上 */
  const pendingRef = useRef<{ stringIndex: number; fret: number } | null>(null);
  const aliveRef = useRef(true);

  const pluck = useCallback((stringIndex: number, fret: number) => {
    const note = notesRef.current.get(`${stringIndex}:${fret}`);
    const api = apiRef.current;
    if (!api || !note) {
      // 音色还在后台加载（或这一格没有对应音符）：记下来，就绪后补响
      pendingRef.current = { stringIndex, fret };
      return;
    }
    api.playNote(note);
  }, []);

  useEffect(() => {
    aliveRef.current = true;

    // 屏幕外的合成器宿主：有真实尺寸，但用户看不到也点不到
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-10000px;top:-10000px;width:2400px;height:600px;" +
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
            enableCursor: false,
            enableAnimatedBeatCursor: false,
            enableUserInteraction: false,
          },
        } as unknown as alphaTabNs.json.SettingsJson);

        api.masterVolume = volume;

        // 效果链挂在「已经建好的播放器」上。AlphaTabApi 可能在构造时就建好了播放器，
        // 也可能要等到 playerReady，所以两处都试一次（attach 自己会去重）
        const attachFx = () => {
          if (cancelled) return;
          fx.attach(api);
        };
        attachFx();

        // 解析完成后把每一格的 Note 收进索引，拨弦时直接取
        api.scoreLoaded.on((score) => {
          const map = notesRef.current;
          map.clear();
          for (const track of score.tracks) {
            for (const staff of track.staves) {
              for (const bar of staff.bars) {
                for (const voice of bar.voices) {
                  for (const beat of voice.beats) {
                    for (const note of beat.notes) {
                      // ⚠️ Note.string 是 1 = 最低音弦，与配置里「高音弦在前」相反
                      const index = stringIndexFromNote(note.string, stringCount);
                      map.set(`${index}:${note.fret}`, note);
                    }
                  }
                }
              }
            }
          }
        });

        // 整块指板的谱面：每格一个小节的全音符，`\tempo` 由余音时长反推
        api.tex(boardTex({ tuning, instrument, ringSeconds, frets, stringCount }));

        // playerReady 自带就绪检查，注册时会立刻回调，不存在错过事件的问题
        api.playerReady.on(() => {
          if (cancelled) return;
          attachFx();
          setStatus("ready");
          const pending = pendingRef.current;
          if (pending) {
            pendingRef.current = null;
            const note = notesRef.current.get(`${pending.stringIndex}:${pending.fret}`);
            if (note) api.playNote(note);
          }
        });
        api.error.on((e) => {
          console.error("[alphaTab]", e);
          if (cancelled) return;
          setStatus("error");
          setError("音色加载失败，暂时发不出声音");
        });

        apiRef.current = api;
      } catch (e) {
        console.error("[alphaTab] 加载失败", e);
        if (cancelled) return;
        setStatus("error");
        setError("音色加载失败，暂时发不出声音");
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
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      fx.detach();
      apiRef.current?.destroy();
      apiRef.current = null;
      notesRef.current.clear();
      host.remove();
    };
    // 只在挂载时跑一次；谱面参数由页面在挂载时就定好（改配置要整页刷新）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 音量跟随配置
  useEffect(() => {
    if (apiRef.current) apiRef.current.masterVolume = volume;
  }, [volume]);

  return { status, error, pluck };
}
