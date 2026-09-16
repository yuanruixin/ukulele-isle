import type * as alphaTabNs from "@coderline/alphatab";

/**
 * 挂在 alphaTab 合成器输出后面的「低通 + 混响」支路。
 *
 * 为什么需要它：alphaTab 的合成器（AlphaSynth）**完全不带任何效果**——1.8.4 的 API 里
 * 搜不到 reverb / chorus / delay / filter。于是那张功能机时代的 GM 音色库
 * （sonivox，自述「no reverb」、采样上限 11–32kHz）出来的声音又干又尖，
 * 尤克里里这种音域偏高、音头又硬的乐器尤其明显。
 *
 * 怎么做：alphaTab 把播放节点藏在输出对象的两个**私有字段**里——
 * `_worklet`（AudioWorklet 模式，默认）或 `_audioNode`（ScriptProcessor 回退模式）——
 * 并且在 `play()` 里直接 `connect(ctx.destination)`。我们在它接好之后把这根线拔掉，
 * 改接到自己这条链上：
 *
 *     合成器输出 → 入口 → 低通×N ┬─ 干声 ────────────┐
 *                                └─ 卷积混响 → 湿度 ──┴→ 总增益 → destination
 *
 * **要不要这条链，只由 ★ 配置里的 `fx.enabled` 决定**（每个播放器一块：
 * `player.fx` / `chords.fx` / `uke.fx`），**页面上没有开关**。关掉时 `createSynthFx`
 * 直接在开头返回 null、**完全不碰音频路径**——比「挂上链再把增益调到 0」干净得多，
 * 也彻底没有「装饰性效果把声音弄哑」的可能。想改就改配置，不想要 A/B 就看着配置里的数。
 *
 * ⚠️ 两个必须知道的坑（都是实测出来的，改这里之前先读）：
 *
 * 1. **播放节点是「每次播放」重建的**（在 `play()` 里 new），而且 AudioWorklet 那条路
 *    是**异步**创建的（`.then()` 里才赋值并 connect）。所以：不能只接一次线，
 *    必须在每次 `play()` 之后重新接一遍；而且允许「这次还没建出来、过一会儿再试」。
 *    这里用「包住输出实例的 `play()` 方法」来实现——**改的是实例上的方法，不是原型**，
 *    只影响挂载它的这一个播放器实例（曲谱页 / 和弦库 / 虚拟尤克里里各有一个，互不干扰）。
 *
 * 2. 万一将来 alphaTab 改了这两个字段名，这里会**拿不到节点 → 什么都不做**
 *    （声音照旧，只是听不到润色），并在控制台留一条 warning。
 *    绝不允许因为装饰性效果把声音弄哑，所以整条链只在能拿到节点时才建。
 *
 * ⚠️ 低通的开在哪里，是这套东西**唯一真正决定「有没有效果」**的参数（实测结论，别凭感觉回调）：
 * 「尖」不在 10kHz 上——它在 **2–6kHz**（拨弦的硬音头）。
 * 下面这张表是**滤波器自身的频响**（按 RBJ biquad + 巴特沃斯 Q 解析算出来的，公式见 skill
 * `alphatab-react-vite`；浏览器里逐节点量到的值与之相差 2dB 以内）：
 *
 *     截止   级数    1k     2k     3k     6k      10k
 *     2400    2     0.0   −0.9   −8.6   −33.7   −55.9
 *     3400    2     0.0   −0.1   −1.3   −21.3   −43.5   ← 默认
 *     4400    2     0.0    0.0   −0.2   −12.1   −34.1
 *     3400    1     0.0   −0.5   −2.0   −11.0   −21.8
 *
 * 最初那版是**单级 4200Hz**：6kHz 只掉约 5dB——等于什么都没做，用户的原话就是
 * 「开启前后毫无变化，感觉没有润色」。所以现在默认**两级串联**（24dB/oct）@3400Hz，
 * 6kHz 直接砍掉 21dB。另外两级共用同一个 Q 也不对（会在 3kHz 拱出「鼻音」包），
 * Q 走巴特沃斯，见 LOWPASS_Q。
 *
 * ⚠️ 量这个别拿单一频率下结论：混响支路就挂在低通后面，它给 1–3kHz 补的能量会让
 * 「整条链」的读数在截止点附近鼓出一个 +3dB 的包（我们自己也先被这个骗过一次）。
 * 要看低通本身，量「低通输出」那个节点，别量总输出。
 *
 * 想在现场验证：把几个正弦接到链路入口、在入口与出口各挂一个 AnalyserNode 读频谱，
 * 别用耳朵猜（这套法子比听感靠谱得多，而且无头浏览器里也能跑）。
 */

export interface SynthFxOptions {
  /** ★ 是否给这个播放器挂这条链。**这就是唯一的开关**——关掉就整条链都不建、不碰音频路径 */
  enabled: boolean;
  /** 低通截止频率（Hz）：越低越暖越闷。**这一个数决定「尖不尖」**。 */
  lowpassHz: number;
  /** 低通级数：2 = 24dB/oct（默认，真能削掉 4–8kHz 的刺）；1 = 12dB/oct（温和，但很容易听不出来） */
  lowpassStages: number;
  /**
   * 混响湿度（0–1）。**这是唯一能调混响大小的旋钮**——缩放 IR 没用（见 makeImpulse 的说明）。
   * 它标定的是**全频带能量比**：0.12 → −18.4dB / 0.25 → −12.0dB / 0.5 → −6.0dB
   * （= 20log₁₀，实测 0.12 与理论吻合到 0.1dB）。
   * ⚠️ 但别拿单一频率去量「湿声比干声低多少」：我们的 IR 是暗噪声，|H(f)| 在 0.6–2.0 之间起伏
   * （低频厚、高频薄），而且换个随机种子同一频点还能再差 5–10dB。所以 0.3 与 0.4 的差别
   * 只在整段能量上成立，逐频比较一定自相矛盾（我们先后量出 −18dB 与 −4dB 两个数，就是这么来的）。
   * 要量就取一段频带（1/3 倍频程以上）的能量平均，或者干脆用宽带噪声当测试信号。
   */
  reverbMix: number;
  /** 混响长度（秒） */
  reverbSeconds: number;
  /** 效果支路的总增益：挂上混响会比原来响一点，用它可以压回来（只作用于效果支路） */
  gain: number;
}

export interface SynthFxHandle {
  /** 手动补接一次线。正常不用调——包住 `play()` 之后每次发声都会自动补 */
  sync: () => void;
  dispose: () => void;
}

/** alphaTab 内部给播放节点用的字段名，按优先级（默认走 AudioWorklet，退回 ScriptProcessor） */
const OUTPUT_NODE_FIELDS = ["_worklet", "_audioNode"] as const;

/** 节点还没建出来时的重试节奏（AudioWorklet 那条路是异步建的），最多试约 1 秒 */
const RETRY_INTERVAL_MS = 25;
const RETRY_LIMIT = 40;

/**
 * 串联 N 级低通时，每级的 Q 取**巴特沃斯**（最大平坦）那一组。
 * 不能全都给同一个 Q：实测 Q=0.6 串联两级，会在 3kHz 拱起 +2.8dB——那正是「鼻音」的频段，
 * 等于一边削尖一边又添了个包。巴特沃斯让通带平直、截止点后才陡降。
 */
const LOWPASS_Q: Record<number, number[]> = {
  1: [0.7071],
  2: [0.5412, 1.3066],
  3: [0.5176, 0.7071, 1.9319],
  4: [0.5098, 0.6013, 0.8999, 2.5629],
};

function isAudioNode(value: unknown): value is AudioNode {
  return typeof AudioNode !== "undefined" && value instanceof AudioNode;
}

/**
 * 一段「衰减噪声」当卷积混响的脉冲响应：不需要带音频素材，也足够给拨弦声一点空间感。
 *
 * 两处小心思：
 * - **前 25ms 留空**（预延迟）——紧贴音头的早期反射听起来像金属「啪」的一声，
 *   而且会和干声打架、把频谱梳出毛刺；25ms 短到听不出「延迟」，但足以把音头和混响分开。
 * - 噪声先过一阶低通再衰减——混响尾巴本来就该比干声闷，直接送白噪声会得到沙沙的电子味。
 *
 * ⚠️ 关于量级，三条都得记住（前两条是我们自己踩过、并且量出过互相矛盾的数字的）：
 *
 * 1. `convolver.normalize` 必须关掉，而且要**在赋 buffer 之前**设。写在之后不生效，
 *    结果等于又给手工 IR 放大了一截（实测约 13 倍）：`reverbMix` 名义 0.2、湿声却有
 *    干声的 0.63 倍，低中频被垒起 +6dB——听感是「糊、变响」而不是「有空间」。
 * 2. 关掉之后卷积就是**严格的「输入 ⊛ IR」**，湿/干电平比 = `reverbMix`（全频带能量意义下）。
 *    所以——**混响大小只能靠 `reverbMix` 调，别指望缩放 IR**（那是白费力气）；
 *    这里的能量归一化（√Σh² = 1）只是让不同随机种子 / 不同时长下量级保持稳定。
 * 3. ⚠️ 归一化用 √Σh²，**别用 Σ|h|**——噪声 IR 的相干求和只有 RMS·√N 量级，
 *    实测比 Σ|h| 小 70 倍（−37dB），按 Σ|h| 定出来的混响小到听不见。
 */
function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * Math.max(0.05, seconds)));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const head = Math.min(length, Math.floor(ctx.sampleRate * 0.025));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let prev = 0;
    for (let i = head; i < length; i++) {
      const t = (i - head) / (length - head);
      prev += 0.35 * (Math.random() * 2 - 1 - prev);
      data[i] = prev * (1 - t) ** 2.6;
    }
  }
  // 归一化：能量归一化（scale = 1/√Σh²），让不同随机种子 / 不同时长下量级稳定。
  // 配合 `normalize = false` 之后，湿/干电平比就等于 `reverbMix`（全频带能量意义下）。
  // ⚠️ 用 √Σh²，别用 Σ|h|：噪声 IR 的相干求和只有 RMS·√N 量级，两者差 70 倍（−37dB）。
  let sumSq = 0;
  const first = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) sumSq += first[i] * first[i];
  if (sumSq > 0) {
    const scale = 1 / Math.sqrt(sumSq);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] *= scale;
    }
  }
  return buffer;
}

/** 一条建好的效果链（一个 AudioContext 一条） */
interface FxChain {
  context: BaseAudioContext;
  /** 合成器输出接到这里 */
  input: GainNode;
}

/**
 * 给一个播放器实例挂上效果链。
 * 返回 null 有两种情况：★ 配置里 `enabled: false`（正常关闭），或者拿不到 alphaTab 的输出对象
 * （版本变了 / 字段名改了）。两种都由调用方按「没有效果」处理，声音照旧能出。
 */
export function createSynthFx(
  api: alphaTabNs.AlphaTabApi,
  options: SynthFxOptions,
): SynthFxHandle | null {
  // ★ 唯一的开关：关掉就整条链都不建，连 output.play 都不包——音频路径上不留任何痕迹
  if (!options.enabled) return null;

  const output = api.player?.output as unknown as Record<string, unknown> | undefined | null;
  if (!output || typeof output.play !== "function") {
    console.warn("[synthFx] 拿不到 alphaTab 的输出对象，跳过效果链");
    return null;
  }

  const originalPlay = output.play as (...args: unknown[]) => unknown;
  /** 已经接过线的节点（每次播放都会新建一个，所以按节点记） */
  const routed = new WeakSet<AudioNode>();
  let chain: FxChain | null = null;
  let timer: number | null = null;
  let attempts = 0;
  let disposed = false;
  let warned = false;

  /** 从输出对象上摸出当前这个播放节点 */
  const nodeOf = (): AudioNode | null => {
    for (const field of OUTPUT_NODE_FIELDS) {
      const candidate = output[field];
      if (isAudioNode(candidate)) return candidate;
    }
    return null;
  };

  const build = (ctx: BaseAudioContext): FxChain => {
    const input = ctx.createGain();

    // 低通可以串多级：一级 12dB/oct 太软（实测 6kHz 只有 9dB，很容易听不出来），
    // 两级 24dB/oct 才是「明显变暖」。Q 取巴特沃斯（见 LOWPASS_Q 的说明）。
    const stages = Math.max(1, Math.min(4, Math.round(options.lowpassStages)));
    const qs = LOWPASS_Q[stages] ?? LOWPASS_Q[1];
    const lowpasses: BiquadFilterNode[] = [];
    for (let i = 0; i < stages; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.lowpassHz;
      filter.Q.value = qs[i];
      lowpasses.push(filter);
    }
    for (let i = 1; i < stages; i++) lowpasses[i - 1].connect(lowpasses[i]);
    const tail = lowpasses[stages - 1];

    const dry = ctx.createGain();
    dry.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = options.reverbMix;
    const convolver = ctx.createConvolver();
    // ⚠️ 顺序不能反：`normalize` 必须在 `buffer` **之前**关掉。
    // 归一化是在「赋值 buffer 的那一刻」按当时的 flag 算好并作用到内部拷贝上的，
    // 反过来写就会先按 1/RMS 放大一次、再关掉——实测湿声比标定值大了约 2.8 倍。
    convolver.normalize = false;
    convolver.buffer = makeImpulse(ctx, options.reverbSeconds);

    // 出口增益：挂上混响会比原来响一点，用 `gain` 压回来（这是链内唯一的总增益）
    const master = ctx.createGain();
    master.gain.value = options.gain;

    input.connect(lowpasses[0]);
    tail.connect(dry).connect(master);
    tail.connect(convolver).connect(wet).connect(master);
    master.connect(ctx.destination);

    return { context: ctx, input };
  };

  const sync = () => {
    if (disposed) return;

    const node = nodeOf();
    if (!node) {
      // 还没建出来（AudioWorklet 是异步建的）：过一会儿再看，超过次数就放弃
      if (attempts++ < RETRY_LIMIT && timer === null) {
        timer = window.setTimeout(() => {
          timer = null;
          sync();
        }, RETRY_INTERVAL_MS);
      }
      if (!warned && attempts >= RETRY_LIMIT) {
        warned = true;
        console.warn("[synthFx] 始终没找到 alphaTab 的播放节点，效果链未生效（检查 alphaTab 版本是否改了字段名）");
      }
      return;
    }

    if (routed.has(node)) return;
    // 输出对象换过 context 就得整条链重建，否则节点不在同一个 AudioContext 里
    if (!chain || chain.context !== node.context) chain = build(node.context);

    node.disconnect(); // 拔掉 alphaTab 自己那根直连 destination 的线
    node.connect(chain.input);
    routed.add(node);
  };

  // 包住输出实例的 play()：alphaTab 每次起播都会重建播放节点，这里跟着补一次接线
  output.play = function (this: unknown, ...args: unknown[]) {
    attempts = 0;
    const result = originalPlay.apply(this, args);
    sync();
    return result;
  };

  return {
    sync,
    dispose() {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      output.play = originalPlay;
    },
  };
}
