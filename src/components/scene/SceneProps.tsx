/**
 * 场景里的道具 —— 一间猫咖该有的那几件东西。
 *
 * 它们的职责**不是好看，是搭出高度**。原先猫全站在同一条台面线上，
 * 之所以像"排"着的，一半原因就是**没有一处可以站得更高**：
 * 没有猫架、没有凳子、没有吧台立面，四只猫除了并排别无选择。
 * 所以这里添的东西是分层来的（从高到低）：
 *
 *   窗 / 猫架 / 挂植   → 墙面层（把"高处"造出来，猫可以待在上面）
 *   吧台台面           → 中间层（CSS 画的，不在本文件）
 *   高脚凳 / 圆桌 / 坐垫 → 地面层（把"低处"坐实，也把前景填满）
 *
 * 造型从简、颜色只用 `--scene-*` 令牌（深浅两套主题各一份），画得越素越好 ——
 * 它们是背景，抢戏就输了。
 *
 * 每件带一点**极轻**的常驻动作（灯慢晃、叶微颤、热气上升），
 * 幅度都刻意压得比猫小一档：一级动作是猫，道具只是"空气在流动"。
 *
 * ⚠️ **位置和尺寸一律不在这里**，全在 globals.css 的 `.home-scene` 一段 ——
 *   因为横屏 / 竖屏两套构图要用媒体查询切，写在行内 style 就切不动了。
 *   这里只负责"长什么样"，那边负责"摆哪儿、多大、窄屏还要不要"。
 *
 * ⚠️ 造型里凡是"当作落脚面"的那条线（猫架搁板的上沿、凳子座面的中心线），
 *   **一律放在 viewBox 的 y=0 或明确量出来写进注释** —— 猫的 `bottom` 要跟它对齐，
 *   差一点猫就是"浮在半空"。
 */
import type { CSSProperties } from "react";

/**
 * 吊灯：一根线吊下来，一个锥形灯罩 + 一颗暖色灯泡。
 *
 * ⚠️ **罩口在 y=74**（viewBox 高 92）。灯是挂在屋顶的（`.sp-lamp` 的 top:0），
 *    所以这个数不用跟谁对齐；但灯泡要露在罩口**下面**，不然看不出是"亮着"。
 */
export function SceneLamp({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={`sp sp-lamp ${className ?? ""}`}
      style={{ "--delay": `${delay}s` } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 56 92" width="100%">
        <line className="sp-cord" x1="28" y1="0" x2="28" y2="42" />
        <rect className="sp-socket" x="24" y="40" width="8" height="5" rx="2" />
        <path className="sp-shade" d="M28 42 L45 74 L11 74 Z" />
        <ellipse className="sp-shade-lip" cx="28" cy="74" rx="17" ry="3.4" />
        <path className="sp-bulb" d="M18 74 Q28 92 38 74 Z" />
        <path className="sp-filament" d="M23 77 Q28 70 33 77" />
      </svg>
    </div>
  );
}

/** 吊挂绿植：两根绳 + 花盆 + 垂下来的叶子 */
export function SceneHanging({ className }: { className?: string }) {
  return (
    <div className={`sp sp-hanging ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 64 96" width="100%">
        <line className="sp-cord" x1="20" y1="0" x2="32" y2="28" />
        <line className="sp-cord" x1="44" y1="0" x2="32" y2="28" />
        <path className="sp-pot" d="M16 28 L48 28 L42 50 L22 50 Z" />
        <g className="sp-leaf g1">
          <path className="sp-vine" d="M30 50 Q24 66 26 84" />
          <ellipse className="sp-blade" cx="26" cy="82" rx="4" ry="8" />
        </g>
        <g className="sp-leaf g2">
          <path className="sp-vine" d="M35 50 Q41 64 40 80" />
          <ellipse className="sp-blade" cx="40" cy="78" rx="3.6" ry="7" />
        </g>
      </svg>
    </div>
  );
}

/** 桌上盆栽：安静的绿点，给木色画面一点冷色平衡 */
export function ScenePlant({ className }: { className?: string }) {
  return (
    <div className={`sp sp-plant ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 56 62" width="100%">
        <ellipse className="sp-blade" cx="16" cy="30" rx="11" ry="6" transform="rotate(-32 16 30)" />
        <ellipse className="sp-blade" cx="40" cy="30" rx="11" ry="6" transform="rotate(32 40 30)" />
        <ellipse className="sp-blade" cx="28" cy="20" rx="9" ry="7" />
        <path className="sp-pot" d="M13 36 L43 36 L38 62 L18 62 Z" />
      </svg>
    </div>
  );
}

/** 咖啡杯：杯 + 碟 + 一缕热气（热气循环上升淡出 —— 二级动作里最便宜的一个） */
export function SceneCup({ className }: { className?: string }) {
  return (
    <div className={`sp sp-cup ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 50 50" width="100%">
        <g className="sp-steam s1">
          <path className="sp-vapor" d="M20 24 Q17 18 20 12" />
        </g>
        <g className="sp-steam s2" style={{ "--delay": "1.1s" } as CSSProperties}>
          <path className="sp-vapor" d="M28 24 Q31 18 28 12" />
        </g>
        <ellipse className="sp-saucer" cx="25" cy="46" rx="17" ry="4" />
        <path className="sp-cupbody" d="M13 24 L37 24 L33 44 L17 44 Z" />
        <path className="sp-handle" d="M37 28 q8 4 0 9" />
      </svg>
    </div>
  );
}

/**
 * 壁挂猫架 —— **这一件就是"高低都有"的来源**。
 *
 * 原先四只猫全在台面线上，加一件最高的落脚处之后，猫才有可能"待在高处"。
 * 造型故意极简：一块板 + 两个三角托，**搁板的上沿就是 viewBox 的 y=0** ——
 * 于是 CSS 里给 `bottom: 74%`，猫也给 `bottom: 74%`，两者严丝合缝。
 */
export function SceneShelf({ className }: { className?: string }) {
  return (
    <div className={`sp sp-shelf ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 210 38" width="100%">
        <rect className="sp-shelf-deck" x="4" y="0" width="202" height="11" rx="3" />
        <rect className="sp-shelf-top" x="4" y="0" width="202" height="3.2" rx="1.6" />
        <path className="sp-shelf-bracket" d="M26 11 L26 36 L50 11 Z" />
        <path className="sp-shelf-bracket" d="M160 11 L160 36 L184 11 Z" />
      </svg>
    </div>
  );
}

/**
 * 窗 —— 墙面右侧那一大块"外面有光"。
 *
 * 它的作用是把墙面**分掉一半**：上墙要是整片纯色，猫架和吊牌就都浮在空里。
 * 木框 + 十字窗棂 + 窗外两团叶影，够了；窗台上再坐一盆东西就是画蛇添足。
 */
export function SceneWindow({ className }: { className?: string }) {
  return (
    <div className={`sp sp-window ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 170 244" width="100%">
        {/* 窗外：先铺一层天光，再压三团叶影。
            ⚠️ 不做 clipPath —— id 在同一页里必须唯一，多渲染一次就撞。
               叶影的半径是**手算在玻璃范围内**的（玻璃 11~159 × 11~232），别随手改大。 */}
        <rect className="sp-win-pane" x="11" y="11" width="148" height="221" rx="4" />
        <ellipse className="sp-win-leaf" cx="46" cy="56" rx="26" ry="20" />
        <ellipse className="sp-win-leaf d" cx="120" cy="98" rx="30" ry="22" />
        <ellipse className="sp-win-leaf" cx="62" cy="176" rx="32" ry="24" />

        {/* 窗棂：一竖一横，十字略偏左 —— 正中会把玻璃切成四块等分，太工整 */}
        <line className="sp-win-mullion" x1="66" y1="11" x2="66" y2="232" />
        <line className="sp-win-mullion" x1="11" y1="118" x2="159" y2="118" />

        {/* 框（粗描边，内外各占一半）+ 窗台 */}
        <rect className="sp-win-frame" x="6" y="6" width="158" height="232" rx="5" />
        <rect className="sp-win-sill" x="0" y="233" width="170" height="11" rx="3" />
      </svg>
    </div>
  );
}

/**
 * 咖啡机 —— 台面上体积最大的一件，也是"这是一家店"最省事的一笔。
 *
 * 蒸汽棒下面挂一缕热气（复用 `.sp-steam` 的关键帧），
 * 于是台面上有两处二级动作（杯口、蒸汽棒），但错开相位、互不同步。
 */
export function SceneMachine({ className }: { className?: string }) {
  return (
    <div className={`sp sp-machine ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 88 68" width="100%">
        <g className="sp-steam s3" style={{ "--delay": "0.6s" } as CSSProperties}>
          <path className="sp-vapor" d="M72 26 Q69 18 72 11" />
        </g>
        <rect className="sp-mach-cup" x="44" y="2" width="14" height="7" rx="2.4" />
        <rect className="sp-mach-lid" x="10" y="8" width="68" height="9" rx="3" />
        <rect className="sp-mach-body" x="6" y="17" width="76" height="48" rx="6" />
        <circle className="sp-mach-gauge" cx="26" cy="34" r="7.5" />
        <path className="sp-mach-needle" d="M26 34 L31 29" />
        <rect className="sp-mach-head" x="18" y="46" width="28" height="10" rx="3" />
        <rect className="sp-mach-handle" x="21" y="56" width="22" height="4.4" rx="2.2" />
        <rect className="sp-mach-tray" x="14" y="62" width="56" height="6" rx="2.4" />
        <path className="sp-mach-wand" d="M76 36 q9 8 5 20" />
      </svg>
    </div>
  );
}

/** 罐架：墙上一条小搁板 + 三个罐子。填补吧台上方那片墙，也让"高处"有第二处落点 */
export function SceneJars({ className }: { className?: string }) {
  return (
    <div className={`sp sp-jars ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 124 66" width="100%">
        <rect className="sp-jar-body" x="13" y="20" width="25" height="32" rx="5" />
        <rect className="sp-jar-lid" x="12" y="13" width="27" height="8" rx="3" />
        <rect className="sp-jar-body" x="48" y="26" width="21" height="26" rx="4.5" />
        <rect className="sp-jar-lid" x="47" y="20" width="23" height="7" rx="2.8" />
        <rect className="sp-jar-body" x="79" y="18" width="23" height="34" rx="5" />
        <rect className="sp-jar-lid" x="78" y="11" width="25" height="8" rx="3" />
        <rect className="sp-shelf-deck" x="4" y="52" width="116" height="9" rx="3" />
        <rect className="sp-shelf-top" x="4" y="52" width="116" height="2.8" rx="1.4" />
        <path className="sp-shelf-bracket" d="M20 61 L20 66 L34 61 Z" />
        <path className="sp-shelf-bracket" d="M90 61 L90 66 L104 61 Z" />
      </svg>
    </div>
  );
}

/**
 * 高脚凳 —— 从参考图里搬过来的那一件（棕色皮座面 + 外撇四条腿 + 一圈横撑）。
 *
 * ★ 它是"中间那一层"唯一的落脚处：**座面中心线在 viewBox 的 y=14**，
 *   也就是座面椭圆的圆心那一行。猫站上去时 `bottom` 要按它换算，
 *   具体换算写在本文件末尾的「落脚面对照表」里。
 */
export function SceneStool({ className }: { className?: string }) {
  return (
    <div className={`sp sp-stool ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 100 116" width="100%">
        {/* 腿（先画，被座面压住上端） */}
        <path className="sp-stool-leg" d="M20 22 L7 108" />
        <path className="sp-stool-leg" d="M38 25 L31 116" />
        <path className="sp-stool-leg" d="M62 25 L69 116" />
        <path className="sp-stool-leg" d="M80 22 L93 108" />
        <ellipse className="sp-stool-ring" cx="50" cy="90" rx="31" ry="9" />
        <ellipse className="sp-stool-ring" cx="50" cy="90" rx="31" ry="9" transform="translate(0 -3)" />
        {/* 座面：侧厚 + 顶面 */}
        <path className="sp-stool-side" d="M8 14 A42 12 0 0 0 92 14 L92 19 A42 12 0 0 1 8 19 Z" />
        <ellipse className="sp-stool-seat" cx="50" cy="14" rx="42" ry="12" />
        <circle className="sp-stool-stud" cx="30" cy="12" r="1.6" />
        <circle className="sp-stool-stud" cx="50" cy="15" r="1.6" />
        <circle className="sp-stool-stud" cx="70" cy="12" r="1.6" />
      </svg>
    </div>
  );
}

/** 圆木桌 —— 前景右下角那一件（参考图里半出画的那张），用来把前景压住 */
export function SceneTable({ className }: { className?: string }) {
  return (
    <div className={`sp sp-table ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 220 138" width="100%">
        <rect className="sp-tab-post" x="99" y="40" width="22" height="76" rx="5" />
        <ellipse className="sp-tab-base" cx="110" cy="124" rx="54" ry="14" />
        <path className="sp-tab-side" d="M6 26 A104 22 0 0 0 214 26 L214 34 A104 22 0 0 1 6 34 Z" />
        <ellipse className="sp-tab-top" cx="110" cy="26" rx="104" ry="22" />
      </svg>
    </div>
  );
}

/** 地面坐垫 —— 猫的"最低那一层"，也是画面下缘的一团重色，把场景兜住 */
export function SceneCushion({ className }: { className?: string }) {
  return (
    <div className={`sp sp-cushion ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 164 64" width="100%">
        <path className="sp-cush-side" d="M6 40 A74 24 0 0 0 158 40 L158 50 A74 24 0 0 1 6 50 Z" />
        <ellipse className="sp-cush-top" cx="82" cy="40" rx="74" ry="24" />
        <path className="sp-cush-seam" d="M26 34 Q82 50 138 34" />
        <path className="sp-cush-seam" d="M30 48 Q82 62 134 48" />
      </svg>
    </div>
  );
}

/**
 * ── 落脚面对照表（改猫的站姿前先看这里）─────────────────────────────
 *
 *  道具        取哪条线                                      换算
 *  ─────────  ────────────────────────────────────────────  ──────────────────
 *  猫架搁板    viewBox y=0（就是搁板上沿）                    猫 bottom = 架 bottom
 *  高脚凳      viewBox y=14（座面椭圆圆心）                   猫 bottom ≈ 凳 bottom + 14/122 × 凳高
 *  吧台台面    CSS 里 --hs-deck 那条线                       猫 bottom = --hs-deck
 *  木地板      CSS 里 0                                      猫 bottom ≈ 0（留 1~2% 才不"陷进去"）
 *  坐垫        viewBox y=40（顶面椭圆圆心）                   猫 bottom ≈ 垫 bottom + 40/76 × 垫高
 *
 *  ⚠️ 这些线都是**造型里量出来的**，不是估的；改了任一造型的 viewBox 高度，
 *     对应的换算就要跟着重算，否则猫会浮在半空或陷进板子里。
 */
