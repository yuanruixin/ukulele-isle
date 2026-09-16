import { fretWindow, strumOrder } from "../../lib/chord";

/**
 * 和弦指法图（自绘 SVG）。
 *
 * 版式按尤克里里和弦图的通行习惯：**最左是 4 弦（G），最右是 1 弦（A）**，
 * 而 left/right 的映射来自 siteConfig 里「高音弦在前」的 frets 数组，
 * 所以横向位置要反过来算（见 xOf）。
 *
 * 扫弦点亮：每根弦的元素各带一个 transition-delay（按其在下扫顺序里的位置），
 * 激活时颜色依次变成 accent —— 不用定时器就能做出「扫过去」的观感。
 */

/** 弦间距 */
const SPACING = 24;
/** 一品的高度 */
const BAND = 24;
/** 网格左边距 */
const LEFT = 20;
/** 网格顶（琴枕）的 y */
const GRID_TOP = 26;
/** 画布宽 / 高（viewBox 单位） */
const VB_W = 112;
const VB_H = 130;
/** 圆点半径 */
const DOT_R = 8.5;
/** 空弦 / 闷音标记所在行的 y */
const MARKER_Y = 13;

interface Props {
  /** 各弦品位，高音弦在前（-1 = 不弹） */
  frets: number[];
  /** 各弦手指编号，与 frets 一一对应（0 = 不按） */
  fingers: number[];
  /** 是否已激活（选中该和弦）：激活后颜色变为 accent */
  active?: boolean;
  /** 扫弦时每根弦之间的点亮间隔（ms） */
  revealStepMs?: number;
  /** 最大渲染宽度（px）；实际宽度跟着卡片走，窄屏自动缩小 */
  maxWidth?: number;
}

export default function ChordDiagram({
  frets,
  fingers,
  active = false,
  revealStepMs = 50,
  maxWidth = 132,
}: Props) {
  const count = frets.length;
  const { startFret, bands } = fretWindow(frets);
  const gridBottom = GRID_TOP + bands * BAND;

  /** 弦（frets 下标）→ 横向位置：最左 = 最后一根（4 弦） */
  const xOf = (i: number) => LEFT + (count - 1 - i) * SPACING;
  /** 品位（绝对值）→ 圆点中心 y */
  const yOf = (fret: number) =>
    GRID_TOP + (fret - startFret + 0.5) * BAND;

  /** 下扫顺序里每根弦的位置，用来算点亮延迟 */
  const playIndex = new Map(strumOrder(frets).map((i, order) => [i, order]));

  const dotFill = active ? "var(--accent)" : "var(--text)";
  const dotText = active ? "#ffffff" : "var(--card)";
  /** 颜色的过渡比点亮间隔略短，保证「一根接一根」而不是整片渐变 */
  const transition = "fill 140ms ease, stroke 140ms ease";

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-hidden
      style={{
        display: "block",
        width: "100%",
        // 显式写 aspect-ratio，避免依赖浏览器从 viewBox 推导固有比例
        aspectRatio: `${VB_W} / ${VB_H}`,
        maxWidth,
        height: "auto",
      }}
    >
      {/* 弦：竖线 */}
      {frets.map((_, i) => (
        <line
          key={`s${i}`}
          x1={xOf(i)}
          y1={GRID_TOP}
          x2={xOf(i)}
          y2={gridBottom}
          stroke="var(--tick)"
          strokeWidth={1}
        />
      ))}

      {/* 品：横线。最上面一条是琴枕，加粗 */}
      {Array.from({ length: bands + 1 }, (_, k) => {
        const y = GRID_TOP + k * BAND;
        const isNut = k === 0;
        return (
          <line
            key={`f${k}`}
            x1={LEFT - SPACING / 2}
            y1={y}
            x2={xOf(0) + SPACING / 2}
            y2={y}
            stroke={isNut && startFret === 1 ? "var(--text)" : "var(--border)"}
            strokeWidth={isNut && startFret === 1 ? 3 : 1}
          />
        );
      })}

      {/* 起始品标注：指法不在前 4 品时才需要 */}
      {startFret > 1 && (
        <text
          x={LEFT - SPACING / 2 - 4}
          y={yOf(startFret)}
          fontSize={10}
          textAnchor="end"
          dominantBaseline="central"
          fill="var(--text-secondary)"
        >
          {startFret}
        </text>
      )}

      {/* 弦顶标记：空弦○ / 闷音×，以及按弦圆点 */}
      {frets.map((fret, i) => {
        const x = xOf(i);
        // 过渡必须挂在实际图形上：`<g>` 上的 transition 不会作用到子元素
        const anim = { transition, transitionDelay: `${(playIndex.get(i) ?? 0) * revealStepMs}ms` };

        if (fret < 0) {
          // 不弹：画 ×
          const a = 3.4;
          return (
            <g key={`m${i}`}>
              <line
                x1={x - a}
                y1={MARKER_Y - a}
                x2={x + a}
                y2={MARKER_Y + a}
                stroke={dotFill}
                strokeWidth={1.6}
                strokeLinecap="round"
                style={anim}
              />
              <line
                x1={x + a}
                y1={MARKER_Y - a}
                x2={x - a}
                y2={MARKER_Y + a}
                stroke={dotFill}
                strokeWidth={1.6}
                strokeLinecap="round"
                style={anim}
              />
            </g>
          );
        }

        const finger = fingers[i] ?? 0;

        if (fret === 0) {
          // 空弦：○
          return (
            <circle
              key={`m${i}`}
              cx={x}
              cy={MARKER_Y}
              r={3.6}
              fill="none"
              stroke={dotFill}
              strokeWidth={1.6}
              style={anim}
            />
          );
        }

        // 按弦：实心圆点 + 手指编号
        return (
          <g key={`m${i}`}>
            <circle
              cx={x}
              cy={yOf(fret)}
              r={DOT_R}
              fill={dotFill}
              style={anim}
            />
            {finger > 0 && (
              <text
                x={x}
                y={yOf(fret)}
                fontSize={11}
                fontWeight={500}
                textAnchor="middle"
                dominantBaseline="central"
                fill={dotText}
                style={anim}
              >
                {finger}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
