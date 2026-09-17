/* ============================================================================
   屿琴 · 小猫动效引擎（可复用核心 · 与 UI 无关）
   准则来源：.agents/skills/disney-animation-rule-skill（12 条准则 → 可执行规则）
   工程约定：.agents/skills/svg-character-motion（写法说明 + 7 个坑 + 验收方法）
   骨架几何：src/assets/cats/<id>.svg（生成物，一个姿态一个文件，可读可 diff）
   骨架元数据：src/data/cats.ts（生成物，勿手改）；文本投递见 src/data/catArt.ts

   核心约定：**状态 = f(t, inputs, params)** —— 每一帧都能独立算出来，不读上一帧，
            所以支持暂停 / 慢放 / 把任意时刻定格出来逐帧检视。

   坐标系：舞台单位（= viewBox 单位 —— viewBox **就是**舞台坐标系，别再减它的原点；
          初版在这里多减了一次 vbStage 的 x/y，症状是「方向永远只朝一边」）。
          身体高 = CATS.targetBodyH；原点 (0,0) = 身体底边中线 = **地面接触点**
          ⇒ 挤压/旋转都绕它做，脚永远踩在地上（Solid Drawing）。

   三层变换（每只猫的 svg 内部）：
     <g.home  translate(off 0)>   静态：猫**站**在舞台的哪儿（影子/扬尘一起搬）
       <g.rig  translate(dx-off dy) rotate() scale()>   动态：这次动作（绕脚下）
         <g.norm translate() scale()>   原始坐标 → 舞台坐标（几何一字未动）
       <g.fx>                     投影 / 落地扬尘 / 换姿态 poof
   拆开的原因：静态站位若和动态形变同一个 transform，站到画面边上时缩放会绕
   画面原点转 —— 脚会飘。

   需要的 CSS（DOM 契约）—— 引擎**不注入任何样式**，它只建节点，页面负责看起来对：
     .cat          每只猫的盒子（pointerenter/leave/click 都挂它身上；row 布局里几只就有几个）
     .cat .pose    一个姿态的画面，**只有一个带 .on**（引擎切的是 .pose 上的 .on）
     .cat svg      撑满盒子；宽高由页面定（按高布局用 height:100%;width:auto）
     .fx .shadow / .fx .dust / .fx .poof   点缀的填色/描边（--fx / --fx2 由引擎写在 .fx 上，
                   透明度每帧由引擎写行内 style ⇒ CSS 里给个 opacity:0 的初值免得第一帧闪）
   站点侧的这一套见 src/styles/globals.css 的 `.cat-motion`。

   用法：
     const h = createCatMotion(hostEl, { layout: 'row', poses: ['listen','sing'] })
     h.setTheme('dark'); h.destroy();
   ========================================================================== */
import { CATS } from "../../data/cats";
import { CAT_ART } from "../../data/catArt";

/* ═══════════════════════════ 类型 ═══════════════════════════ */
export type ThemeMode = "light" | "dark";
/** 定格检视：非空时只演那一个动作（去掉呼吸/踩拍/抽动），用来逐帧比对间距 */
export type ReviewAct = "jump" | "perk" | "morph" | "startle";
export interface Review {
  act: ReviewAct;
  /** 0–1：动作时间轴上的位置 */
  p: number;
  /** 换姿态的目标（只有 morph 用得到） */
  pose: string;
}
/** 会演完就结束的动作（呼吸/踩拍/抽动是常驻的，不在这里） */
export type Action =
  | { kind: "jump"; t0: number; from: string; travel: number; review?: boolean }
  | { kind: "perk"; t0: number; from: string; review?: boolean }
  | { kind: "morph"; t0: number; from: string; to: string; review?: boolean }
  | { kind: "startle"; t0: number; from: string; review?: boolean };

export interface CatColors {
  /** 浅色 / 深色主题下的点缀色（地面投影、扬尘）与 poof 环色 */
  light: { fx: string; fx2: string };
  dark: { fx: string; fx2: string };
  /**
   * ★ 深色下身体剪影（base 层）换成什么颜色。
   *   取「猫背后的底色」⇒ 身体与背景融为一体，只剩一圈亮线 = 深色底上的白线稿。
   */
  baseDark: string;
}

type CatInstanceState = {
  /** 交互挂在这上面（= 这只猫自己的 DOM 盒子） */
  el: HTMLDivElement;
  pose: string;
  /** 该实例可见的姿态（row 布局只有 1 个；single 布局有全部，用于换姿态） */
  poses: string[];
  svg: Record<string, SVGSVGElement>;
  rig: Record<string, SVGGElement>;
  home: Record<string, SVGGElement>;
  cache: Record<string, PoseCache>;
  bound: { c?: boolean; h?: boolean };
  action: Action | null;
  /** 归位点：猫**站**在舞台的哪儿（舞台单位，只做水平移动） */
  off: number;
  hover: boolean;
  tIn: number;
  tOut: number;
  pointer: number | null;
  seed: number;
  /** 定格检视是否作用于它（只有「舞台」那一个实例是 true） */
  reviewTarget: boolean;
  clickable: boolean;
};
export type CatInstance = CatInstanceState;

type PoseCache = {
  /** 色层（带 data-layer / data-col 的那几个，可能嵌在归一化组 .norm 里）—— 主题换色只写它们 */
  layers: SVGGElement[];
  fx: SVGGElement;
  shadow: SVGElement;
  dust: { el: SVGElement; a: number; sgn: number }[];
  poof: { el: SVGElement; a: number }[];
  parts: Record<string, { el: SVGElement; px: number; py: number }[]>;
};

export interface RenderInfo {
  body: {
    dy: number; dx: number; rot: number; sx: number; sy: number;
    lean: number; impact: number; phase: string; principles: string[] | null;
  };
  show: string;
  act: Action | null;
}

/**
 * 累加过程的中间态：**先统一按 `s` 累乘**（呼吸 × 踩拍 × 抽动 × 抬身 × 动作都是乘法叠加），
 * 最后一帧才由 `s` 拆出 sx/sy（体积守恒）—— 拆早了就没法继续叠乘。
 * 内部类型，不对外暴露；`RenderInfo.body` 才是渲染用的那一份。
 */
interface BodyAcc {
  dy: number; dx: number; rot: number;
  s: number;
  lean: number; impact: number;
  phase: string; principles: string[] | null;
  /** 纵向 s 定下来之后才写：sy = s，sx = 1-(s-1)*volumeGain */
  sx: number; sy: number;
  /** morph 专用：这一帧到底换没换画面（换的瞬间要把归位点归零） */
  swapped?: boolean;
}

export interface CatMotionOpts {
  /**
   * 'row'：每个姿态一个独立实例，横排（首页那排猫）
   * 'single'：一个实例里装下全部姿态，靠 morph 换（预览页的舞台）
   */
  layout?: "row" | "single";
  /** 要哪几只（顺序即排列顺序） */
  poses?: string[];
  /**
   * 姿态 → 骨架 SVG 文本。不给就用宿主那套（`src/data/catArt.ts`，Vite `?raw` 同步取文本）。
   * 留这个口是为了「几何从哪来」可替换：换成运行时 fetch、从编辑器里读、按主题给不同几何，
   * 都只动调用方，引擎一行不用改。
   */
  art?: (pose: string) => string;
  /** 取景框：stage 有跳跃用的头顶余量；thumb 更矮（列表用） */
  frame?: "stage" | "thumb";
  /** 是否响应悬停/点击 */
  interactive?: boolean;
  theme?: ThemeMode;
  colors?: CatColors;
  /** 覆盖任意动作参数（★ 工艺参数见下方 CONFIG） */
  config?: DeepPartial<CatConfig>;
  /** 每帧回调（只从主实例回调一次）——给读数/调试用，引擎自己不碰 UI */
  onFrame?: (info: RenderInfo) => void;
}

export interface CatMotionHandle {
  readonly instances: CatInstance[];
  readonly config: CatConfig;
  /** 换主题（重新给色层上色 + 换点缀色） */
  setTheme: (mode: ThemeMode) => void;
  setBpm: (bpm: number) => void;
  setSpeed: (speed: number) => void;
  setPlaying: (playing: boolean) => void;
  /** 定格检视开关 */
  setReview: (review: Review | null) => void;
  /** 换姿态（只有 layout:'single' 有意义） */
  setPose: (pose: string) => void;
  /**
   * 让她演一个动作，不给参数 = 原地跳一步（睡着的猫自动换成「惊醒」——同一套动作库按性格挑）。
   * who：实例下标，或姿态名；不给 = 第一个实例（row 布局里就是最左边那只，想点第几只给第几只）。
   */
  trigger: (kind?: "jump" | "perk" | "startle", who?: number | string) => void;
  /** 立刻重绘一帧（改完参数想马上看到，别等下一帧） */
  refresh: () => void;
  destroy: () => void;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/* ═══════════════════════════ ★★★ 调参区 ★★★ ═══════════════════════════
   ★ = 最常调的。站点级开关（首页要不要、几只、多大）在 src/config/site.config.ts
   的 `cats` 块里；这里只管「动作怎么演」。 */
export const CAT_CONFIG = {
  bpm: 96,            // ★ 节拍：听歌/唱歌的踩拍与嘴张合都跟它走
  speed: 1,           // ★ 全局速度倍率（1 / 0.5 / 0.25：慢放看间距）
  theme: "light" as ThemeMode,
  review: null as Review | null,

  volumeGain: 0.72,   // ★ 体积守恒：sy 变 → sx = 1-(sy-1)*volumeGain

  // ★ 呼吸：周期与幅度**每只不同**（同一套代码，节奏即性格）
  idle: {
    listen: { period: 2.7, ampY: 0.026 },
    sing: { period: 2.1, ampY: 0.032 },
    sleep: { period: 4.4, ampY: 0.020 },
    curl: { period: 3.8, ampY: 0.023 },
  } as Record<string, { period: number; ampY: number }>,
  // ★ 踩拍（只在跟拍的两只身上）：sink 下压 / rise 回弹 / up 上浮位移（×身体高）
  beat: {
    listen: { gain: 0.55, sink: 0.050, rise: 0.034, up: 0.050 },
    sing: { gain: 1.00, sink: 0.078, rise: 0.048, up: 0.080 },
  } as Record<string, { gain: number; sink: number; rise: number; up: number } | undefined>,
  // ★ 睡觉猫的不定时抽动（发生时刻由稳定哈希决定，可重复）
  twitch: { minGap: 2.4, maxGap: 4.2, jolt: 0.022, rot: 0.9 },

  // ★ 跳跃：语义阶段表（秒）
  jump: {
    settle: 0.10, anticipation: 0.20, launch: 0.06, air: 0.56, impact: 0.07, recover: 0.34,
    crouch: 0.15,      // 预备下蹲的挤压量
    height: 0.22,      // 跳跃高度（×身体高）
    drift: 0.30,       // 一次跳跃的最大水平行程（×身体高）—— 朝你点的方向跳
    maxTravel: 0.55,   // ★ 归位点能离开原点多远（×身体高）：可以走一段，但不会走出画面
    hangK: 0.45,       // 顶点滞留（0=匀速抛物线；越大顶点停越久）
    stretchK: 0.13,    // 速度 → 纵向拉伸
    impactK: 0.20,     // 落地挤压（由入速驱动）
    maxLean: 9,        // 朝行进方向倾斜上限（度）
    scale: { listen: 1.0, sing: 1.0, curl: 0.75, sleep: 1.0 } as Record<string, number>,
  },

  // ★ 抬身（悬停/单独检视）：预备微沉 → 抬起 → 保持 → 离开时过冲回落
  perk: {
    prep: 0.09, rise: 0.20, release: 0.28,
    lift: 0.085,       // 抬起高度（×身体高）
    stretch: 0.05,     // 抬起时的纵向拉伸
    prepK: 0.30,       // 预备微沉比例
    leanMax: 5,        // 朝指针倾斜上限（度）
    gain: { listen: 1.0, sing: 0.9, curl: 0.55, sleep: 0.45 } as Record<string, number>,
  },

  // ★ 换姿态：挤压 → 在挤压最低点换掉画面 → 过冲弹出（poof 遮蔽）
  morph: { prep: 0.17, release: 0.24, settle: 0.30, squash: 0.11, overshoot: 0.055 },

  // ★ 惊醒（睡觉猫被点，不是跳 —— 性格化的替代动作）
  startle: { dur: 0.62, jolt: 0.055, rot: 2.2, drop: 0.04 },

  // ★ 次级动作（音符 / Zzz）：循环上浮，各件错开相位 = 跟随与重叠
  loop: {
    notes: { period: 1.5, rise: 0.20, arc: 0.055, fadeIn: 0.25, fadeOut: 0.35, scale: 0.22 },
    zzz: { period: 2.2, rise: 0.26, arc: 0.075, fadeIn: 0.28, fadeOut: 0.45, scale: 0.26 },
  },
  // 滞后采样量（秒）—— 次级动作的拖尾/重叠
  lag: { notes: 0.085, zzz: 0.11, mic: 0.06, eyes: 0.03, mouth: 0.0 } as Record<string, number>,
  burst: { k: 0.55, decay: 5.5, up: -0.30 },       // 落地/惊醒把次级件震散

  // ★ 嘴：唱歌跟拍张合；听歌轻轻跟着哼
  mouth: {
    sing: { open: 1.12, close: 0.42 },
    listen: { open: 1.42, close: 0.96 },
  } as Record<string, { open: number; close: number }>,
  // ★ 眯眼：踩拍/落地的反作用（原画画的就是眯眼，所以做「眯得更紧」而不是眨眼）
  eyes: { beat: 0.10, impact: 0.75, perk: 0.25 },
  // ★ 麦克风：随身体滞后摆动 + 被气流顶得微颤
  mic: { wobble: 1.8, beatK: 1.1, scaleY: 0.03 },

  dustDur: 0.38,      // 缀：落地扬尘时长
  poofDur: 0.34,      // 缀：换姿态 poof 环时长
  // ★ 缀的尺寸一律用**身体高的比例**给（舞台单位在屏幕上只有零点几像素，写死数字必然看不见）
  fx: {
    shadow: { rx: 0.42, ry: 0.055, op: 0.20, shrink: 0.34, fade: 0.55 },
    dust: { stroke: 0.034, spread: 0.30, lift: 0.030, grow: 1.5, tilt: 14, op: 0.75 },
    poof: { r: 0.058, r0: 0.10, r1: 0.62, op: 0.85 },
  },
};

/** 缀的默认色（浅底灰 / 深底灰 + 蓝）——站点用站点令牌覆盖，见 siteConfig.cats */
export const CAT_COLORS: CatColors = {
  light: { fx: "#a9aeb8", fx2: "#0071e3" },
  dark: { fx: "#7d848f", fx2: "#0a84ff" },
  baseDark: "#000000",
};

export type CatConfig = typeof CAT_CONFIG;

/* ═══════════════════════════ 数值工具 ═══════════════════════════ */
const N = CATS.targetBodyH;   // 190：一切幅度都以「身体高」为单位
const NSD = "http://www.w3.org/2000/svg";
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const L = (a: number, b: number, p: number) => a + (b - a) * p;
const easeIn = (p: number) => p * p;
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
/** 阻尼振荡：闭式收敛，回弹/余韵用（不是物理模拟，不依赖上一帧） */
const settle = (p: number, freq: number, decay: number) =>
  p >= 1 ? 0 : Math.exp(-decay * p) * Math.cos(2 * Math.PI * freq * p);
/** 稳定伪随机：同一 n 永远同一值（渲染可重复，绝不用 Math.random） */
const hash01 = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const TR = (x: number, y: number, r: number, sx: number, sy: number) =>
  `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${r.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})`;
const TP = (px: number, py: number, sx: number, sy: number, r: number) =>
  !r && Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4
    ? ""
    : `translate(${px.toFixed(2)} ${py.toFixed(2)}) rotate(${r.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${(-px).toFixed(2)} ${(-py).toFixed(2)})`;
function mk<T extends keyof SVGElementTagNameMap>(tag: T, attrs: Record<string, string | number>) {
  const e = document.createElementNS(NSD, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/* ═══════════════════════════ 共享时钟 ═══════════════════════════
   一页可能有多个引擎实例（首页那一排猫）。**循环只跑一个**，每个实例自己记时间：
   · 共用一条 rAF ⇒ 不会 N 个循环抢帧；
   · t 各自推进 ⇒ 每块都能单独暂停/慢放，首页暂停不会影响别处；
   · 新挂上的实例把 t 对齐到「已经过去多久」⇒ 拍子对得上（一排猫才是同一个乐队的） */
const HANDLES = new Set<HandleState>();
let rafId = 0;
let lastNow = 0;
let elapsed = 0;          // 模块级累计（秒，不受任何实例的速度影响）

function loop(now: number) {
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
  lastNow = now;
  elapsed += dt;
  for (const h of HANDLES) h.tick(dt);
  rafId = HANDLES.size ? requestAnimationFrame(loop) : 0;
}
function startLoop() {
  if (!rafId) rafId = requestAnimationFrame(loop);
}

type HandleState = {
  t: number;
  playing: boolean;
  tick: (dt: number) => void;
};

/* ═══════════════════════════ 引擎主体 ═══════════════════════════ */

/**
 * 默认的几何来源：宿主那张「姿态 → SVG 文本」表。
 * 缺姿态时**大声报错** —— 几何外置成文件之后，忘了配（或生成器加了姿态没跟着补导入）
 * 比以前更容易发生，而 `innerHTML = undefined` 是「猫静默消失、控制台一声不吭」的那种错。
 */
function defaultArt(pose: string): string {
  const svg: string | undefined = CAT_ART[pose as keyof typeof CAT_ART];
  if (!svg) {
    throw new Error(
      `[catMotion] 没有姿态 "${pose}" 的骨架 SVG。可选：${Object.keys(CAT_ART).join(" / ")}` +
      "。新增姿态请在 src/data/catArt.ts 里补一行导入（几何文件由生成器 --svg 产出）。",
    );
  }
  return svg;
}

export function createCatMotion(host: HTMLElement, opts: CatMotionOpts = {}): CatMotionHandle {
  const cfg: CatConfig = mergeConfig(CAT_CONFIG, opts.config);
  const colors: CatColors = { ...CAT_COLORS, ...opts.colors };
  const layout = opts.layout ?? "row";
  const frame = opts.frame ?? (layout === "single" ? "stage" : "thumb");
  const poses = opts.poses ?? CATS.order;
  const art = opts.art ?? defaultArt;
  const interactive = opts.interactive ?? true;
  cfg.theme = opts.theme ?? cfg.theme;
  const VIEWBOX = frame === "stage" ? CATS.vbStage : CATS.vbThumb;
  /* viewBox 拆成数字：宽高要写回 svg 的 width/height 属性（见 buildPose 的说明） */
  const [, , VBW, VBH] = VIEWBOX.split(/\s+/).map(Number);

  /* ── 由阶段表派生的常量（只依赖 cfg ⇒ 建实例时算一次） ── */
  const JUMP_T = () => ({
    settle: cfg.jump.settle, anticipation: cfg.jump.anticipation, launch: cfg.jump.launch,
    air: cfg.jump.air, impact: cfg.jump.impact, recover: cfg.jump.recover,
  });
  const sum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);
  const jumpDur = () => sum(JUMP_T());
  const perkDur = () => cfg.perk.prep + cfg.perk.rise;
  const morphDur = () => cfg.morph.prep + cfg.morph.release + cfg.morph.settle;
  const ACTDUR: Record<Action["kind"], number> = {
    jump: jumpDur(), perk: perkDur(), morph: morphDur(), startle: cfg.startle.dur,
  };
  /* 动作里的关键事件时刻（相对动作起点）—— 扬尘/poof/落地结算都由它派生 */
  const jumpImpactAt = () =>
    cfg.jump.settle + cfg.jump.anticipation + cfg.jump.launch + cfg.jump.air;

  const instances: CatInstanceState[] = [];
  const t: { v: number } = { v: 0 };

  /* ═════════ 动作：纯函数（全部只读 cfg，不读上一帧） ═════════ */
  function phaseAt(u: number, table: Record<string, number>) {
    let acc = 0;
    for (const k of Object.keys(table)) {
      const d = table[k];
      if (u < acc + d) return { name: k, p: (u - acc) / d, t0: acc, dur: d };
      acc += d;
    }
    return { name: "done", p: 1, t0: acc, dur: 0 };
  }
  /** 滞空：时间重映射 —— 两端快、顶点慢（顶点滞留 = 夸张 + 强调视野里的目的地） */
  const hangRemap = (p: number) => p + (cfg.jump.hangK * Math.sin(2 * Math.PI * p)) / (2 * Math.PI);
  /** 竖直：抛物线（重力本形）。-1 = 顶点，0 = 地面 */
  function airY(p: number) {
    const u = hangRemap(clamp(p, 0, 1));
    return -4 * u * (1 - u);
  }

  /**
   * ★ 跳跃：一次求值给出所有通道；形变由主运动的速度派生，不是每条通道各配一条曲线。
   * travel = 本次跳跃的水平**行程**（舞台单位，带符号），在**点击那一刻**算好。
   * 滞空末 (p=1) 时 dx 正好等于 travel ⇒ 落地瞬间把归位点挪到目的地，位移**连续**（不会弹回）。
   */
  function jumpState(u: number, travel: number) {
    const J = cfg.jump, H = J.height * N, D = travel;
    const ph = phaseAt(u, JUMP_T());
    const o = { dy: 0, dx: 0, s: 1, rot: 0, phase: ph.name, impact: 0 };
    const dp = 1 / 180;
    /* 入速：从纯轨迹函数里解析采样（顶点滞留改了它也会跟着变 ⇒ 冲击永远对得上） */
    const vIn = Math.abs((airY(1) - airY(1 - dp)) / dp) / 4;
    if (ph.name === "anticipation") {                 // 预备：蹲（慢入慢出），方向与随后的动作相反
      const e = easeInOut(ph.p);
      o.s = 1 - J.crouch * e;
      o.dy = J.crouch * N * 0.34 * e;
    } else if (ph.name === "launch") {                // 起跳：挤压→拉伸的瞬间切换（刻意的不连续）
      const e = easeOutCubic(ph.p);
      o.s = L(1 - J.crouch, 1.10, e);
      o.dy = L(J.crouch * N * 0.34, -N * 0.04, e);
    } else if (ph.name === "air") {                   // 滞空：弧线 + 顶点滞留
      const p = ph.p, v = (airY(p + dp) - airY(p - dp)) / (2 * dp) / 4;
      o.dy = H * airY(p);
      o.dx = D * hangRemap(p);
      o.s = 1 + J.stretchK * clamp(Math.abs(v), 0, 1.15) * (v < 0 ? 1 : 0.85);   // 上冲比下落拉得更长
      o.rot += J.maxLean * 0.6 * Math.sign(D || 0) * clamp(Math.abs(v), 0, 1.15) / 1.15;
    } else if (ph.name === "impact") {                // 落地：挤压强度由入速决定
      const e = easeOut(ph.p);
      o.impact = 1;
      o.s = L(1 - J.impactK * clamp(vIn / 1.45, 0.4, 1.2), 1, e);
    } else if (ph.name === "recover") {               // 回弹：阻尼收敛
      o.s = 1 + 0.06 * settle(ph.p, 1.25, 5.5);
      o.dy = -N * 0.012 * settle(ph.p, 1.6, 6.0);
    }
    return o;
  }

  /** ★ 抬身：单通道 e —— 进入带预备微沉，离开带过冲 */
  function perkIn(u: number) {
    const P = cfg.perk;
    if (u < 0) return 0;
    if (u >= P.prep + P.rise) return 1;
    const p = u / (P.prep + P.rise);
    if (p < 0.32) return -P.prepK * Math.sin((Math.PI * p) / 0.32);   // 先微沉（预备）
    return easeOut((p - 0.32) / 0.68);
  }
  function perkOut(u: number) {
    const P = cfg.perk;
    if (u < 0) return 1;
    const p = clamp(u / P.release, 0, 1);
    return 1 - easeOut(p) + 0.10 * settle(p, 1.4, 5.0);               // 过冲后收敛
  }

  /** ★ 换姿态：挤压到最低点换画面 → 过冲弹出 → 收敛（poof 遮蔽交接处） */
  const morphSwapAt = () => cfg.morph.prep / morphDur();
  function morphState(u: number) {
    const M = cfg.morph, p = clamp(u / morphDur(), 0, 1);
    if (p < morphSwapAt()) {
      const e = easeIn(p / morphSwapAt());
      return { s: 1 - M.squash * e, dy: M.squash * N * 0.30 * e, swapped: false };
    }
    const q = (p - morphSwapAt()) / (1 - morphSwapAt());
    if (q < 0.42) {
      const e = easeOutCubic(q / 0.42);
      return { s: 1 + M.overshoot * e, dy: -N * 0.035 * e, swapped: true };
    }
    const e = (q - 0.42) / 0.58;
    return {
      s: 1 + M.overshoot * (1 - easeInOut(e)) + 0.045 * settle(e, 1.2, 5.0),
      dy: -N * 0.035 * (1 - easeInOut(e)),
      swapped: true,
    };
  }

  /** ★ 惊醒：抽一下 → 压回 → 慢慢呼出一口气 */
  function startleState(u: number) {
    const S = cfg.startle, p = clamp(u / S.dur, 0, 1);
    if (p < 0.16) {
      const e = easeOut(p / 0.16);
      return { s: 1 + S.jolt * e, dy: -N * 0.05 * e, rot: S.rot * e };
    }
    if (p < 0.34) {
      const e = easeInOut((p - 0.16) / 0.18);
      return { s: 1 + S.jolt - (S.jolt + S.drop) * e, dy: -N * 0.05 * (1 - e), rot: S.rot * (1 - e) };
    }
    const e = (p - 0.34) / 0.66;
    return { s: 1 - S.drop * (1 - easeInOut(e)) + 0.03 * settle(e, 1.1, 4.0), dy: 0, rot: 0 };
  }

  /** ★ 踩拍：每拍「沉—弹—稳」。脉冲取**环绕距离** ⇒ 拍与拍之间连续，不会跳变 */
  function beatCurve(p: number) {
    const d = Math.abs(p), w = Math.min(d, 1 - d);
    const down = Math.exp(-Math.pow(w / 0.085, 2));               // 拍点：下压
    const up = Math.exp(-Math.pow((p - 0.28) / 0.16, 2));         // 拍后：回弹
    const rest = settle(p, 1.15, 5.0) * 0.22;                     // 收尾余韵
    return { s: -down + 1.05 * up + rest, y: down - 1.45 * up - rest * 0.8 };
  }
  const beatAt = (time: number, id: string) => {
    const b = cfg.beat[id];
    if (!b) return null;
    const beat = (time * cfg.bpm) / 60;
    return beatCurve(beat - Math.floor(beat));
  };

  /** ★ 睡觉猫的抽动：周期与相位都由稳定哈希决定（无参数化随机，渲染可重复） */
  function twitchCurve(time: number, seed: number) {
    const G = cfg.twitch;
    const T = G.minGap + hash01(seed) * (G.maxGap - G.minGap);
    const idx = Math.floor(time / T), local = time / T - idx;
    const at = 0.2 + hash01(idx * 7.3 + seed) * 0.55;
    const d = local - at;
    if (d < 0 || d > 0.22) return { s: 0, rot: 0 };
    const g = Math.exp(-Math.pow((d - 0.05) / 0.05, 2));
    return { s: g * (hash01(idx * 3.1) > 0.5 ? 1 : -1), rot: g * (hash01(idx * 5.7) > 0.5 ? 1 : -1) };
  }

  /* ═════════ 主状态 ═════════ */
  /** 取当前在演的动作：正常状态读实例上的动作；定格检视时由滑块位置反算出一个等价动作 */
  function currentAct(inst: CatInstanceState, time: number): Action | null {
    const r = cfg.review;
    if (r && inst.reviewTarget) {
      /* 定格检视固定不横移：这样逐帧比较时只有竖直方向的变化，间距看得清 */
      const base = { t0: time - r.p * ACTDUR[r.act], from: inst.pose, review: true as const };
      if (r.act === "morph") return { kind: "morph", ...base, to: r.pose };
      if (r.act === "jump") return { kind: "jump", ...base, travel: 0 };
      return { kind: r.act, ...base };
    }
    return inst.action;
  }

  /**
   * ★ 归位点：猫在台上站的位置（舞台单位，只做水平移动）。
   * 它**不是每帧累加出来的状态**：由「上次落点 + 本次动作是否已过落地点」直接算出 ⇒ 仍可定格复算。
   * 跳跃：过落地时刻的那一帧起，归位点直接换成目的地（此时 dx 正好归 0 ⇒ 合位移连续）。
   * 换姿态：挤压最深处换画面时顺手回正（那一瞬画面正被 poof 盖住，且各姿态身宽不同、必须重新居中）。
   */
  function homeOffset(inst: CatInstanceState, act: Action | null, time: number) {
    if (!act) return inst.off;
    if (act.review) return 0;              // 定格检视：回正中线，逐帧比较只看竖直变化
    const u = time - act.t0;
    if (act.kind === "jump") return inst.off + (u >= jumpImpactAt() ? act.travel : 0);
    if (act.kind === "morph") return morphState(u).swapped ? 0 : inst.off;
    return inst.off;                       // 抬身 / 惊醒：原地
  }
  const clampOff = (v: number) => clamp(v, -cfg.jump.maxTravel * N, cfg.jump.maxTravel * N);
  /** 结算归位点：把当前动作已经走到的那部分归位**落成静态值**（幂等，可重复调） */
  const settleHome = (inst: CatInstanceState) => {
    inst.off = clampOff(homeOffset(inst, inst.action, t.v));
  };

  const PRIN = {
    jump: {
      anticipation: ["预备", "挤压与拉伸", "慢入慢出"],
      launch: ["挤压与拉伸", "夸张", "时间节奏"],
      air: ["弧线", "跟随与重叠", "时间节奏"],
      impact: ["挤压与拉伸", "夸张", "舞台感"],
      recover: ["慢入慢出", "实体感"],
    } as Record<string, string[]>,
  };

  /** bodyMotion：只算**身体**的整体运动（不含部件）；部件靠对它做延迟采样来拖尾 */
  function bodyMotion(inst: CatInstanceState, time: number, id: string, act: Action | null, off: number): BodyAcc {
    const o: BodyAcc = {
      dy: 0, dx: off || 0, rot: 0, s: 1, lean: 0, impact: 0, phase: "呼吸", principles: null,
      sx: 1, sy: 1,
    };
    const pure = !!(act && act.review);

    /* 1) 呼吸（时间节奏 / 生命力）—— 四只周期不同 */
    if (!pure) {
      const br = cfg.idle[id], ph = (time / br.period) * Math.PI * 2;
      o.s *= 1 + br.ampY * Math.sin(ph);
      o.dy += -br.ampY * N * 0.38 * Math.sin(ph);
      o.phase = "呼吸"; o.principles = ["时间节奏", "生命力"];
    }
    /* 2) 踩拍（预备 / 挤压与拉伸 / 时间节奏）—— 只跟拍的两只 */
    if (!pure) {
      const b = cfg.beat[id], c = beatAt(time, id);
      if (b && c) {
        o.s *= 1 + b.sink * b.gain * c.s;
        o.dy += b.up * N * b.gain * c.y;
        if (!o.principles) { o.phase = "踩拍"; o.principles = ["预备", "挤压与拉伸", "时间节奏"]; }
      }
    }
    /* 3) 抽动（睡觉猫） */
    if (!pure && id === "sleep") {
      const w = twitchCurve(time, inst.seed);
      if (w.s) { o.s *= 1 + cfg.twitch.jolt * w.s; o.rot += cfg.twitch.rot * w.rot; }
    }
    /* 4) 悬停抬身（注意力 / 吸引力）—— 与动作叠加，不互相打架 */
    if (!pure) {
      const e = (inst.hover ? perkIn(time - inst.tIn) : perkOut(time - inst.tOut)) * (cfg.perk.gain[id] ?? 1);
      if (e !== 0) {
        o.dy += -cfg.perk.lift * N * e;
        o.s *= 1 + cfg.perk.stretch * e;
        o.lean = e;
        o.phase = e < 0 ? "预备" : "抬身";
        o.principles = e < 0 ? ["预备", "挤压与拉伸"] : ["慢入慢出", "吸引力"];
      }
      if (inst.pointer != null && e > 0) {
        /* 跟指针偏头：同样以身宽为基准（指到身体边缘 = 偏到上限） */
        const half = Math.max(CATS.data[id].bodyW * 0.5, N * 0.42);
        o.rot += clamp(inst.pointer / (half * 1.6), -1, 1) * cfg.perk.leanMax * e;
      }
    }
    /* 5) 动作（跳跃 / 抬身 / 换姿态 / 惊醒） */
    if (act) {
      const u = time - act.t0;
      if (act.kind === "jump") {
        const j = jumpState(u, act.travel);
        o.dy += j.dy; o.dx += j.dx; o.s *= j.s; o.rot += j.rot; o.impact = j.impact;
        const map: Record<string, string> = {
          anticipation: "预备", launch: "起跳", air: "滞空", impact: "落地", recover: "回弹",
        };
        o.phase = map[j.phase] || o.phase;
        o.principles = map[j.phase] ? PRIN.jump[j.phase] : o.principles;
      } else if (act.kind === "perk") {
        /* 抬身本来只由悬停驱动；单独成一个动作是为了能把它定格出来看间距 */
        const e = perkIn(u) * (cfg.perk.gain[id] ?? 1);
        o.dy += -cfg.perk.lift * N * e;
        o.s *= 1 + cfg.perk.stretch * e;
        o.lean = e;
        o.phase = u < perkDur() ? "抬身" : "保持";
        o.principles = ["慢入慢出", "吸引力"];
      } else if (act.kind === "morph") {
        const m = morphState(u);
        o.dy += m.dy; o.s *= m.s; o.swapped = m.swapped;
        o.phase = m.swapped ? "出壳" : "换姿态 · 挤压";
        o.principles = m.swapped ? ["挤压与拉伸", "夸张"] : ["预备", "变形", "遮蔽"];
      } else if (act.kind === "startle") {
        const s = startleState(u);
        o.dy += s.dy; o.s *= s.s; o.rot += s.rot;
        const early = u < cfg.startle.dur * 0.34;
        o.phase = early ? "惊醒" : "落回去睡";
        o.principles = early ? ["预备", "舞台感", "吸引力"] : ["慢入慢出", "吸引力"];
      }
    }
    /* 6) 体积守恒：纵向形变 → 横向反向（Solid Drawing） */
    o.sy = o.s;
    o.sx = 1 - (o.s - 1) * cfg.volumeGain;
    return o;
  }

  /** ★ 次级动作：全部**由主运动派生**（延迟采样）+ 各自循环，没有一条独立状态 */
  function partsMotion(inst: CatInstanceState, time: number, body: BodyAcc, id: string, act: Action | null, off: number) {
    const c = CATS.data[id], out: Record<string, unknown[]> = {};
    /* 部件变换写在 <g.norm> 里面 ⇒ 用**该姿态的原始单位**：身体高换算回原始坐标。
       幅度本身仍按身体高的比例给，所以四只猫视觉上一致。 */
    const NO = c.bodyH;
    /* ★ 主运动的 dx/dy 是**舞台单位**，而部件变换用的是**原始单位**，差一个 scale
       ⇒ 拖尾量必须除回去，否则身宽占比不同的四只猫拖尾幅度差好几倍。 */
    const KU = 1 / c.scale;
    const pure = !!(act && act.review);        // 定格检视：只留对主动作的滞后，去掉跟拍
    const beatOf = () => (pure ? null : beatAt(time, id));
    /* 落地/惊醒的冲击：向外向上炸开，指数衰减（由事件时刻派生，不是随机） */
    let burst = 0;
    if (act) {
      const hit = act.kind === "jump" ? act.t0 + jumpImpactAt() : act.kind === "startle" ? act.t0 : null;
      if (hit != null) {
        const dt = time - hit;
        if (dt >= 0 && dt < 1) burst = Math.exp(-dt * cfg.burst.decay);
      }
    }
    const lagOf = (d: number) => {
      if (!d) return { dx: 0, dy: 0, s: 0 };
      /* 两次采样传**同一个 off** ⇒ 归位点被抵消：站着不动的时候不会因为曾经跳过一次就一直拖尾 */
      const b = bodyMotion(inst, time - d, id, null, off);
      return { dx: (b.dx - body.dx) * KU, dy: (b.dy - body.dy) * KU, s: b.s - body.s };
    };

    for (const name of Object.keys(c.parts)) {
      const arr = c.parts[name];
      const lag = lagOf(cfg.lag[name] ?? 0.08);
      const items: Record<string, number>[] = [];
      if (name === "notes" || name === "zzz") {              // 循环上浮 + 弧线 + 淡入淡出
        const L0 = cfg.loop[name];
        arr.forEach((_e, i) => {
          const off2 = (i * L0.period) / arr.length;         // 每件错开相位 = 跟随与重叠
          const p = ((time + off2) / L0.period) % 1, eo = easeOut(p);
          items.push({
            dx: eo * L0.arc * NO + lag.dx * 1.35,
            dy: -eo * L0.rise * NO + lag.dy * 1.25 + cfg.burst.up * NO * burst * (0.4 + 0.18 * i),
            sx: 1, sy: 1 + L0.scale * Math.sin(Math.PI * p), rot: 0,
            op: Math.min(1, p / L0.fadeIn) * (1 - clamp((p - (1 - L0.fadeOut)) / L0.fadeOut, 0, 1)),
          });
        });
      } else if (name === "eyes") {                          // 眯眼：由踩拍与落地反推
        const bc = beatOf();
        const sq = (bc ? clamp(-bc.s, 0, 1) : 0) * cfg.eyes.beat
          + body.impact * cfg.eyes.impact + Math.max(0, body.lean) * cfg.eyes.perk;
        arr.forEach(() => items.push({
          dx: 0, dy: 0, sx: 1 + sq * 0.12, sy: 1 - clamp(sq, 0, 1.2) * 0.30, rot: 0, op: 1,
        }));
      } else if (name === "mouth") {                         // 嘴：唱歌跟拍张合（枢轴在上唇 ⇒ 往下张）
        const m = cfg.mouth[id] ?? cfg.mouth.listen;
        const bc = beatOf();
        const open = bc ? clamp(-bc.s, 0, 1) : 0;
        const amt = clamp(m.close + (m.open - m.close) * open, 0.05, 2);
        arr.forEach(() => items.push({ dx: 0, dy: 0, sx: 1 + (1 - amt) * 0.30, sy: amt, rot: 0, op: 1 }));
      } else if (name === "mic") {                           // 麦克风：随身体滞后摆动 + 微颤
        const bc = beatOf();
        const b = bc ? clamp(-bc.s, 0, 1) : 0;
        const amt = 1 + cfg.mic.scaleY * b;
        arr.forEach(() => items.push({
          dx: 0, dy: 0, sx: 1, sy: amt,
          rot: cfg.mic.wobble * (lag.s * 6 + lag.dx * 0.05) + cfg.mic.beatK * b * 0.35, op: 1,
        }));
      }
      if (items.length) out[name] = items;
    }
    return out;
  }

  /* ═════════ 主题换色 ═════════ */
  /* 与描摹验收页同一口径：base 层 → 背后的底色；其余层保色相、翻明度（别用简单明度取反） */
  const hex2rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255);
  function rgb2hsl(r: number, g: number, b: number) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h: number;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hsl2rgb(h: number, s: number, l: number) {
    if (!s) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t: number) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  const toHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("");
  const toDark = (col: string, role: string) => {
    if (role === "base") return colors.baseDark;
    const [r, g, b] = hex2rgb(col), [h, s, l] = rgb2hsl(r, g, b);
    return toHex(...(hsl2rgb(h, Math.min(1, s * 1.02), 0.16 + (1 - l) * 0.72) as [number, number, number]));
  };
  function paint(inst: CatInstanceState, pose: string) {
    const cache = inst.cache[pose], dark = cfg.theme === "dark";
    for (const g of cache.layers) {
      g.setAttribute("fill", dark ? toDark(g.dataset.col || "#000000", g.dataset.role || "") : g.dataset.col || "#000000");
    }
    const pal = dark ? colors.dark : colors.light;
    cache.fx.style.setProperty("--fx", pal.fx);
    cache.fx.style.setProperty("--fx2", pal.fx2);
  }
  const paintAll = () => instances.forEach((i) => Object.keys(i.svg).forEach((p) => paint(i, p)));

  /* ═══════════════════════════ 渲染 ═══════════════════════════ */
  function render(inst: CatInstanceState, time: number): RenderInfo {
    const act = currentAct(inst, time);
    /* 换姿态时：挤压到最低点前显示旧画面，之后显示新画面（交接藏进挤压里） */
    let show = inst.pose;
    if (act && act.kind === "morph") {
      show = morphState(time - act.t0).swapped ? act.to : act.from;
    }
    /* 归位点每帧只算一次，body 与部件的延迟采样共用同一个值 ⇒ 静止时不会有残留拖尾 */
    const off = homeOffset(inst, act, time);
    const body = bodyMotion(inst, time, show, act, off);
    const parts = partsMotion(inst, time, body, show, act, off);

    for (const [pose, svg] of Object.entries(inst.svg)) {
      const on = pose === show;
      svg.parentElement!.classList.toggle("on", on);
      if (!on) continue;
      /* 水平拆两截：静态归位点给 home（影子和身体一起搬），动态的那部分给 rig
         ⇒ 落地的挤压/旋转永远绕**脚下**发生，不会因为站得远而绕到原点去 */
      inst.home[pose].setAttribute("transform", `translate(${off.toFixed(2)} 0)`);
      inst.rig[pose].setAttribute("transform", TR(body.dx - off, body.dy, body.rot, body.sx, body.sy));
      const cache = inst.cache[pose];
      const items = parts as Record<string, { sx: number; sy: number; rot: number; op?: number }[]>;
      for (const [name, list] of Object.entries(items)) {
        (cache.parts[name] || []).forEach((p, i) => {
          const m = list[i];
          if (!m || !p.el) return;
          p.el.setAttribute("transform", TP(p.px, p.py, m.sx, m.sy, m.rot));
          p.el.style.opacity = m.op == null ? "" : m.op.toFixed(3);
        });
      }
      /* 点缀：投影随高度收缩、落地扬尘、换姿态 poof（全部由主运动/事件派生，尺寸按身体高） */
      const FX = cfg.fx;
      const lift = clamp(-body.dy / (N * 0.5), 0, 1.4);
      /* 影子跟着猫的水平位置走（头顶光 ⇒ 影子就在脚下）；缩得越小 = 离地越高 */
      cache.shadow.setAttribute("transform", `translate(${(body.dx - off).toFixed(2)} 0)`);
      cache.shadow.setAttribute("rx", (FX.shadow.rx * N * (1 - FX.shadow.shrink * lift)).toFixed(1));
      cache.shadow.setAttribute("ry", (FX.shadow.ry * N * (1 - FX.shadow.shrink * 0.8 * lift)).toFixed(1));
      cache.shadow.style.opacity = (FX.shadow.op * (1 - FX.shadow.fade * lift)).toFixed(3);
      const dT = act && act.kind === "jump" ? time - (act.t0 + jumpImpactAt()) : 9;
      cache.dust.forEach((d) => {
        if (dT < 0 || dT > cfg.dustDur) { d.el.style.opacity = "0"; return; }
        const e = dT / cfg.dustDur, k = easeOutCubic(e), g = 1 + FX.dust.grow * (1 - e);
        const ca = Math.cos(d.a);
        /* 向外喷 + 抬升（抬升按 sin(a)：两端的粒子最贴地）；越靠外越躺平 = 尘落地 */
        d.el.setAttribute("transform",
          `translate(${(ca * FX.dust.spread * N * k).toFixed(1)} `
          + `${(-FX.dust.lift * N * Math.sin(d.a) * Math.sin(Math.PI * e)).toFixed(1)}) `
          + `rotate(${(d.sgn * FX.dust.tilt * (1 - k)).toFixed(1)}) scale(${g.toFixed(3)} ${g.toFixed(3)})`);
        d.el.style.opacity = (FX.dust.op * (1 - e)).toFixed(3);
      });
      const pT = act && act.kind === "morph" ? time - (act.t0 + cfg.morph.prep) : 9;
      cache.poof.forEach((p) => {
        if (pT < 0 || pT > cfg.poofDur) { p.el.style.opacity = "0"; return; }
        const e = pT / cfg.poofDur, k = easeOutCubic(e);
        const R = (FX.poof.r0 + (FX.poof.r1 - FX.poof.r0) * k) * N;
        p.el.setAttribute("cx", (Math.cos(p.a) * R).toFixed(1));
        p.el.setAttribute("cy", (-N * 0.45 + Math.sin(p.a) * R * 0.9).toFixed(1));
        p.el.setAttribute("r", (FX.poof.r * N * (1 - 0.6 * e)).toFixed(2));
        p.el.style.opacity = (FX.poof.op * (1 - e) * (1 - e)).toFixed(3);
      });
    }
    return { body, show, act };
  }

  /* ═══════════════════════════ 建一个姿态的画面 ═══════════════════════════ */
  function makeInstance(el: HTMLDivElement, pose: string, poseList: string[], reviewTarget: boolean): CatInstanceState {
    const inst: CatInstanceState = {
      el, pose, poses: poseList, svg: {}, rig: {}, home: {}, cache: {}, bound: {},
      action: null, off: 0, hover: false, tIn: -99, tOut: -99, pointer: null,
      /* 种子取**姿态名**的稳定哈希（不是自增序号）⇒ 顺序变了抽动节奏也不会串 */
      seed: hash01(pose.length * 7.3 + pose.charCodeAt(0)) * 10 + 1,
      reviewTarget, clickable: interactive,
    };
    for (const p of poseList) buildPose(inst, p);
    return inst;
  }

  /** 一个姿态的画面：色层全塞进 <g.rig>（整体形变作用在它上面）+ <g.fx>（额外画的点缀）；
      两者再一起装进 <g.home> —— 归位点（猫在台上站哪儿）只作用在这一层，影子/扬尘自然跟着走。
      几何文本由 `art(pose)` 给（默认来自 src/data/catArt.ts 的 `?raw` 导入）。 */
  function buildPose(inst: CatInstanceState, pose: string) {
    if (inst.svg[pose]) return inst.svg[pose];
    const div = document.createElement("div");
    div.className = "pose";
    div.innerHTML = art(pose);
    const svg = div.firstElementChild as SVGSVGElement;
    svg.setAttribute("viewBox", VIEWBOX);
    /* ★ 顺手把 width/height 也改成 viewBox 的尺寸。原图自带的尺寸（如 308×318）
       与取景框比例不同，留着它会让「宽 100% + 高 auto」的用法里外差 2.6%
       （intrinsic ratio 取属性值，内容再按 meet 缩进框里 ⇒ 白边上下一圈）。
       两处对齐之后，按宽布局、按高布局都严丝合缝。 */
    svg.setAttribute("width", String(VBW));
    svg.setAttribute("height", String(VBH));
    /* 画面根：骨架 SVG 的根是 <g class="norm">（原始坐标 → 舞台坐标的归一化层），
       整组搬进 .rig ⇒ 归一化变换原样保留、几何一字不动 */
    const roots = [...svg.children] as SVGGElement[];
    const home = document.createElementNS(NSD, "g");
    home.setAttribute("class", "home");
    const rig = document.createElementNS(NSD, "g");
    rig.setAttribute("class", "rig");
    roots.forEach((c) => rig.appendChild(c));
    home.appendChild(rig);
    const fx = document.createElementNS(NSD, "g");
    fx.setAttribute("class", "fx");
    home.appendChild(fx);
    svg.appendChild(home);
    inst.el.appendChild(div);
    inst.svg[pose] = svg;
    inst.rig[pose] = rig;
    inst.home[pose] = home;
    /* ★ 色层要**按 data-layer 找**，不能拿 svg.children 当色层用：
       svg.children 只给到那一个 .norm 组，而 data-col 在它底下的四个层上 ⇒
       主题换色会写在没有 data-col 的组上、**静默失效**（深色下猫还是白身子，
       跟"身体融进背景、只剩亮线"的设计正好相反，而且不报错）。 */
    const layers = [...svg.querySelectorAll<SVGGElement>("[data-layer]")];

    const parts: PoseCache["parts"] = {};
    for (const [name, arr] of Object.entries(CATS.data[pose].parts)) {
      /* 数据里只给 data-p 列表；枢轴现读 SVG 自己的 data-px/data-py —— 一处真相 */
      parts[name] = arr.map((p) => {
        const el = svg.querySelector(`[data-p="${p}"]`) as SVGElement;
        return { el, px: +el.dataset.px!, py: +el.dataset.py! };
      });
    }
    const DUST_N = 7, POOF_N = 12;
    const FX = cfg.fx;
    const shadow = mk("ellipse", {
      class: "shadow", cx: 0, cy: 0.02 * N, rx: FX.shadow.rx * N, ry: FX.shadow.ry * N,
    });
    fx.appendChild(shadow);
    const dust: PoseCache["dust"] = [], poof: PoseCache["poof"] = [];
    for (let i = 0; i < DUST_N; i++) {
      /* a 从 0 扫到 π：贴地的半圈。喷出的方向与「伸展量」都由 cos(a) 给 ⇒ 左右天然对称 */
      const a = (i / (DUST_N - 1)) * Math.PI;
      const sgn = Math.cos(a) >= 0 ? 1 : -1;
      /* 小弧线要**分左右两版**：只翻位置不翻形状的话，整片尘土会全往一边喷 */
      const el = mk("path", {
        class: "dust", "stroke-width": FX.dust.stroke * N,
        d: sgn > 0
          ? `M0 0 q ${0.07 * N} ${-0.055 * N} ${0.17 * N} ${-0.06 * N}`
          : `M0 0 q ${-0.07 * N} ${-0.055 * N} ${-0.17 * N} ${-0.06 * N}`,
      });
      fx.appendChild(el); dust.push({ el, a, sgn });
    }
    for (let i = 0; i < POOF_N; i++) {
      const a = (i / POOF_N) * Math.PI * 2;
      const el = mk("circle", { class: "poof", cx: 0, cy: 0, r: FX.poof.r * N });
      fx.appendChild(el); poof.push({ el, a });
    }
    inst.cache[pose] = { layers, fx, shadow, dust, poof, parts };
    paint(inst, pose);
    return svg;
  }

  /* ═════════ 交互（指针事件绑在**这只猫自己的盒子**上） ═════════ */
  function bind(inst: CatInstanceState) {
    if (inst.bound.c) return;
    inst.bound.c = true;
    const shownSvg = () => inst.svg[inst.pose] || Object.values(inst.svg)[0];
    /* 屏幕坐标 → 舞台坐标。**不用再做任何平移**：svg 的 viewBox 就是舞台坐标系
       （vbStage 的 x/y 只是它的原点，不是需要减掉的偏移 —— 减了就等于把每个点击右移 172）。
       注意取的是当前可见的那张图：换姿态后可见的 svg 换了，CTM 也得跟着换。 */
    const toStage = (ev: PointerEvent | MouseEvent) => {
      const svg = shownSvg();
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      return pt.matrixTransform(svg.getScreenCTM()!.inverse());
    };
    /* 点击位置 → 一次跳跃的行程。
       基准取「猫**当前**站的归位点 + 这只猫自己的半身宽」：
       · 用身宽而不是全局 bodyH —— 四只猫的舞台身宽 172~286 差很多，
         拿 bodyH 当基准会变成「窄的一碰就满、宽的怎么点都不满」，方向感就废了；
       · 减去 inst.off —— 猫跳到别处之后再点它**本身**，应该还是原地跳，
         而不是「相对画面中线的一侧」把它继续往同一边推。
       目的地先夹在 maxTravel 内再反算行程 ⇒ 落地即归位，且永远不会走出画面。 */
    const travelTo = (x: number, pose: string) => {
      const half = Math.max(CATS.data[pose].bodyW * 0.5, N * 0.42);
      const want = clamp((x - inst.off) / half, -1, 1) * (cfg.jump.scale[pose] ?? 1);
      return clampOff(inst.off + want * cfg.jump.drift * N) - inst.off;
    };
    const startleOrJump = (dirX: number | null) => {
      settleHome(inst);
      if (inst.pose === "sleep") {
        /* 睡着的猫被点是「惊醒」而不是跳 —— 同一套动作库，按性格选一个 */
        inst.action = { kind: "startle", t0: t.v, from: inst.pose };
        return;
      }
      inst.action = {
        kind: "jump", t0: t.v - cfg.jump.settle, from: inst.pose,
        travel: dirX == null ? 0 : travelTo(dirX, inst.pose),
      };
    };
    inst.el.addEventListener("pointerenter", (e) => {
      inst.hover = true; inst.tIn = t.v;
      inst.pointer = inst.clickable ? toStage(e).x : null;
    });
    inst.el.addEventListener("pointerleave", () => { inst.hover = false; inst.tOut = t.v; inst.pointer = null; });
    if (!inst.clickable) return;
    inst.el.addEventListener("pointermove", (e) => { inst.pointer = toStage(e).x; });
    inst.el.addEventListener("click", (e) => {
      /* 已经在滞空中就不再受理：猫离着地还远，从旧落点重新起跳会瞬间弹回去。
         落地之后（impact / recover）可以接着点 —— 起点就是当前落点，接得很顺。 */
      if (inst.action && inst.action.kind === "jump" && t.v - inst.action.t0 < jumpImpactAt()) return;
      startleOrJump(toStage(e).x);
    });
  }

  /* ═════════ 主循环 ═════════ */
  function tick(dt: number) {
    if (playingState.v) t.v += dt * cfg.speed;
    let primary: { inst: CatInstanceState; out: RenderInfo } | null = null;
    for (const inst of instances) {
      /* 动作演完就卸掉（跳跃/换姿态/惊醒都是有始有终的）；卸的同时把归位点**结算**下来 */
      if (inst.action) {
        const a = inst.action, u = t.v - a.t0;
        let done = false;
        if (a.kind === "morph") {
          if (u >= morphDur()) { inst.pose = a.to; done = true; }
        } else if (u > ACTDUR[a.kind]) done = true;
        if (done) { settleHome(inst); inst.action = null; }
      }
      const out = render(inst, t.v);
      if (inst.reviewTarget && !primary) primary = { inst, out };
    }
    if (primary) opts.onFrame?.(primary.out);
  }

  /* ═════════ 组装 DOM ═════════
     每只猫的盒子 = 命中区（指针事件挂在它身上）。`data-clickable` 是给页面 CSS 用的：
     能点的时候给个手型光标 —— 不然没人会知道这几只猫可以点（引擎不注入样式）。 */
  if (layout === "single") {
    const el = document.createElement("div");
    el.className = "cat";
    el.dataset.pose = poses[0];
    if (interactive) el.dataset.clickable = "";
    host.appendChild(el);
    const inst = makeInstance(el, poses[0], poses, true);
    instances.push(inst);
    bind(inst);
  } else {
    for (const p of poses) {
      const el = document.createElement("div");
      el.className = "cat";
      el.dataset.pose = p;
      if (interactive) el.dataset.clickable = "";
      host.appendChild(el);
      const inst = makeInstance(el, p, [p], false);
      instances.push(inst);
      bind(inst);
    }
  }

  const playingState = { v: true };
  /** 换姿态：只对 layout:'single' 有意义（row 布局每只只有自己那一个姿态） */
  function setPose(pose: string) {
    if (layout !== "single") return;
    const inst = instances[0];
    if (pose === inst.pose || !inst.svg[pose]) return;
    /* 换姿态前先把「上一个动作没结算完的归位点」落成静态值，新的 morph 才有干净的起点 */
    settleHome(inst);
    inst.action = { kind: "morph", t0: t.v, from: inst.pose, to: pose };
    inst.svg[pose].classList.add("on");
  }

  /** 让某只猫演一个动作（不给参数 = 原地跳一步）。who：下标或姿态名，默认第一只 */
  function trigger(kind: "jump" | "perk" | "startle" = "jump", who: number | string = 0) {
    const inst = typeof who === "number"
      ? instances[who]
      : instances.find((i) => i.pose === who);
    if (!inst) return;
    /* 先把上一个动作没结算的归位点落成静态值，新动作才有干净的起点 */
    settleHome(inst);
    /* 睡着的猫不吃「跳」这一套：同一套动作库，按性格挑一个（更可信 = 实体感） */
    const k = kind === "jump" && inst.pose === "sleep" ? "startle" : kind;
    inst.action = k === "jump"
      /* 点击起跳才需要踩那 0.10s 的 settle，从键盘/代码点一下就直接从预备开始 */
      ? { kind: "jump", t0: t.v - cfg.jump.settle, from: inst.pose, travel: 0 }
      : { kind: k, t0: t.v, from: inst.pose };
  }

  const handle: CatMotionHandle = {
    instances,
    config: cfg,
    setTheme(mode) { cfg.theme = mode; paintAll(); },
    setBpm(bpm) { cfg.bpm = bpm; },
    setSpeed(speed) { cfg.speed = speed; },
    setPlaying(p) { playingState.v = p; },
    setReview(r) { cfg.review = r; },
    setPose,
    trigger,
    refresh() { for (const inst of instances) render(inst, t.v); },
    destroy() {
      HANDLES.delete(state);
      for (const inst of instances) inst.el.remove();
      instances.length = 0;
    },
  };
  const state: HandleState = { t: 0, playing: true, tick };
  /* 新挂上来的实例把时间对齐到「已经过去多久」⇒ 拍子对得上（一排猫才是同一个乐队的） */
  t.v = elapsed;
  HANDLES.add(state);
  startLoop();
  return handle;
}

/* ═══════════════════════════ 配置合并 ═══════════════════════════ */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
/** 深合并：只认普通对象，数组与 null 直接替换 */
function mergeConfig(base: CatConfig, over?: DeepPartial<CatConfig>): CatConfig {
  if (!over) return { ...base };
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    const cur = out[k];
    out[k] = isPlainObject(v) && isPlainObject(cur) ? mergeAny(cur, v) : v;
  }
  return out as CatConfig;
}
function mergeAny(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = isPlainObject(v) && isPlainObject(cur) ? mergeAny(cur, v) : v;
  }
  return out;
}
