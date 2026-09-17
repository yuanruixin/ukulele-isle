/**
 * 姿态 → 骨架 SVG 文本。
 *
 * 这是**手写文件，不是生成物** —— 生成器只负责把几何落成 `../assets/cats/<id>.svg`；
 * 「怎么把那份几何送到引擎手里」是宿主自己的事，所以这一层故意留在技能之外：
 * 这里用 Vite 的 `?raw` 就地取文本（**同步**、零异步，挂载路径与从前一模一样）。
 *
 * 想换投递方式（运行时 fetch / 从编辑器里读 / 换成 public 下的副本），
 * 只动这一个文件 + 给 `createCatMotion` 传一个 `art` 就行，引擎和生成器都不用碰。
 *
 * ⚠️ 生成器里加了一个姿态，这里必须跟着补一行；忘了的话引擎会**明确报错**说缺哪个姿态
 * （不会像以前那样静默画一片空白）。
 */
import listen from "../assets/cats/listen.svg?raw";
import sing from "../assets/cats/sing.svg?raw";
import curl from "../assets/cats/curl.svg?raw";
import sleep from "../assets/cats/sleep.svg?raw";
import type { CatPoseId } from "./cats";

/**
 * 每个姿态的骨架 SVG 文本。
 * 已归一化到统一舞台坐标系（原点 = 地面接触点），几何与手绘位图逐像素一致。
 */
export const CAT_ART: Record<CatPoseId, string> = { listen, sing, curl, sleep };
