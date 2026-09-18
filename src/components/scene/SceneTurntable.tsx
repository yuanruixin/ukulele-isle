import type { CSSProperties } from "react";

/**
 * 桌面/台面上那台唱片机 —— **纯装饰，只转**（不给点击、不给指针响应）。
 *
 * 它是「整幕活在同一个节拍里」的那个锚点：转速不是随便定的，
 * 而是由 `siteConfig.cats.bpm` 推出来的（一圈 = 两拍，见 siteConfig.scene.turntable）。
 * 于是唱片每转满一圈，猫正好踩完两下拍子 —— 两者同源，看着才像一个东西在动。
 *
 * ★ 造型照参考图还原：**高视角俯看一块很扁的底板**（不是正面朝向的厚盒子），
 *   盘面是相当"圆"的一张椭圆（扁度 0.55，不是压到几乎看不见的那种），
 *   盘面外圈有一圈放射状纹路，中间一块白标 + 中心一个黑孔，
 *   右侧一根带配重的弯唱臂搭在盘上，左侧三个音符飘起来（跟着节拍）。
 *
 *   视角这件事是**一整套**的：底板的透视、台面的宽窄、唱片的扁度必须来自同一个
 *   视点，只改其中一样就会像两张图拼起来的。这里的数：
 *     台面是个梯形（前沿宽、后沿窄）  ⇒ 视点在正前方偏上
 *     唱片扁度 13.75 / 25 = 0.55      ⇒ 俯角约 33°
 *
 * ★ 为什么匀速转却不"机械"：匀速转是**唱片本来就该有的样子**（写实 > 花哨），
 *   靠三样东西把它拉活 —— 盘面纹路与对置高光让"在转"这件事读得出来、
 *   唱臂随节拍微颤、音符各自错开相位（跟随与重叠）。
 *
 * 颜色全部读 `--scene-*` 令牌（深浅两套主题各一份，见 globals.css）。
 */
export interface SceneTurntableProps {
  /** 转一圈几秒（= 120 / bpm） */
  secondsPerTurn: number;
}

/** 盘面外圈的放射纹路：一圈 20 道，只在"有刻纹的那一圈"里，别画到圆心 */
const GROOVES = Array.from({ length: 20 }, (_, i) => {
  const a = (i / 20) * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  return {
    x1: 18.6 * c, y1: 18.6 * s,
    x2: 24.8 * c, y2: 24.8 * s,
  };
});

/** 盘心：唱片画在"未压扁"的坐标系里（真正的圆），压扁交给 CSS 的 scale —— 见 globals.css */
const CX = 73.5;
const CY = 44.5;

export default function SceneTurntable({ secondsPerTurn }: SceneTurntableProps) {
  return (
    <div
      className="scene-turntable"
      style={{ "--turn": `${secondsPerTurn}s` } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 150 76" width="100%">
        {/* 脚（有脚才站得住 —— 实体感） */}
        <rect className="tt-foot" x="24" y="70" width="9" height="4" rx="1.6" />
        <rect className="tt-foot" x="112" y="72" width="9" height="4" rx="1.6" />

        {/* 底板：**先画台面再画立面**，立面的上沿被台面盖住 ⇒ 出来就是一块扁板。
            台面前沿比后沿宽（梯形）—— 这一条就是"视点在上前方"的全部来源。 */}
        <rect className="tt-side" x="10" y="58" width="128" height="13" />
        <path className="tt-deck" d="M22 28 L124 31 L138 61 L10 58 Z" />

        {/* 唱片：整组一起转（含外圈纹路、白标、中心孔、两条对置高光）。
            ★★ 这里的成员必须是"未压扁的圆"：压扁由 @keyframes scene-spin 统一做，
            顺序是 rotate 再 scale —— 圆的投影因此恒等于同一张椭圆，轮廓不动。 */}
        <g className="tt-disc">
          <circle className="tt-vinyl" r="26.5" />
          {GROOVES.map((g, i) => (
            <line key={i} className="tt-groove" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
          ))}
          {/* 对置的两条高光：让"它在转"在小尺寸下也读得出来 */}
          <ellipse className="tt-sheen" cx="14.3" rx="4.2" ry="1.3" />
          <ellipse className="tt-sheen" cx="-14.3" rx="4.2" ry="1.3" />
          <circle className="tt-label" r="8.4" />
          <circle className="tt-hole" r="2.1" />
        </g>

        {/* 唱臂：底座 + 配重 + 臂杆 + 针头 + 起落杆（都在盘的右后方） */}
        <rect className="tt-lever" x="116" y="29" width="4" height="6.5" rx="1.4" />
        <line className="tt-arm" x1="127" y1="21" x2="96" y2="41" />
        <circle className="tt-pivot" cx="122" cy="24" r="3.2" />
        <circle className="tt-weight" cx="128.5" cy="19.5" r="4.2" />
        <rect className="tt-head" x="91.5" y="39" width="7.5" height="4.4" rx="1.4" />

        {/* 飘出来的音符：三个错开相位（跟随与重叠），上浮 + 淡出 */}
        <g transform="translate(12 22)">
          <g className="tt-note n1">
            <ellipse cx="0" cy="0" rx="3.2" ry="2.4" transform="rotate(-18)" />
            <rect x="2.6" y="-10" width="1.3" height="10" rx="0.6" />
          </g>
        </g>
        <g transform="translate(5 13)">
          <g className="tt-note n2">
            <ellipse cx="0" cy="0" rx="2.6" ry="2" transform="rotate(-18)" />
            <rect x="2.2" y="-8" width="1.1" height="8" rx="0.5" />
          </g>
        </g>
        <g transform="translate(16 5)">
          <g className="tt-note n3">
            <ellipse cx="0" cy="0" rx="2.2" ry="1.7" transform="rotate(-18)" />
            <rect x="1.8" y="-6.5" width="1" height="6.5" rx="0.5" />
          </g>
        </g>
      </svg>
    </div>
  );
}
