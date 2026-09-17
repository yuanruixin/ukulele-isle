/**
 * 小猫动效骨架的**元数据**类型 —— 几何本体不在数据里，在
 * `src/assets/cats/<id>.svg`（一个姿态一个文件）。
 *
 * ⚠️ 这些形状只描述生成物的结构，真正的内容由脚本产出：
 *    `.agents/skills/bitmap-to-svg-replica/scripts/build-motion-data.py`
 *    → `src/assets/cats/<id>.svg`（骨架）+ `src/data/cats.ts`（下面这些元数据）
 *
 * 部件枢轴**不在这里**：它写在骨架 SVG 各自的 `data-px` / `data-py` 属性上
 * （引擎就是从那两个属性读的）。数据里再存一份就成两处各说各话，所以只留一份。
 */

/** 一个姿态（一只猫）的骨架元数据 */
export interface CatPoseData {
  /** 中文名（听歌 / 唱歌 / 蜷缩 / 睡觉） */
  label: string;
  /** 身体剪影在**原始坐标**下的高度（部件幅度按它换算） */
  bodyH: number;
  /** 身体剪影在**舞台单位**下的宽度（点击方向、指针跟随按它归一化） */
  bodyW: number;
  /** 原始坐标 → 舞台坐标的倍率（也是舞台单位 ↔ 原始单位的换算比） */
  scale: number;
  /**
   * 语义部件表：notes / eyes / mouth / mic / zzz → 该部件在骨架 SVG 里的 `data-p` 列表。
   * ⚠️ 数组顺序有意义（循环类部件按序号错开相位），别当集合用、别排序。
   */
  parts: Record<string, string[]>;
}

/** 全部姿态 + 共用同一套舞台坐标约定 */
export interface CatsData {
  /** 姿态顺序 = 页面里的排列顺序 */
  order: string[];
  /** 舞台画幅：所有姿态共用它 ⇒ 同一比例、同一地面接触点 */
  vbStage: string;
  /** 列表画幅：比舞台矮（没有跳跃用的头顶余量），横向比例与舞台一致 */
  vbThumb: string;
  /** 归一化后每个姿态的身体高（引擎里一切幅度的单位） */
  targetBodyH: number;
  data: Record<string, CatPoseData>;
}
