import { siteConfig } from "../../config/site.config";
import CatMotion from "../cats/CatMotion";
import SceneSign from "./SceneSign";
import SceneTurntable from "./SceneTurntable";
import {
  SceneCup,
  SceneCushion,
  SceneHanging,
  SceneJars,
  SceneLamp,
  SceneMachine,
  ScenePlant,
  SceneShelf,
  SceneStool,
  SceneTable,
  SceneWindow,
} from "./SceneProps";

/**
 * 首页那一幕「猫咖」—— 首页**唯一**的内容，占满导航栏以下的整屏。
 *
 * 它替掉了原先「站点名 + 一排等距小猫 + 两张入口卡片」那一套：
 *   · 那排猫交给了 flex 等分 ⇒ 同宽、等距、齐平，看着像尺子量出来的（用户原话：过于整齐）；
 *   · 入口是两张卡片 ⇒ 和"场景"没有关系，横竖都是网页组件的样子。
 * 现在猫待在一间猫咖里（各自站在不同的高度上，站位见 globals.css 的 `.home-scene` 一段），
 * 功能入口是从屋顶垂下来的两块木牌（SceneSign）——
 * 于是"入口"本身成了场景的布景，而不是贴在场景边上的按钮。
 *
 * ★ 为什么要有"高低"（这是这一版的核心改动）：上一版四只猫其实都踩在
 *   同一条台面线上，只是 x / 大小不同。四个变量里"高度"没被破掉，
 *   所以看着还是像"排"。这一版按从高到低把四种落脚面造出来：
 *
 *     猫架（墙面搁板） → 吧台台面 → 高脚凳 → 木地板
 *        curl             sleep       listen     sing
 *
 *   四只猫落在四个**互不相同的高度**上，纵深才真的立起来。
 *
 * ★ 层次（DOM 顺序 + 各自的 z-index 兜底）：
 *     房间底色 → 墙面构件（窗 / 猫架 / 罐架）→ 吊挂物（灯 / 挂植）
 *     → 吧台（台面 + 护墙板立面）→ 台面道具 → 猫 → 地面道具 → 吊牌
 *   ⚠️ 地面道具（凳子 / 圆桌）z-index 是**故意高于后排猫**的 —— 它们在猫前面。
 *
 * ★ 全屏这件事：场景不设 aspect-ratio，高度由 `main.tsx` 那层 flex 外壳给
 *   （导航栏以下铺满）。横屏 / 竖屏是**两套构图**，不是同一套缩放 ——
 *   切换点在 globals.css 的 `@media (min-aspect-ratio: 5/4)`。
 *
 * ★ 开关与清单在 `siteConfig.scene`；**位置一律在 CSS**（横屏 / 竖屏两套），
 *   放在那边才能在浏览器里实时调，也不用等编译。
 */
export default function HomeScene({ className }: { className?: string }) {
  const { scene, cats } = siteConfig;
  if (!scene.enabled) return null;

  return (
    <div className={`home-scene ${className ?? ""}`}>
      {/* 房间：上墙 + 木地板。两条地面的分界（--hs-floor）与吧台台面的高度
          （--hs-deck）就是全场所有高度参照的那两根线。 */}
      <div className="hs-wall" aria-hidden="true" />
      <div className="hs-floor" aria-hidden="true" />
      <div className="hs-counter" aria-hidden="true" />

      {/* 墙面构件：窗（把墙分掉一半）/ 猫架（最高那一层落脚面）/ 罐架（第二处高落点） */}
      <SceneWindow className="sp-window-a" />
      <SceneShelf className="sp-shelf-a" />
      <SceneJars className="sp-jars-a" />

      {/* 吊挂物：三盏灯 + 两盆挂植。故意铺满整条顶边 ——
          空一格就会显出"这是一条边"，而它们本来就是用来打散这条边的 */}
      <SceneLamp className="sp-lamp-a" />
      <SceneLamp className="sp-lamp-b" delay={2.6} />
      <SceneLamp className="sp-lamp-c" delay={4.4} />
      <SceneHanging className="sp-hanging-a" />
      <SceneHanging className="sp-hanging-b" />

      {/* 吧台台面上的东西。杯子在最里、咖啡机在中、唱片机在最外 ——
          这一排也是"从里到外"的顺序，跟猫的纵深方向一致 */}
      <ScenePlant className="sp-plant-a" />
      <SceneCup className="sp-cup-a" />
      <SceneMachine className="sp-machine-a" />
      {scene.turntable.enabled && (
        <SceneTurntable secondsPerTurn={scene.turntable.secondsPerTurn} />
      )}

      {/* 地面道具（z-index 高于后排猫）：把前景压住，也让"低处"有东西可依 */}
      <SceneTable className="sp-table-a" />
      <SceneCushion className="sp-cushion-a" />
      <SceneStool className="sp-stool-a" />
      <SceneStool className="sp-stool-b" />

      {/* 菜单吊牌（真正的功能入口，可点、可键盘操作）。
          挂在哪儿、多大、怎么摆，全在 CSS 的 .scene-sign-<序号> 里 —— 横屏与竖屏
          是两套排法（竖屏里两块牌要重新分布）。这里只给"有哪些、去哪、第几块"。 */}
      {scene.signs.map((s, i) => (
        <SceneSign key={s.to} index={i + 1} label={s.label} to={s.to} />
      ))}

      {/* 猫：要哪几只 / 什么姿态由 poses 定，**站在哪个高度上由 CSS 定**
          （.home-scene .cat[data-pose=...]）。这里把跳跃行程收小一档 ——
          场景是布置好的，猫跳太远会把自己设计好的位置撞散。
          踩拍（beat）也只留六成：站着的两只（listen / sing）是场景里最大的两块，
          满幅的踩拍会把注意力从"整幕场景"拉回"这两只猫"。
          ★ 幅度只认 gain 一个数（它是**总闸**，同时缩放"下压挤压"与"上浮位移"）；
          只想动其中一路再分别调 sink / up。回弹幅度**没有**独立旋钮。
          ★ 站点偏好写在这里、不写进引擎默认值 —— 引擎默认值是给"一排猫"那种
          紧挨着的布局用的，场景里留白大、同样的幅度会显得更晃。 */}
      <CatMotion
        layout="scene"
        poses={cats.poses}
        config={{
          jump: { drift: 0.16, maxTravel: 0.26 },
          beat: { listen: { gain: 0.35 }, sing: { gain: 0.60 } },
        }}
      />
    </div>
  );
}
