// 生成物，勿手改：由 bitmap-to-svg-replica 技能的 build-motion-data.py 按 cats-rig.json 产出（数据从旧格式 cats.ts 迁移而来）。
// 骨架 SVG 是**独立文件**（一个姿态一个）：`../assets/cats/<id>.svg` —— 可读、可 diff、
// 可用浏览器直接打开。本文件只留引擎要用的标量。
// 部件枢轴不在这儿重复一份：它写在各自 SVG 的 data-px / data-py 上（引擎从那儿读）。
import type { CatsData } from "../types/cat";

/** 姿态 id（= rig 配置里的 order）：所有姿态相关的 props 都用它，写错编译期就报 */
export type CatPoseId = "listen" | "sing" | "curl" | "sleep";

/** 姿态顺序 = 页面里的排列顺序 */
export const CAT_ORDER: CatPoseId[] = ["listen", "sing", "curl", "sleep"];

/** 骨架元数据：几何在 SVG 文件里，勿手改（改几何请改描摹稿后重跑生成器） */
export const CATS: CatsData = {
  "order": [
    "listen",
    "sing",
    "curl",
    "sleep"
  ],
  "vbStage": "-172.3 -308.4 331.3 391.1",
  "vbThumb": "-172.3 -268.4 331.3 351.1",
  "targetBodyH": 190.0,
  "data": {
    "listen": {
      "label": "听歌",
      "bodyH": 270.0,
      "bodyW": 190.4222222222222,
      "scale": 0.7037037037037037,
      "parts": {
        "notes": [
          "L2C0",
          "L2C1",
          "L2C2"
        ],
        "eyes": [
          "L1C0",
          "L1C1"
        ],
        "mouth": [
          "L1C2"
        ]
      }
    },
    "sing": {
      "label": "唱歌",
      "bodyH": 619.0999999999999,
      "bodyW": 172.59893393635926,
      "scale": 0.30689710870618647,
      "parts": {
        "mouth": [
          "L1C0"
        ],
        "mic": [
          "L2C0",
          "L2C1",
          "L2C2",
          "L3C0",
          "L3C1",
          "L3C2",
          "L3C3",
          "L3C4",
          "L3C5",
          "L3C6",
          "L3C7",
          "L3C8",
          "L3C9",
          "L3C10",
          "L3C11",
          "L3C12",
          "L3C13",
          "L3C14",
          "L3C15",
          "L3C16",
          "L3C17",
          "L3C18",
          "L3C19",
          "L3C20"
        ]
      }
    },
    "curl": {
      "label": "蜷缩",
      "bodyH": 354.7,
      "bodyW": 285.99097829151395,
      "scale": 0.5356639413588948,
      "parts": {
        "zzz": [
          "L1C0",
          "L1C2",
          "L1C3"
        ]
      }
    },
    "sleep": {
      "label": "睡觉",
      "bodyH": 276.6,
      "bodyW": 245.91467823571944,
      "scale": 0.6869125090383225,
      "parts": {
        "zzz": [
          "L2C0",
          "L2C1",
          "L2C2",
          "L2C3",
          "L2C4"
        ]
      }
    }
  }
};
