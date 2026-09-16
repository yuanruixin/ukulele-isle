import { stringRowOrder, type UkeStringOrder } from "./ukulele";

/**
 * 键盘排布式键位映射 —— 把电脑键盘当成一块横放的指板。
 *
 * 为什么这么排：横放的指板是「弦 → 行、品 → 列」的网格，而键盘正好也是几行键横着排。
 * 把键盘的**物理行**对到指板的**弦**上，手指落在哪一格、指板上就响哪一格，
 * 不需要先「选弦」再「选品」——这是找音最快的一种映射。
 *
 *   ┌ 数字行 ─ 1 2 3 4 5 6 7 8 9 0 - =    →  12 键，最深到 11 品
 *   │ Q 行   ─ Q W E R T Y U I O P [ ]    →  12 键，到 11 品
 *   │ A 行   ─ A S D F G H J K L ; '      →  11 键，到 10 品
 *   └ Z 行   ─ Z X C V B N M , . /        →  10 键，到  9 品
 *                 （每行最左 = 空弦 0 品，向右递增）
 *
 *
 * 每行键数就是键盘上这一行真实有的键数（12 / 12 / 11 / 10，阶梯状），所以
 * **下面两行够不到最高几品**——这是物理限制，不是漏配。想按高把位就用鼠标点，
 * 或者把那个音换到靠上的弦上按。图例文案从这张表反推，改表自动跟着变。
 *
 * ⚠️ **哪一行对哪根弦是从弦序派生出来的，不写死**：第 0 行（键盘最上面）永远对到
 * 指板「从顶部数第一行」那根弦，而「谁在顶部」由 `siteConfig.uke.stringOrder` 决定
 * ——横置的上下一翻，键盘与指板的对应关系也要跟着翻，否则手指位置就对不上格子了。
 * 这也意味着**键位映射是按横置（宽屏）设计的**：竖置时指板是左右排的，
 * 键盘的行跟指板已经不同构，此时以「局部顶部那一行」为准。
 *
 * 用 `KeyboardEvent.code` 而不是 `key`：`code` 标的是**物理按键位置**，
 * 中文/日文等输入法或 Dvorak 布局下也不会错位。
 *
 * ⚠️ 与 siteConfig.uke.strings 一样，这里也用**配置侧的下标**：0 = 1 弦 A（高音弦在前）。
 */

export interface UkeKeyRowConfig {
  /** 物理行名（图例文案用），数组顺序 = 键盘从上到下 */
  rowLabel: string;
  /** 从左到右的键：`code` 是物理按键，`label` 是键帽上印的字 */
  keys: { code: string; label: string }[];
}

/**
 * 数字行（1 2 … 0 - =），12 个键。
 * ★ 空弦（0 品）落在**数字键「1」**上，键帽数字 = 品位数 + 1，好按也好记。
 *   不把 ` / ~ 算进来：它在数字行最左且又小又偏，和「第几个」对不上号。
 */
function digits(): { code: string; label: string }[] {
  return [
    ..."1234567890".split("").map((d) => ({ code: `Digit${d}`, label: d })),
    { code: "Minus", label: "-" },
    { code: "Equal", label: "=" },
  ];
}

function letters(chars: string): { code: string; label: string }[] {
  return chars.split("").map((c) => ({ code: `Key${c}`, label: c }));
}

/** 四行键，**从上到下**。故意不带弦号：对哪根弦由 `keyRowBindings()` 按弦序算出来 */
export const UKE_KEY_ROWS: UkeKeyRowConfig[] = [
  { rowLabel: "数字行", keys: digits() },
  {
    rowLabel: "Q 行",
    keys: [
      ...letters("QWERTYUIOP"),
      { code: "BracketLeft", label: "[" },
      { code: "BracketRight", label: "]" },
    ],
  },
  {
    rowLabel: "A 行",
    keys: [
      ...letters("ASDFGHJKL"),
      { code: "Semicolon", label: ";" },
      { code: "Quote", label: "'" },
    ],
  },
  {
    rowLabel: "Z 行",
    keys: [
      ...letters("ZXCVBNM"),
      { code: "Comma", label: "," },
      { code: "Period", label: "." },
      { code: "Slash", label: "/" },
    ],
  },
];

export interface UkeKeyRowBinding {
  /** 物理行名（键盘从上到下） */
  rowLabel: string;
  /** 这一行弹哪根弦（配置下标，0 = 1 弦 A） */
  stringIndex: number;
  /** 这一行最深能到第几品 */
  maxFret: number;
}

/**
 * 物理键行 → 弦的绑定（从上到下）。
 * 弦数少于键行数时，多出来的键行不绑（不会出现在结果里）。
 */
export function keyRowBindings(
  order: UkeStringOrder,
  stringCount: number,
): UkeKeyRowBinding[] {
  const rows = stringRowOrder(stringCount, order);
  const out: UkeKeyRowBinding[] = [];
  UKE_KEY_ROWS.forEach((row, r) => {
    const stringIndex = rows[r];
    if (stringIndex === undefined) return;
    out.push({ rowLabel: row.rowLabel, stringIndex, maxFret: row.keys.length - 1 });
  });
  return out;
}

/** 物理键 → 格子。键位与弦序无关（同一个键永远弹同一格「第几弦第几品」的相对位置） */
export function buildKeyMap(
  order: UkeStringOrder,
  stringCount: number,
): Record<string, { stringIndex: number; fret: number }> {
  const rows = stringRowOrder(stringCount, order);
  const lookup: Record<string, { stringIndex: number; fret: number }> = {};
  UKE_KEY_ROWS.forEach((row, r) => {
    const stringIndex = rows[r];
    if (stringIndex === undefined) return;
    row.keys.forEach((k, fret) => {
      lookup[k.code] = { stringIndex, fret };
    });
  });
  return lookup;
}
