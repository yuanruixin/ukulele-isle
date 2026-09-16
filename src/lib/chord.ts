import type { ChordConfig } from "../config/site.config";

/**
 * 和弦 → 谱 / 图 的派生逻辑。
 *
 * 单一数据源是 siteConfig.chords.items：指法图和试听谱都从这里派生，
 * 所以「图上画的」和「耳朵听到的」永远一致。
 */

/** alphaTab 的 MIDI 时基：960 tick = 一个四分音符 */
const TICKS_PER_QUARTER = 960;

/** 试听把和弦写成一个全音符（4 拍），所以余音时长 = 4 拍 */
const BEATS_PER_WHOLE = 4;

/** 图上至少画 4 个品位 */
const MIN_FRET_BANDS = 4;

/**
 * 扫弦顺序（返回 frets 数组下标，按发声先后）。
 * 物理下扫 = 从 4 弦扫到 1 弦，也就是数组里从后往前；不弹的弦跳过。
 * 与 alphaTex 里的 `{bd}`（BrushDown）保持一致——实测 alphaTab 的 Down 变体正是 4弦→1弦。
 */
export function strumOrder(frets: number[]): number[] {
  const order: number[] = [];
  for (let i = frets.length - 1; i >= 0; i--) {
    if (frets[i] >= 0) order.push(i);
  }
  return order;
}

/**
 * 图上要画的品位窗口。
 * 前 4 品放得下就直接从 1 品画起；指法更高时取「最高品往上数 4 品」的窗口，
 * 并在图左侧标出起始品（startFret > 1 时才有意义）。
 */
export function fretWindow(frets: number[]): {
  startFret: number;
  bands: number;
} {
  const highest = Math.max(0, ...frets);
  if (highest <= MIN_FRET_BANDS) {
    return { startFret: 1, bands: MIN_FRET_BANDS };
  }
  return { startFret: highest - MIN_FRET_BANDS + 1, bands: MIN_FRET_BANDS };
}

export interface ChordPlaybackOptions {
  /** 四根弦扫完的总跨度（毫秒） */
  strumSpreadMs: number;
  /** 余音时长（秒） */
  ringSeconds: number;
  /** 调弦（alphaTex 写法，高音弦在前） */
  tuning: string;
  /** 试听音色（GM 音色号，0 基）。不写的话 alphaTab 默认 25 钢弦吉他，尤克里里会偏尖 */
  instrument: number;
}

/** 试听用的速度：把和弦写成一个全音符撑满一小节，于是「余音时长」直接决定速度 */
export function tempoForRing(ringSeconds: number): number {
  return (BEATS_PER_WHOLE * 60) / Math.max(0.5, ringSeconds);
}

/**
 * 扫弦的时值换算。
 *
 * ⚠️ alphaTab 内部是 `brushIncrement = floor(brushDuration / (弦数 - 1))`，
 * 所以 brushDuration 太小（例如官方默认的 .25）对 4 根弦会被截断成 0，等于没有扫弦；
 * 而实际每根弦的间隔永远是「(弦数-1) 的整数倍 tick」。这里把这层换算集中在一处，
 * 让谱面和图上的点亮节奏用的是同一组数字。
 */
export function strumTiming(
  stringCount: number,
  { strumSpreadMs, ringSeconds }: Pick<ChordPlaybackOptions, "strumSpreadMs" | "ringSeconds">,
): { tempo: number; brushDuration: number; stepMs: number } {
  const steps = Math.max(1, stringCount - 1);
  const tempo = tempoForRing(ringSeconds);
  const msPerTick = 60000 / tempo / TICKS_PER_QUARTER;
  const brushDuration = Math.max(
    steps,
    Math.round(strumSpreadMs / msPerTick),
  );
  const stepMs = Math.floor(brushDuration / steps) * msPerTick;
  return { tempo, brushDuration, stepMs };
}

/**
 * 由和弦指法生成一段可直接 `api.tex()` 的 alphaTex。
 *
 * 三个容易踩的点（都在 1.8.4 上实测过）：
 * 1. 和弦必须用括号包成一个 beat，否则每个音会被当成独立的四分音符依次弹响；
 * 2. beat 效果（`{bd N}`）必须写在音符**后面**——解析顺序是 `:时值 → 音符 → .附点 → *倍数 → {效果}`；
 * 3. `\instrument` **有位置要求**：必须落在 `.`（元数据段结束）之后、`\tuning` 之前才生效。
 */
export function chordTex(
  chord: ChordConfig,
  { strumSpreadMs, ringSeconds, tuning, instrument }: ChordPlaybackOptions,
): string {
  const { tempo, brushDuration } = strumTiming(chord.frets.length, {
    strumSpreadMs,
    ringSeconds,
  });

  const notes = chord.frets
    .map((fret, i) => (fret < 0 ? null : `${fret}.${i + 1}`))
    .filter((n): n is string => n !== null);

  return [
    `\\tempo ${Math.round(tempo)}`,
    ".",
    `\\instrument ${instrument}`,
    `\\tuning ${tuning}`,
    "\\ts 4 4",
    // bd = BrushDown（4弦→1弦），参数是刷弦时长（tick）；音符本身是全音符，决定余音
    `:1 (${notes.join(" ")}) {bd ${brushDuration}}`,
  ].join("\n");
}
