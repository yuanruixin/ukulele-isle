/**
 * ★ 站点配置 —— 所有站点级可调项集中在这里修改 ★
 */
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
    /** ★ 默认是否开启循环练习（全曲循环） */
    loop: false,
    /** ★ 谱面默认缩放 */
    scale: 1.0,
  },

  search: {
    /** ★ 搜索框占位符 */
    placeholder: "搜索歌曲、艺术家或标签…",
  },
} as const;

export type SiteConfig = typeof siteConfig;
