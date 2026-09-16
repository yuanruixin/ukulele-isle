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
    /** ★ 工具列表占位（后续逐个实现；badge 为角标文案，留空则不显示） */
    items: [
      { name: "调音器", description: "听音校准 GCEA 四根弦", badge: "敬请期待" },
      { name: "节拍器", description: "稳稳地练，从慢到快", badge: "敬请期待" },
      { name: "和弦库", description: "常用和弦指法速查", badge: "敬请期待" },
    ],
  },
} as const;

export type SiteConfig = typeof siteConfig;
