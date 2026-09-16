/**
 * 音高检测与音名换算工具（尤克里里调音器用）
 */

export interface PitchResult {
  /** 基频（Hz） */
  freq: number;
  /** 置信度 0-1，越高代表周期越明显 */
  clarity: number;
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export interface NoteInfo {
  name: string;
  octave: number;
  /** 相对该十二平均律音高的偏差（cent，-50 ~ +50） */
  cents: number;
}

/**
 * 自相关法检测基频（针对 200-1000Hz 的尤克里里音域优化）
 * @param buf 时域采样（-1 ~ 1）
 * @param sampleRate 采样率
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  minFreq = 180,
  maxFreq = 1000,
): PitchResult | null {
  const n = buf.length;
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2));
  if (maxLag <= minLag) return null;

  // 去直流
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += buf[i];
  mean /= n;

  const x = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i += 1) {
    const v = buf[i] - mean;
    x[i] = v;
    energy += v * v;
  }
  const rms = Math.sqrt(energy / n);
  // 极低门限，只挡纯静音；灵敏度判断交给上层（便于在诊断面板里说明原因）
  if (rms < 0.0012) return null;

  const window = n - maxLag;
  if (window <= 0) return null;

  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag += 1) {
    let sum = 0;
    for (let i = 0; i < window; i += 1) sum += x[i] * x[i + lag];
    corr[lag] = sum / window;
  }
  const c0 = energy / n;
  if (c0 <= 0) return null;

  // 全局峰值
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (corr[lag] > corr[best]) best = lag;
  }
  if (corr[best] / c0 < 0.2) return null;

  // 从最小延迟开始找「第一个足够强的局部峰」，避免把泛音当基频（八度跳变）
  const threshold = corr[best] * 0.86;
  let peak = best;
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    if (
      corr[lag] >= threshold &&
      corr[lag] > corr[lag - 1] &&
      corr[lag] >= corr[lag + 1]
    ) {
      peak = lag;
      break;
    }
  }

  // 抛物线插值，细化峰值位置
  const y0 = corr[peak - 1];
  const y1 = corr[peak];
  const y2 = corr[peak + 1];
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = denom === 0 ? 0 : (y2 - y0) / denom;
  const lagRefined = peak + Math.max(-0.5, Math.min(0.5, shift));

  const freq = sampleRate / lagRefined;
  if (!Number.isFinite(freq) || freq < minFreq || freq > maxFreq) return null;

  return { freq, clarity: Math.max(0, Math.min(1, corr[peak] / c0)) };
}

/** 频率 → 十二平均律音名 */
export function freqToNote(freq: number): NoteInfo {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  return {
    name: NOTE_NAMES[((rounded % 12) + 12) % 12],
    octave: Math.floor(rounded / 12) - 1,
    cents: Math.round((midi - rounded) * 100),
  };
}

/** 两频率间的音分差 */
export function centsBetween(freq: number, target: number): number {
  return 1200 * Math.log2(freq / target);
}

/**
 * 把实测频率按八度折叠到目标音附近（±半音内），
 * 这样弹高/低八度也能得到合理的偏差读数。
 */
export function foldToTarget(freq: number, target: number): number {
  let f = freq;
  let guard = 0;
  while (f < target * 0.7071 && guard < 8) {
    f *= 2;
    guard += 1;
  }
  while (f >= target * 1.4142 && guard < 8) {
    f /= 2;
    guard += 1;
  }
  return f;
}

/** 音分 → 通俗提示 */
export function centsHint(cents: number, tolerance: number): "low" | "high" | "in-tune" {
  if (Math.abs(cents) <= tolerance) return "in-tune";
  return cents < 0 ? "low" : "high";
}
