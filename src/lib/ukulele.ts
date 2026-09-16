import type { UkeStringConfig } from "../config/site.config";
import { tempoForRing } from "./chord";

/**
 * 虚拟尤克里里的派生逻辑：音高换算 / 谱面生成 / 指板几何。
 *
 * 与和弦库同一套路子——**声音和画面从同一份配置派生**，所以图上点的那一格
 * 和耳朵听到的音永远对得上。
 *
 * ⚠️ 弦序方向（本项目最容易录反的地方，两套编号正好相反）：
 *   - **配置 / 指法数据 / alphaTex**：高音弦在前，下标 0 = 1 弦 A、3 = 4 弦 G；
 *     谱面里写 `fret.string`，string 1 就是 `\tuning` 里的第一根（a4 = A）。
 *   - **alphaTab 解析出来的 Note.string**：1 = **最低**的那根（4 弦 G），
 *     与上一套是反的。`stringIndexFromNote()` 负责这一次翻转。
 */

const SHARP_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

const NATURAL_PITCH: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** 音名 → 音级（0-11）。支持 # / b，够写调弦里的常见写法 */
function pitchClassOf(name: string): number {
  let pc = NATURAL_PITCH[name[0]?.toUpperCase() ?? "C"] ?? 0;
  for (const ch of name.slice(1)) {
    if (ch === "#") pc += 1;
    else if (ch === "b") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

export interface UkeNote {
  /** 音名（一律用升号记，如 C#） */
  name: string;
  octave: number;
  /** MIDI 音高（C4 = 60） */
  midi: number;
  /** 十二平均律频率（Hz） */
  freq: number;
}

/** 某根弦某一品的音（fret = 0 是空弦）。弦下标同 strings 数组（0 = 1 弦 A） */
export function noteAt(stringCfg: UkeStringConfig, fret: number): UkeNote {
  const midi = (stringCfg.octave + 1) * 12 + pitchClassOf(stringCfg.note) + fret;
  return {
    name: SHARP_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    midi,
    freq: 440 * 2 ** ((midi - 69) / 12),
  };
}

/** 读数用的音名（如「A4」） */
export function noteLabel(note: UkeNote): string {
  return `${note.name}${note.octave}`;
}

export interface BoardTexOptions {
  /** 调弦（alphaTex 写法，高音弦在前） */
  tuning: string;
  /**
   * 试听音色（General MIDI 音色号，0 基）。
   * 不写的话 alphaTab 给的是 25 = 钢弦吉他，而尤克里里是尼龙弦——声音会明显偏尖。
   * 取值见 ★ `siteConfig.uke.instrument`。
   */
  instrument: number;
  /** 余音时长（秒） */
  ringSeconds: number;
  /** 指板到第几品 */
  frets: number;
  /** 弦数（尤克里里 = 4） */
  stringCount: number;
}

/**
 * 生成「整块指板」的 alphaTex：**每一格（某弦某品）一个小节，里面一个全音符**。
 *
 * 为什么这么做：单音用 `api.playNote(note)` 触发（见 useUkulelePlayer），
 * 它需要真实的 Note 对象。一次性把全部格子交给 alphaTab 解析好，之后拨弦只是
 * 从缓存里取一个 Note 打出去——**不换谱、不重算 MIDI，点下去就响**。
 *
 * 为什么是「一小节一个音」：`MidiFileGenerator.generateSingleNote()` 取
 * `beat.playbackDuration` 当这个音的长度，所以想让余音长就必须写成全音符；
 * 而一个小节塞不下第二个全音符，只好一格一小节。小节数 = (品数+1) × 弦数。
 *
 * `\tempo` 由 ringSeconds 反推（同一个全音符撑满一小节），与和弦库的算法一致——
 * 于是**听到的余音时长 = 弦晃动的衰减时长**。
 *
 * 音色（`\instrument`）也在这里指定：alphaTab 不给就默认用 **25 = 钢弦吉他**，
 * 而尤克里里是尼龙弦，用钢弦音色会明显偏尖（见 ★ `siteConfig.uke.instrument`）。
 */
export function boardTex({
  tuning,
  instrument,
  ringSeconds,
  frets,
  stringCount,
}: BoardTexOptions): string {
  const tempo = Math.round(tempoForRing(ringSeconds));
  const bars: string[] = [];
  for (let fret = 0; fret <= frets; fret++) {
    for (let s = 1; s <= stringCount; s++) bars.push(`:1 ${fret}.${s}`);
  }

  return [
    `\\tempo ${tempo}`,
    ".",
    // 音色写在「进入 track 之后、\tuning 之前」这一段里才生效（1.8.4 实测：
    // 放在 \tempo 前面不行、放在小节之间也不行）
    `\\instrument ${instrument}`,
    `\\tuning ${tuning}`,
    "\\ts 4 4",
    "",
    `${bars.join(" |\n")} |`,
  ].join("\n");
}

/**
 * alphaTab 的 `Note.string`（1 = 最低音弦）→ 配置里的下标（0 = 1 弦 A，高音弦在前）。
 * 四根弦时：Note.string 4 → 0（A）、1 → 3（G）。
 */
export function stringIndexFromNote(noteString: number, stringCount: number): number {
  return stringCount - noteString;
}

/* ------------------------------------------------------------------ */
/* 指板几何：全部用指板坐标系的 SVG 单位，画图和命中判定共用同一组数字  */
/* ------------------------------------------------------------------ */

/** 弦间距（桌面默认；窄屏由 siteConfig.uke.rowGapMobile 传入更大的值） */
export const ROW_GAP = 40;
/** 弦名槽宽（横放时在左、竖放时在上） */
const GUTTER = 48;
/** 琴枕左侧的「空弦区」宽（点它弹空弦） */
const OPEN_W = 34;
/** 第 1 品宽 */
const FRET_W = 62;
/** 每往右一品宽度 ×该系数（≈ 2^(-1/12)，与真实品位比例一致，12 品处刚好剩一半） */
const FRET_RATIO = 0.9455;
/** 最后一品右侧的「系弦区」，让弦有段长度可以晃 */
const TAIL_W = 44;
/** 顶部留白（弦晃动要空间；实际取 max(该值, 半个弦距)，窄屏弦距大时不会被裁掉） */
const TOP_PAD = 26;
/** 品位编号的中心离指板下边缘的距离 */
export const FRET_NUM_OFFSET = 16;
/** 编号下方还要留的空白（12 号字的一半还多），再往下就是 viewBox 边缘了 */
const NUM_SPACE = 16;

/**
 * 指板朝向：
 * - `horizontal` 横放（默认）：琴枕在左、品位向右，弦自上而下 4 弦 G → 1 弦 A。
 * - `vertical` 竖放（移动端竖屏）：把横放的指板**顺时针转 90°**——琴枕在上、品位向下，
 *   4 弦 G 转到右边、1 弦 A 在左。也就是「把手机横过来就是横放的样子」，不是镜像，
 *   所以两端的肌肉记忆一致。
 */
export type BoardOrientation = "horizontal" | "vertical";

/**
 * 弦在指板上的堆叠顺序。
 *
 * ⚠️ **一个开关同时决定横置与竖置**——竖置只是把横置的指板顺时针转 90°，
 * 局部坐标的「上方」在竖置里转到**右边**，所以：
 *   - `"1-4"`：横置 上→下 = 1,2,3,4 弦（竖置 右→左 = 1,2,3,4，即 **4 弦在左、1 弦在右**）
 *   - `"4-1"`：横置 上→下 = 4,3,2,1 弦（竖置 **4 弦在右、1 弦在左**）
 *
 * `"1-4"` 与 TAB 谱的弦序一致：alphaTab 里 `getNoteLine(note) = 弦数 − note.string`，
 * 行号 0 是**最上面**那根线，而 `Note.string = 弦数` 对应 `\tuning` 的第一根 = 1 弦 A。
 * 于是 TAB 最上面那根线就是 1 弦（本项目 1 弦 A 同时也是音最高的那根）。
 */
export type UkeStringOrder = "1-4" | "4-1";

/** 指板每一行（从**局部顶部** → 底部）分别放哪根弦。数组下标是行号，值是弦下标（0 = 1 弦 A） */
export function stringRowOrder(
  stringCount: number,
  order: UkeStringOrder,
): number[] {
  return Array.from({ length: stringCount }, (_, i) =>
    order === "1-4" ? i : stringCount - 1 - i,
  );
}

export interface UkeBoardGeometry {
  width: number;
  height: number;
  /** 空弦区左边界 */
  openLeft: number;
  /** 琴枕（= 空弦区右边界） */
  nutX: number;
  /** 系弦区右边界（弦的终点） */
  tailRight: number;
  /** 指板（画底色那块）的上 / 下边缘：上下各留半个弦距给弦晃动 */
  boardTop: number;
  boardBottom: number;
  /** 每根弦的横线 y（下标同上，0 = 1 弦 A）。哪一根在上面由 `stringOrder` 决定 */
  rowY: number[];
  /** 实际用的弦间距（命中格高度 = 它） */
  rowGap: number;
  /** 品丝位置，长度 frets + 1：fretLines[0] = 琴枕，fretLines[k] = 第 k 品右侧的品丝 */
  fretLines: number[];
}

export function boardGeometry(
  stringCount: number,
  fretCount: number,
  rowGap: number = ROW_GAP,
  stringOrder: UkeStringOrder = "1-4",
): UkeBoardGeometry {
  // 弦晃动会往两侧甩出半个振幅，顶部留白至少要够半个弦距，否则最上面那根会被 viewBox 裁掉
  const topPad = Math.max(TOP_PAD, rowGap / 2);

  const nutX = GUTTER + OPEN_W;
  const fretLines: number[] = [nutX];
  let x = nutX;
  for (let k = 0; k < fretCount; k++) {
    x += FRET_W * FRET_RATIO ** k;
    fretLines.push(x);
  }
  const tailRight = x + TAIL_W;

  // 第 row 行（从局部顶部数）放哪根弦 —— 弦序开关只作用在这里
  const rowY: number[] = new Array(stringCount);
  stringRowOrder(stringCount, stringOrder).forEach((stringIndex, row) => {
    rowY[stringIndex] = topPad + row * rowGap;
  });

  // ⚠️ 用 min/max 而不是 rowY[0] / rowY[stringCount-1]：后者把「下标 0 在最下面」写死了，
  // 一旦翻转弦序就会把指板底边算到顶上去
  const boardTop = Math.min(...rowY) - rowGap / 2;
  const boardBottom = Math.max(...rowY) + rowGap / 2;

  return {
    width: tailRight + 10,
    // 指板底 + 品位编号那一条。**高度是竖置时的稀缺资源**，所以编号下面只留最基本的余量，
    // 不再多垫——多出来的空白会等比放大成手机上的一大块死区。
    height: boardBottom + FRET_NUM_OFFSET + NUM_SPACE,
    rowGap,
    openLeft: GUTTER,
    nutX,
    tailRight,
    boardTop,
    boardBottom,
    rowY,
    fretLines,
  };
}

/**
 * 指板几何 → 屏幕上的摆放方式。
 *
 * 竖放**不重算几何**，而是把整块指板当成一张图整体旋转：`boardGeometry()` 永远产出
 * 那一套「琴枕在左」的局部坐标，`transform` 把局部坐标搬到视图坐标里。好处是品丝、
 * 命中格、弦的波形路径全都只用写一遍（`<g>` 里的坐标一律是局部坐标），
 * 连浏览器的事件命中判定都是自动跟着 transform 走的。
 *
 * 局部 (x, y) → 视图：(H − y, x)，即 `translate(H 0) rotate(90)`。
 * 于是琴枕（x 最小）落在上边，4 弦（y 最小）落在右边。
 *
 * ⚠️ `<g>` 里的文字会跟着转 90°，需要就地反向旋转回来（见 Fretboard 的 `rotate` 用法）。
 */
export interface UkeBoardView {
  orientation: BoardOrientation;
  /** 最终 viewBox 的宽 / 高 */
  width: number;
  height: number;
  /** 竖放时给 `<g>` 用的 transform；横放为 undefined */
  transform?: string;
  /** 局部坐标 → 视图坐标（给需要单独定位的装饰用） */
  toView: (x: number, y: number) => { x: number; y: number };
}

export function boardView(
  geom: UkeBoardGeometry,
  orientation: BoardOrientation,
): UkeBoardView {
  if (orientation === "horizontal") {
    return {
      orientation,
      width: geom.width,
      height: geom.height,
      toView: (x, y) => ({ x, y }),
    };
  }
  const H = geom.height;
  return {
    orientation,
    width: geom.height,
    height: geom.width,
    transform: `translate(${H} 0) rotate(90)`,
    toView: (x, y) => ({ x: H - y, y: x }),
  };
}


/**
 * 按弦位置 → 弦被「掐住」的那个点。
 * 品 f 的音 = 手指按在第 f 根品丝上（f = 0 就是琴枕），所以
 * 只有这个点右侧的弦段在振动，左侧到琴枕那段是死的。
 */
export function stopX(geom: UkeBoardGeometry, fret: number): number {
  return geom.fretLines[Math.max(0, fret - 1)];
}

/** 某一格的中心 x（0 品 = 空弦区的中心），用来放拨弦反馈圈 */
export function cellCenterX(geom: UkeBoardGeometry, fret: number): number {
  if (fret <= 0) return (geom.openLeft + geom.nutX) / 2;
  return (geom.fretLines[fret - 1] + geom.fretLines[fret]) / 2;
}

/** 有品位记号的品（尤克里里通例：5 / 7 / 10 一个点，12 两个点） */
export const FRET_MARKERS = [5, 7, 10] as const;
export const FRET_MARKER_DOUBLE = 12;
