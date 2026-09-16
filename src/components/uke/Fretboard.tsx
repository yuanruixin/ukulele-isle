import { useEffect, useMemo, useRef, useState } from "react";
import type { UkeStringConfig } from "../../config/site.config";
import {
  boardGeometry,
  boardView,
  cellCenterX,
  FRET_MARKERS,
  FRET_MARKER_DOUBLE,
  FRET_NUM_OFFSET,
  noteAt,
  noteLabel,
  stopX,
  type BoardOrientation,
  type UkeStringOrder,
} from "../../lib/ukulele";
import { buildKeyMap } from "../../lib/ukeKeys";

/**
 * 虚拟尤克里里指板（自绘 SVG）。
 *
 * 四个要点：
 *
 * 1. **朝向**：横放时琴枕在左、品位向右变密（每品 ×0.9455 ≈ 2^(-1/12)，12 品处刚好
 *    剩一半，与真实品位比例一致）；竖放则是把同一块指板整体顺时针转 90°（琴枕在上）。
 *    **竖放不重算几何**，只用一层 `<g transform>` 把局部坐标搬过去，所以下面所有绘图
 *    坐标永远是「琴枕在左」那套。弦的堆叠顺序（横置的上下 = 竖置的左右）由
 *    `stringOrder` 一个开关管，见 lib/ukulele.ts。
 *
 * 2. **晃动是逐帧算出来的驻波，不用 CSS 动画**：弦被掐住的点（品位）到系弦处
 *    才振动，`sin` 分段形状在**拨弦点**起一个波腹，随时间做余弦振动、指数衰减
 *    （衰减时长 = 余音时长）。同一根弦再拨一次就重新起波。用 rAF 直接写 path 的
 *    `d`，所以「波的形状」和「掐在哪一品」都是真的，而不是一段固定动画。
 *
 * 3. **余音不叠加**：发声层是单音（见 useUkulelePlayer），所以这里也不做
 *    「多弦同时晃」的假象——一次只让被拨的那根弦晃，听到什么就看到什么。
 *
 * 4. **键盘排布式键位**：监听挂在 window 上（不用先点一下指板），键位表见 lib/ukeKeys。
 *    按下去即高亮 + 出声，所以「哪个键对应哪一格」是按一次就记住的，不需要背表。
 */

/** 振动采样段数：够密（看着是连续曲线）又不至于每帧算太多点 */
const SEGMENTS = 22;

/** 拨弦点在这段弦上的相对位置范围：贴边会让波腹难看，夹到中间一些 */
const PLUCK_U_MIN = 0.15;
const PLUCK_U_MAX = 0.85;

/** 余音包络的衰减系数：t = duration 时约剩 10%——晃到余音快结束才收住，
 *  太小（例如 3.4）半秒就看不见了，「晃动感」撑不满一个余音 */
const DECAY_FACTOR = 2.3;

interface Vibration {
  /** 拨弦时刻（performance.now） */
  at: number;
  /** 衰减总时长（毫秒） */
  duration: number;
  amplitude: number;
  /** 振动段（掐住点 → 系弦处） */
  x0: number;
  x1: number;
  /** 弦所在的 y */
  y: number;
  /** 拨弦点在振动段里的相对位置 */
  u0: number;
}

export interface PluckEvent {
  /** 每拨一次 +1，用来触发一次新的晃动 */
  id: number;
  stringIndex: number;
  fret: number;
}

interface Props {
  /** 四根弦，高音弦在前（下标 0 = 1 弦 A） */
  strings: UkeStringConfig[];
  /** 显示到第几品 */
  frets: number;
  /** 摆放方向：移动端竖屏传 "vertical"（琴枕在上） */
  orientation?: BoardOrientation;
  /** 弦的堆叠顺序（横置的上下 = 竖置的左右），见 lib/ukulele.ts 的 UkeStringOrder */
  stringOrder?: UkeStringOrder;
  /** 每根弦当前按住的位置（null = 还没弹过，不画按弦点） */
  held: (number | null)[];
  /** 最近一次拨弦 */
  pluck: PluckEvent | null;
  onPluck: (stringIndex: number, fret: number) => void;
  /** 弦晃动幅度（指板坐标单位） */
  wobbleAmplitude: number;
  /** 弦晃动频率（Hz，视觉频率） */
  wobbleHz: number;
  /** 余音时长（秒），即晃动衰减时长 */
  ringSeconds: number;
  /** 弦间距（窄屏传更大的值：指板按容器宽度等比缩放，间距不够大就点不准） */
  rowGap: number;
  /** 紧凑模式（窄屏）：弦名槽只留音名，不再写「N 弦」 */
  compact?: boolean;
}

/** 分段正弦形状：波腹落在拨弦点，两端固定为 0（弦被两头掐住） */
function pluckShape(u: number, u0: number): number {
  if (u <= 0 || u >= 1) return 0;
  return u < u0
    ? Math.sin((Math.PI * u) / u0)
    : Math.sin((Math.PI * (1 - u)) / (1 - u0));
}

export default function Fretboard({
  strings,
  frets,
  orientation = "horizontal",
  stringOrder = "1-4",
  held,
  pluck,
  onPluck,
  wobbleAmplitude,
  wobbleHz,
  ringSeconds,
  rowGap,
  compact = false,
}: Props) {
  const stringCount = strings.length;
  const geom = useMemo(
    () => boardGeometry(stringCount, frets, rowGap, stringOrder),
    [stringCount, frets, rowGap, stringOrder],
  );
  const view = useMemo(() => boardView(geom, orientation), [geom, orientation]);
  const vertical = view.orientation === "vertical";

  /** 键位表 → 格子。跟随弦序，翻转弦序时手指位置与格子的对应关系不变 */
  const keyMap = useMemo(
    () => buildKeyMap(stringOrder, stringCount),
    [stringOrder, stringCount],
  );

  /** 鼠标悬停的那一格 */
  const [hover, setHover] = useState<{ s: number; f: number } | null>(null);
  /** 键盘按下的那一格（松开不清，好让最后一格留着高亮） */
  const [cursor, setCursor] = useState<{ s: number; f: number } | null>(null);
  /** 真正高亮的那一格：鼠标优先，其次是键盘 */
  const active = hover ?? cursor;

  const vibRef = useRef<(Vibration | null)[]>([]);
  const vibratoRefs = useRef<(SVGPathElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  /** 晃动段的路径；没有振动时就是一条直线（静态段是 JSX 里的 <line>，掐弦点即它的终点） */
  const stringD = (i: number, vib: Vibration | null, t: number) => {
    const y = geom.rowY[i];
    if (!vib) {
      const stop = stopX(geom, held[i] ?? 0);
      return `M ${stop} ${y} L ${geom.tailRight} ${y}`;
    }

    const span = vib.x1 - vib.x0;
    // 指数衰减 × 余弦振动；再叠一点二次谐波，弦看着更「活」
    const envelope = Math.exp(-t / (vib.duration / DECAY_FACTOR));
    const w = (2 * Math.PI * wobbleHz * t) / 1000;
    const amp = vib.amplitude * envelope * (Math.cos(w) + 0.16 * envelope * Math.cos(2.4 * w));

    let d = `M ${vib.x0} ${y}`;
    for (let k = 1; k <= SEGMENTS; k++) {
      const u = k / SEGMENTS;
      const dy = amp * pluckShape(u, vib.u0);
      d += ` L ${(vib.x0 + span * u).toFixed(1)} ${(y + dy).toFixed(2)}`;
    }
    return d;
  };

  const tick = () => {
    const now = performance.now();
    let alive = false;
    for (let i = 0; i < stringCount; i++) {
      const vib = vibRef.current[i];
      const path = vibratoRefs.current[i];
      if (!vib || !path) continue;
      const t = now - vib.at;
      if (t >= vib.duration) {
        vibRef.current[i] = null;
        path.setAttribute("d", stringD(i, null, 0));
        continue;
      }
      alive = true;
      path.setAttribute("d", stringD(i, vib, t));
    }
    rafRef.current = alive ? requestAnimationFrame(tick) : null;
  };

  const startLoop = () => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  };

  // 拨一次弦 = 在这根弦上起一次振动
  useEffect(() => {
    if (!pluck) return;
    const { stringIndex: i, fret } = pluck;
    const x0 = stopX(geom, fret);
    const x1 = geom.tailRight;
    const u = (cellCenterX(geom, fret) - x0) / (x1 - x0);
    vibRef.current[i] = {
      at: performance.now(),
      duration: ringSeconds * 1000,
      amplitude: wobbleAmplitude,
      x0,
      x1,
      y: geom.rowY[i],
      u0: Math.min(PLUCK_U_MAX, Math.max(PLUCK_U_MIN, u)),
    };
    // 先把这一帧的波形画出来再进循环，避免「点下去先直一下」
    vibratoRefs.current[i]?.setAttribute("d", stringD(i, vibRef.current[i]!, 0));
    startLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluck?.id]);

  // 卸载时收掉循环
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  /** 回调放 ref 里，键盘监听就不用跟着每次渲染重挂 */
  const pluckRef = useRef(onPluck);
  pluckRef.current = onPluck;

  // 键盘排布式键位：挂在 window 上，进页面直接就能弹（不必先点一下指板）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 带修饰键的是浏览器/系统快捷键，不抢
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        setCursor(null);
        setHover(null);
        return;
      }
      // 长按不连发：合成器是单音，连发只会像卡带
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      const cell = keyMap[e.code];
      if (!cell || cell.fret > frets) return;
      e.preventDefault();
      setCursor({ s: cell.stringIndex, f: cell.fret });
      pluckRef.current(cell.stringIndex, cell.fret);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyMap, frets]);

  /** 每一格的可读标签（屏幕阅读器用） */
  const cellLabel = (i: number, f: number) => {
    const label = f === 0 ? "空弦" : `第 ${f} 品`;
    return `${strings[i].label}${label}，音 ${noteLabel(noteAt(strings[i], f))}`;
  };

  const rowHalf = geom.rowGap / 2;
  const boardTop = geom.boardTop;
  const boardBottom = geom.boardBottom;
  const bodyX = geom.fretLines[frets];

  /**
   * 弦名槽：横放在左边（上行是 4 弦 G，与 TAB 谱一致）；竖放转到上边、居中在各弦列上。
   * 窄屏 / 竖放都省掉「N 弦」那行，一格才够宽放得下。
   *
   * ⚠️ 文字**画在旋转组之外**，位置直接由 `view.toView()` 算成视图坐标——
   * 若放进组里，就必须既给视图坐标又要反向旋转，非常容易写错（而且看不出错在哪）。
   */
  const renderStringLabels = () =>
    strings.map((s, i) => {
      const p = view.toView(geom.openLeft - 12, geom.rowY[i]);
      const withNumber = !compact && !vertical;
      return (
        <g key={`label${i}`}>
          <text
            x={p.x}
            y={p.y - (withNumber ? 2 : 0)}
            fontSize={compact || vertical ? 15 : 12}
            fontWeight={600}
            textAnchor={vertical ? "middle" : "end"}
            dominantBaseline="central"
            fill="var(--text)"
          >
            {s.note}
          </text>
          {withNumber && (
            <text
              x={p.x}
              y={p.y + 11}
              fontSize={9}
              textAnchor="end"
              dominantBaseline="central"
              fill="var(--text-secondary)"
            >
              {s.id} 弦
            </text>
          )}
        </g>
      );
    });

  /** 品位编号：横放写在该品区域的下方（一条横排），竖放转到左侧（一列） */
  const renderFretNumbers = () =>
    Array.from({ length: frets }, (_, k) => {
      const p = view.toView(
        (geom.fretLines[k] + geom.fretLines[k + 1]) / 2,
        boardBottom + FRET_NUM_OFFSET,
      );
      return (
        <text
          key={`num${k}`}
          x={p.x}
          y={p.y}
          fontSize={compact || vertical ? 12 : 10}
          textAnchor="middle"
          dominantBaseline="central"
          fill={active?.f === k + 1 ? "var(--accent)" : "var(--text-secondary)"}
        >
          {k + 1}
        </text>
      );
    });

  const svgStyle: React.CSSProperties = vertical
    ? {
        // 竖屏：**先按宽度撑满**，高度由比例算出来，超出可用高度时交给 maxHeight。
        // SVG 默认 preserveAspectRatio="xMidYMid meet"，被压扁的只是外框，
        // 图形本身等比缩放并居中——比自己算一个 min() 尺寸稳，也不怕横竖屏抖动。
        display: "block",
        width: "100%",
        height: "auto",
        maxHeight: "100%",
        aspectRatio: `${view.width} / ${view.height}`,
        outline: "none",
      }
    : {
        display: "block",
        width: "100%",
        height: "auto",
        aspectRatio: `${view.width} / ${view.height}`,
        outline: "none",
      };

  return (
    <svg
      viewBox={`0 0 ${view.width} ${view.height}`}
      role="group"
      aria-label={`尤克里里指板，共 ${frets} 品。点格子出声；键盘四行对应四根弦，每行从左到右是空弦到高把位。`}
      style={svgStyle}
      onMouseLeave={() => setHover(null)}
    >
      {/* 整块指板的坐标系：竖放 = 顺时针转 90°（琴枕转到上边、4 弦转到右边） */}
      <g transform={view.transform}>
        {/* 指板底：琴头侧（空弦区）/ 琴颈 / 琴身过渡 */}
        <rect
          x={geom.openLeft}
          y={boardTop}
          width={geom.nutX - geom.openLeft}
          height={boardBottom - boardTop}
          rx={6}
          fill="var(--board-head)"
        />
        <rect
          x={geom.nutX}
          y={boardTop}
          width={bodyX - geom.nutX}
          height={boardBottom - boardTop}
          fill="var(--board)"
        />
        <rect
          x={bodyX}
          y={boardTop}
          width={geom.tailRight - bodyX}
          height={boardBottom - boardTop}
          rx={6}
          fill="var(--border)"
        />

        {/* 品位记号：5 / 7 / 10 一个点，12 两个点（只画指板范围内的） */}
        {[...FRET_MARKERS, FRET_MARKER_DOUBLE]
          .filter((f) => f <= frets)
          .map((f) => {
            const cx = (geom.fretLines[f - 1] + geom.fretLines[f]) / 2;
            // 12 品的两个点落在「最上两根弦之间」与「最下两根弦之间」。
            // ⚠️ 用 boardTop/boardBottom 表达，别用 rowY[0] / rowY[弦数-1]
            // ——后者把「下标 0 在最下面」写死了，翻转弦序后点会跑到指板外面
            const ys =
              f === FRET_MARKER_DOUBLE
                ? [boardTop + rowHalf * 1.5, boardBottom - rowHalf * 1.5]
                : [(boardTop + boardBottom) / 2];
            return ys.map((cy, k) => (
              <circle key={`dot${f}-${k}`} cx={cx} cy={cy} r={3.2} fill="var(--tick)" />
            ));
          })}

        {/* 品丝：琴枕加粗 */}
        {geom.fretLines.map((x, k) => (
          <line
            key={`wire${k}`}
            x1={x}
            y1={boardTop}
            x2={x}
            y2={boardBottom}
            stroke={k === 0 ? "var(--text)" : "var(--tick)"}
            strokeWidth={k === 0 ? 3.5 : 1}
            strokeOpacity={k === 0 ? 0.75 : 1}
          />
        ))}

        {/* 系弦处（琴桥） */}
        <rect
          x={geom.tailRight - 3}
          y={boardTop}
          width={4}
          height={boardBottom - boardTop}
          rx={2}
          fill="var(--tick)"
        />

        {/* 弦：静态段（琴枕 → 掐住点）+ 振动段（掐住点 → 系弦处） */}
        {strings.map((s, i) => (
          <line
            key={`still${i}`}
            x1={geom.openLeft}
            y1={geom.rowY[i]}
            x2={stopX(geom, held[i] ?? 0)}
            y2={geom.rowY[i]}
            stroke="var(--text)"
            strokeOpacity={0.42}
            strokeWidth={s.width}
            strokeLinecap="round"
          />
        ))}
        {strings.map((s, i) => (
          <path
            key={`str${i}`}
            ref={(el) => {
              vibratoRefs.current[i] = el;
            }}
            d={stringD(i, null, 0)}
            fill="none"
            stroke="var(--text)"
            strokeOpacity={0.42}
            strokeWidth={s.width}
            strokeLinecap="round"
          />
        ))}

        {/* 命中的格子：鼠标悬停 / 键盘按下的那一格高亮 */}
        {strings.map((_, i) =>
          Array.from({ length: frets + 1 }, (_, f) => {
            const x = f === 0 ? geom.openLeft : geom.fretLines[f - 1];
            const x2 = f === 0 ? geom.nutX : geom.fretLines[f];
            const on = active?.s === i && active.f === f;
            return (
              <rect
                key={`cell${i}-${f}`}
                x={x}
                y={geom.rowY[i] - rowHalf}
                width={x2 - x}
                height={rowHalf * 2}
                rx={5}
                fill={on ? "var(--pick-hover)" : "transparent"}
                role="button"
                tabIndex={-1}
                aria-label={cellLabel(i, f)}
                // outline:none 是必要的：点一下浏览器会把焦点留在这一格上，
                // 默认焦点环（蓝色方框）会一直挂着，像是「选中了」。
                // 这一格本来就不进 Tab 序列（-1），键盘弹奏有自己的高亮（见 cursor）。
                style={{ cursor: "pointer", outline: "none" }}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setHover({ s: i, f });
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") setHover(null);
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  onPluck(i, f);
                }}
              />
            );
          }),
        )}

        {/* 按弦点：空弦画 ○，按品画实心点（表示手指掐在这里）。
            ⚠️ 整组必须 pointer-events: none —— 这一组画在上面的格子 rect **之后**，
            所以压在格子上层：空弦的 ○ 正好落在空弦格**正中央**，按品的实心点压在
            格子**左缘**。不关掉指针命中，按住这根弦之后再点同一处就会打在标记上，
            事件到不了下面的格子 rect，表现为「点了不响」（格子是 transparent 填充，
            本来能吃满整格，就是被这两枚标记挡掉的）。 */}
        <g pointerEvents="none">
          {strings.map((_, i) => {
            const f = held[i];
            if (f === null || f === undefined) return null;
            const x = f === 0 ? (geom.openLeft + geom.nutX) / 2 : geom.fretLines[f - 1];
            const cy = geom.rowY[i];
            return f === 0 ? (
              <circle
                key={`hold${i}`}
                cx={x}
                cy={cy}
                r={5}
                fill="var(--card)"
                stroke="var(--accent)"
                strokeWidth={2}
              />
            ) : (
              <circle
                key={`hold${i}`}
                cx={x}
                cy={cy}
                r={7.5}
                fill="var(--accent)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            );
          })}
        </g>

        {/* 拨弦反馈：一圈扩散出去（按 key 重放动画） */}
        {pluck && (
          <circle
            key={`ring${pluck.id}`}
            className="pluck-ring"
            cx={cellCenterX(geom, pluck.fret)}
            cy={geom.rowY[pluck.stringIndex]}
            r={15}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}
      </g>

      {/* 文字画在旋转组之外，直接落在视图坐标上——见 renderStringLabels 的说明 */}
      {renderStringLabels()}
      {renderFretNumbers()}
    </svg>
  );
}
