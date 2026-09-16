/**
 * ★ 站点配置 —— 所有站点级可调项集中在这里修改 ★
 */

/** 工具卡片：有 to 表示已实现可点击，无 to 表示尚在规划 */
export interface ToolItem {
  name: string;
  description: string;
  to?: string;
  /** 角标文案，留空则不显示 */
  badge?: string;
}

/** 调音器的一根弦 */
export interface TunerStringConfig {
  id: string;
  /** 音名 */
  note: string;
  octave: number;
  /** 空弦频率（Hz） */
  freq: number;
  /** 弦序说明 */
  label: string;
  /** 按钮落在琴头的哪一侧 */
  side: "left" | "right";
}

export const siteConfig = {
  /** 站点名称（导航栏 / 标题） */
  siteName: "屿琴",
  /** 站点副标题 */
  tagline: "四根弦上的晴天",

  player: {
    /** ★ 默认播放速度（0.25 - 2.0） */
    defaultSpeed: 1.0,
    /** ★ 可选速度档位 */
    speedOptions: [0.5, 0.75, 1.0, 1.25, 1.5],
    /** ★ 默认是否开启节拍高亮 */
    beatHighlight: true,
    /** ★ 谱面默认缩放 */
    scale: 1.0,
    /** ★ 每行固定小节数（正数 = 强制每行该节数） */
    barsPerRow: 2,
    /** ★ 移动端每行小节数（屏幕宽度 <640px 时生效，窄屏建议 1） */
    barsPerRowMobile: 1,
    /** ★ 行内小节等宽（true = 各节平分行宽；false = 按内容密度分配宽度） */
    equalBarWidth: true,
  },

  search: {
    /** ★ 搜索框占位符 */
    placeholder: "搜索歌曲、艺术家或标签…",
  },

  /** ★ 导航栏入口（桌面端平铺在右侧；移动端收进右上角汉堡菜单，从上到下依次排列） */
  nav: [
    { label: "曲谱", to: "/songs" },
    { label: "工具", to: "/tools" },
  ],

  tools: {
    /** ★ 工具列表（有 to = 已实现，可点击进入；badge 为角标文案，留空则不显示） */
    items: [
      { name: "调音器", description: "听音校准 GCEA 四根弦", to: "/tools/tuner" },
      { name: "节拍器", description: "稳稳地练，从慢到快", badge: "敬请期待" },
      { name: "和弦库", description: "常用和弦指法速查", badge: "敬请期待" },
    ] as ToolItem[],
  },

  /** ★ 调音器 */
  tuner: {
    /** ★ 乐器名（显示在标题下方） */
    instrument: "尤克里里",
    /** ★ 调弦法名称 */
    tuningName: "标准",
    /** ★ 音准容差（cent）：|偏差| ≤ 该值即判定为准 */
    toleranceCents: 5,
    /** ★ 指示器刻度范围（cent）：指针在 ±该值 之间移动 */
    rangeCents: 50,
    /** ★ 默认选中的弦 id；null = 进入页面不预选任何弦（按钮均不高亮，与参考设计一致） */
    defaultStringId: null as string | null,
    /** ★ 进入页面时是否默认开启「自动识别」（弹哪根自动认哪根） */
    defaultAuto: false,
    /**
     * ★ 是否显示「信号诊断」面板（采集链路调试用，平时不显示）。
     *   除了这里改成 true，也可以在地址栏临时打开：/#/tools/tuner?debug=1
     */
    debug: false,
    /**
     * ★ 标准调弦 GCEA（数组顺序 = 按钮在琴头同侧的上下顺序；
     *   改 freq 即可切换 Low-G / 男声调弦等）
     */
    strings: [
      { id: "C", note: "C", octave: 4, freq: 261.63, label: "3 弦", side: "left" },
      { id: "G", note: "G", octave: 4, freq: 392.0, label: "4 弦", side: "left" },
      { id: "E", note: "E", octave: 4, freq: 329.63, label: "2 弦", side: "right" },
      { id: "A", note: "A", octave: 4, freq: 440.0, label: "1 弦", side: "right" },
    ] as TunerStringConfig[],
  },
} as const;

export type SiteConfig = typeof siteConfig;
