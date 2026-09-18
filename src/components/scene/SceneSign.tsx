import { Link } from "react-router-dom";

/**
 * 场景里的一块吊牌 —— 从"屋顶"垂下来的木牌，点一下进对应页面。
 *
 * 为什么用吊牌当菜单（而不是卡片）：
 *   · 屋顶挂 → 天然有垂直空间，且**加一个入口就多挂一块**，布局一行都不用动；
 *   · 摆动 = 现成的「跟随与重叠」（两块牌的周期故意错开，永远不会同时到端点）；
 *   · 悬停抬起 + 转正 = 明确的可点性 + 「预备」动作。
 *
 * ★ 它是**真的 `<Link>`**：键盘可达、能被读屏认出来、右键能新开标签。
 *   这一点和场景里那些猫不同 —— 猫是纯装饰（`aria-hidden`），牌子是功能入口。
 *
 * ★ 位置、尺寸、摆动参数**一律不在这里**，全在 globals.css 的 `.home-scene` 一段，
 *   按 `.scene-sign-<序号>` 选（PC / 窄屏各一套）。
 *   放 CSS 的道理和猫的站位一样：**这些数要反复调**，而且在浏览器里能实时改；
 *   更重要的是窄屏要重新排（两块牌竖幅里得重新分布），写成行内 style 就切不动了。
 *
 * 三层嵌套各管一个 transform，互不覆盖（同一个 transform 上叠两个动画会互相盖掉）：
 *   .scene-sign        定位：left / top + translateX(-50%) 居中
 *     .scene-sign-sway 常驻摆动：rotate（原点在挂点上，所以是**钟摆**而不是原地转）
 *       .scene-sign-lift 悬停：translateY（把牌子提起来）
 */
export interface SceneSignProps {
  /** 牌面上的字 */
  label: string;
  /** 点它去哪儿 */
  to: string;
  /** 序号（从 1 起）：CSS 里按 `.scene-sign-<序号>` 给位置与摆动 */
  index: number;
}

export default function SceneSign({ label, to, index }: SceneSignProps) {
  return (
    <Link to={to} className={`scene-sign scene-sign-${index}`}>
      <span className="scene-sign-sway">
        <span className="scene-sign-lift">
          <span className="scene-sign-cord" aria-hidden="true" />
          <span className="scene-sign-board">
            <span className="scene-sign-label">{label}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
