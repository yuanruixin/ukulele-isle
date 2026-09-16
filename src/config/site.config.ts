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

/** 和弦库里的一个和弦 */
export interface ChordConfig {
  /** 和弦名（卡片标题） */
  name: string;
  /**
   * ★ 各弦品位，**顺序与 alphaTab 一致：高音弦在前**
   *   —— 也就是 [1弦 A, 2弦 E, 3弦 C, 4弦 G]。
   *   -1 表示该弦不弹（图上画 ×）。
   */
  frets: number[];
  /**
   * ★ 各弦手指编号，与 frets 一一对应：
   *   1 = 食指，2 = 中指，3 = 无名指，4 = 小指，0 = 不按（空弦或不弹）。
   *   只影响图上圆点里的数字，不影响发声。
   */
  fingers: number[];
}

/** 虚拟尤克里里的一根弦 */
export interface UkeStringConfig {
  /** 弦序：1 = 最高音的那根（与 alphaTab 的弦序、调音器的编号习惯一致） */
  id: number;
  /** 空弦音名 */
  note: string;
  /** 空弦八度 */
  octave: number;
  /** 弦号文案（读数里显示「3 弦」这类） */
  label: string;
  /** 图上这根弦的粗细（指板坐标系的 SVG 单位） */
  width: number;
}

export const siteConfig = {
  /** 站点名称（导航栏 / 标题） */
  siteName: "屿琴",
  /** 站点副标题 */
  tagline: "四根弦上的晴天",

  /** ★ 外观（亮 / 暗模式） */
  theme: {
    /** ★ 首次访问的默认外观：'system' = 跟随系统；也可写死 'light' / 'dark'（之后一律以用户的选择为准） */
    defaultMode: "system" as "light" | "dark" | "system",
    /**
     * ★ 记住用户选择所用的 localStorage 键名。
     *   ⚠️ index.html 里的首帧脚本（防止刷新时闪一下相反底色）用的就是这个字符串，改名要一起改。
     */
    storageKey: "yq-theme",
  },

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
      {
        name: "和弦库",
        description: "C F Am G · 点一下听声音",
        to: "/tools/chords",
      },
      {
        name: "虚拟尤克里里",
        description: "点指板出声 · 能录能回放",
        to: "/tools/uke",
      },
    ] as ToolItem[],
  },

  /** ★ 和弦库 */
  chords: {
    /** ★ 试听音量（0 - 1） */
    volume: 1,
    /** ★ 扫弦总跨度（毫秒）：四根弦从第一根到最后一根的间隔，越小越像「一下扫过」 */
    strumSpreadMs: 160,
    /** ★ 扫完之后余音时长（秒）：决定和弦按住能响多久 */
    ringSeconds: 2.4,
    /**
     * ★ 试听用的调弦（alphaTex 写法，**高音弦在前** = 1弦→4弦）。
     *   需与上方 tuner.strings 保持一致：换 Low-G / 男声调弦时两处都要改。
     */
    tuning: "a4 e4 c4 g4",
    /**
     * ★ 和弦列表 —— 数组顺序 = 页面显示顺序。
     *   默认按 C 调的 I–IV–vi–V（弹唱万能和弦走向）排列，不是按字母排。
     *   指法顺序见 ChordConfig.frets 的说明（高音弦在前）。
     */
    items: [
      { name: "C", frets: [3, 0, 0, 0], fingers: [3, 0, 0, 0] },
      { name: "F", frets: [0, 1, 0, 2], fingers: [0, 1, 0, 2] },
      { name: "Am", frets: [0, 0, 0, 2], fingers: [0, 0, 0, 2] },
      { name: "G", frets: [2, 3, 2, 0], fingers: [2, 3, 1, 0] },
    ] as ChordConfig[],
  },

  /** ★ 虚拟尤克里里（点指板出声 + 录制回放） */
  uke: {
    /** ★ 试听音量（0 - 1） */
    volume: 1,
    /** ★ 指板到第几品（也是可弹音域：谱面数据按这个范围生成） */
    frets: 12,
    /** ★ 窄屏（<640px）只显示到第几品：12 品在手机上每格不到 20px，手指点不准 */
    fretsMobile: 7,
    /** ★ 桌面端的弦间距（指板坐标单位）= 每格的高度 */
    rowGap: 40,
    /**
     * ★ 窄屏的弦间距：竖置时指板按剩余高度等比缩放，弦间距给大一些
     *   ——它决定每根弦那一列有多宽（约 = 该值 × 缩放比），太小手指就点不准。
     *   调大还会让整块指板变宽（比例上更铺满屏宽），但格子本身的大小由高度决定、不受影响。
     */
    rowGapMobile: 64,
    /** ★ 余音时长（秒）：决定这个音能响多久，也是弦晃动的衰减时长 */
    ringSeconds: 2.2,
    /** ★ 弦晃动幅度（指板坐标系单位，约为弦间距的 1/6） */
    wobbleAmplitude: 6,
    /** ★ 弦来回晃动的频率（Hz）——**视觉频率，不是音高**（音高由音色库决定） */
    wobbleHz: 14,
    /** ★ 录制上限（个音） */
    maxRecordNotes: 120,
    /** ★ 回放时最后一个音响完再等多久收尾（毫秒） */
    replayTailMs: 400,
    /**
     * ★ 调弦（alphaTex 写法，**高音弦在前**）。
     *   需与 tuner.strings / chords.tuning 保持一致：换 Low-G / 男声调弦时三处都要改。
     */
    tuning: "a4 e4 c4 g4",
    /**
     * ★ 弦在指板上的堆叠顺序。**一个开关同时决定横置与竖置**——竖置只是把横置的指板
     *   顺时针转 90°，横置的「上 → 下」对应竖置的「右 → 左」：
     *   - `"1-4"`（默认）：横置 上→下 = 1,2,3,4 弦；竖置 4 弦在**左**、1 弦在右
     *   - `"4-1"`：横置 上→下 = 4,3,2,1 弦；竖置 4 弦在**右**、1 弦在左
     *   `"1-4"` 与 TAB 谱的弦序一致（TAB 最上面那根线就是 1 弦 A，本项目里也是音最高的那根）。
     *   ⚠️ 键盘键位行与弦的对应关系会跟着一起翻，不用另外改（见 lib/ukeKeys.ts）。
     */
    stringOrder: "1-4" as "1-4" | "4-1",
    /**
     * ★ 四根弦，**顺序与 alphaTab 一致：高音弦在前（1 弦 → 4 弦）**。
     *   这里定义的是**弦序本身**（哪根叫 1 弦、什么音），**画在指板的哪个位置由上面的
     *   `stringOrder` 决定**——两件事分开，改摆放不会动到音。
     *   width 是按真实弦径给的（3 弦 C 最粗、1 弦 A 最细）。
     */
    strings: [
      { id: 1, note: "A", octave: 4, label: "1 弦", width: 1.4 },
      { id: 2, note: "E", octave: 4, label: "2 弦", width: 1.9 },
      { id: 3, note: "C", octave: 4, label: "3 弦", width: 2.5 },
      { id: 4, note: "G", octave: 4, label: "4 弦", width: 1.7 },
    ] as UkeStringConfig[],
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
