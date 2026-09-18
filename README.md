# 屿琴 · 尤克里里学习网站

> 四根弦上的晴天

一个**纯静态、无后端**的尤克里里学习站点：看谱、听声、跟练、校音四件事收在同一个网站里完成。React 18 + Vite 7 + TypeScript + Tailwind v4，构建产物丢到任意静态托管即可。

**在线访问：<https://ukulele-isle.vercel.app/>**

[English](README.en.md) · [项目术语表](CONTEXT.md) · [架构决策记录](docs/adr/)

![首页](docs/images/home.png)

---

## 它有什么

| 模块 | 路由 | 说明 |
| --- | --- | --- |
| 首页 | `/` | **整个首页就是一间猫咖**，占满导航栏以下整屏。四只猫按各自的性子待在**四个不同的高度**上（猫架 / 吧台 / 高脚凳 / 坐垫），动效由迪士尼准则驱动且完全确定；入口是从屋顶垂下来的两块**吊牌**，点牌子进对应页面 |
| 曲谱库 | `/songs` | 按标题 / 艺术家 / 标签本地实时搜索；歌曲清单由 `songs/` 目录在构建时自动索引，加歌不用改任何注册代码 |
| 曲谱详情 | `/song/:id` | alphaTab 渲染 **TAB 四线谱** + 播放控制条（播放 / 暂停 / 静音 / 变速 / 节拍高亮）。不使用原曲音频，音源就是谱面本身 |
| 调音器 | `/tools/tuner` | 麦克风实时音高检测（Web Audio 自相关），**手动选弦 / 自动识别**双模式互斥，音分刻度盘 + 琴头选弦，已校准的弦逐弦保持绿点 |
| 和弦库 | `/tools/chords` | C / F Am G 指法图（自绘 SVG）+ 点击试听；图上圆点点亮与发声共用同一套计时换算，图与声不会各走各的 |
| 虚拟尤克里里 | `/tools/uke` | 点指板 / 键盘弹奏，带录制回放与键位图例；手机竖屏为竖置指板，整页锁在一屏内 |

此外：全站**亮 / 暗两套配色**（首次跟随系统，之后记住手动选择）、毛玻璃吸顶导航、全站图标统一入口。

## 截图

| 首页（亮） | 首页（暗） |
| --- | --- |
| ![首页](docs/images/home.png) | ![首页·暗色](docs/images/home-dark.png) |
| **曲谱库** | **曲谱详情** |
| ![曲谱库](docs/images/songs.png) | ![曲谱详情](docs/images/song.png) |
| **调音器** | **和弦库** |
| ![调音器](docs/images/tuner.png) | ![和弦库](docs/images/chords.png) |
| **虚拟尤克里里（桌面）** | **虚拟尤克里里（手机竖屏）** |
| ![虚拟尤克里里](docs/images/uke.png) | ![虚拟尤克里里·移动端](docs/images/uke-mobile.png) |

## 快速开始

环境要求：**Node ≥ 20.19**（Vite 7 的最低要求）。包管理器：**pnpm**。

```bash
pnpm install        
pnpm dev            # 开发服务器 → http://localhost:5173
```

构建与预览：

```bash
pnpm build          # tsc -b && vite build → dist/
pnpm preview        # 本地预览 dist/ 产物
pnpm analyze        # 依赖体积分析 → dist/stats.html（日常 build 不会生成）
```

部署：`dist/` 是纯静态产物，直接托管即可 —— 线上版本跑在 Vercel：<https://ukulele-isle.vercel.app/>。路由用 **HashRouter**（形如 `/#/songs`），所以**不需要任何服务端 rewrite 规则**，也没有 404 页。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 曲谱渲染与播放 | `@coderline/alphatab` 1.8.4（内置 SoundFont 播放器，动态 import 独立 chunk） |
| 框架 | React 18 + `react-router-dom` 6（HashRouter） |
| 构建 | Vite 7 + TypeScript 5.9 |
| 样式 | Tailwind v4（`@tailwindcss/vite`）+ CSS 变量主题令牌 |
| 状态 | Zustand 5 |
| 图标 | `lucide-react`；库里没有的语义才在 `src/components/icons/index.tsx` 内联手写 |

## 项目结构

```
songs/                    曲谱数据 —— 一首歌一个文件夹
  <id>/meta.json            标题 / 艺术家 / 标签 / 简介
  <id>/score.tex            alphaTex 谱面（手写，或由 melody.txt 生成）
  <id>/melody.txt           简谱输入，可选（生成路径见 docs/score-spec.md）
src/
  config/site.config.ts ★ 站点全部可调项（外观 / 播放 / 入口 / 和弦 / 尤克里里 / 调音器）
  pages/                  7 个页面
  components/             组件（chords / tuner / uke / icons / scene / cats 等分子目录）
    scene/                首页那一幕场景：HomeScene 组装层 + 吊牌 / 唱片机 / 道具
  hooks/                  播放器与音频接线（useSynthFx / useTuner / useChordPlayer / useUkulelePlayer / useUkuleleRecording）
  lib/                    与页面无关的纯逻辑（synthFx / pitch / chord / ukulele / ukeKeys / songTex / catMotion）
  data/                   小猫骨架**元数据**（cats.ts，生成物）+ 手写的几何投递层（catArt.ts）
  assets/cats/*.svg       小猫骨架**几何**（生成物，一个姿态一个文件，可读可 diff）
    ★ 首页场景里猫的站位不在这里，在 `styles/globals.css` 的 `.home-scene .cat[data-pose]`
  store/                  Zustand：themeStore / playerStore
  songs/index.ts          构建时扫描 songs/ 生成歌曲索引
public/
  font/  images/  soundfont/  icons/
docs/
  adr/                    14 篇架构决策记录
  images/                 README 截图
  alphatex.md             alphaTex 语法速查
  score-spec.md           简谱 spec 语法（配合 python3 .agents/skills/uke-scoregen/scripts/scoregen.py）
  musicxml-sources.md     上哪儿找谱面（来源分级 / 版权）
scripts/                  站点工具：verify-tex.mjs（tex:verify）；musicxml2tex.py 是技能里那份的软链
.agents/skills/
  uke-scoregen/           项目级技能（自洽一整包）：简谱 → 谱面，自带 scoregen.py + musicxml2tex.py
  bitmap-to-svg-replica/  位图逐像素描摹成 SVG，再拆件 + 归一化成动画骨架（SVG 文件 + 元数据）
  svg-character-motion/   骨架 → 确定性动效引擎的工程约定与坑
  disney-animation-rule-skill/  12 条动画准则 → 可执行规则
CONTEXT.md                领域术语表（改代码前先读）
```

技能的真身放在 **`.agents/skills/`**（这个目录进 git）；WorkBuddy 的发现路径
`.workbuddy/skills/<name>` 是一条**软链接**指过去（`.workbuddy` 已在 `.gitignore` 里）。
每个技能都是自洽的一包（脚本只住自己目录），所以整包搬走不会断；
`uke-scoregen` 的 `musicxml2tex.py` 同时被 `pnpm tex:from-xml` 用，`scripts/` 下留的是软链。

## 配置

站点级可调项集中在 ★ **`src/config/site.config.ts`**，按用途分块：

| 配置块 | 管什么 | 常用项 |
| --- | --- | --- |
| `theme` | 外观 | `defaultMode`（`system` / `light` / `dark`）、`storageKey` |
| `player` | 曲谱播放与谱面 | `defaultSpeed`、`speedOptions`、`barsPerRow`(2) / `barsPerRowMobile`(1)、`equalBarWidth`、`scale`、`beatHighlight`、`instrument`、`fx` |
| `chords` | 和弦库 | `items`（增删和弦）、`strumSpreadMs`(160)、`ringSeconds`(2.4)、`tuning`、`instrument`、`fx` |
| `uke` | 虚拟尤克里里 | `frets`(12) / `fretsMobile`(7)、`rowGap` / `rowGapMobile`、`ringSeconds`(2.2)、`stringOrder`、`strings`、`tuning`、`maxRecordNotes`、`fx` |
| `tuner` | 调音器 | `strings`（GCEA 各弦频率）、`toleranceCents`(5)、`rangeCents`(50)、`defaultAuto`、`debug` |
| `nav` / `tools.items` | 导航与工具入口 | 入口文案、路径、图标、角标 |

顶层的 `SITE_INSTRUMENT`（默认 **24 尼龙吉他**）是三个播放器**共用**的音色号。

### 添加一首曲子

1. 新建 `songs/<id>/`，**文件夹名就是路由里的 id**（`/#/song/<id>`）。
2. `meta.json`：

   ```json
   {
     "title": "晴天 · 前奏",
     "artist": "周杰伦",
     "tags": ["指弹", "单音", "入门"],
     "description": "一句话简介，显示在曲谱卡片上。"
   }
   ```

3. **谱面二选一**：
   - **手写 `score.tex`**（alphaTex 文本谱面）：完全可控，技巧记号随便写。**不必写 `\instrument`** —— 加载时会在内存里补上默认音色（谱面自己写了就放行、不覆盖）；若手动写，**必须放在 `.` 之后、`\tuning` 之前**。
   - **从简谱生成**：在同一个目录写 `melody.txt`（中文世界通用的简谱数字 + 逐音歌词），一条命令出谱面 ——

     ```bash
     python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id>                # → score.tex（站点直读）
     python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id> -f musicxml    # → <id>.musicxml（给 MuseScore 等）
     python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id> -f both        # 两份都要
     ```

     只覆盖**单旋律**（民歌、童谣、单音指弹）；和弦、多声部、击勾弦/滑音走 `tex:from-xml`。
     语法与限制见 **[docs/score-spec.md](docs/score-spec.md)**，现成例子 `songs/molihua/melody.txt`。
4. 生成或改完谱面，跑 `pnpm tex:verify` 复核（真 alphaTab 解析 + 逐音核对）。
5. 刷新页面即可看到，**无需修改任何索引文件**。

### 添加一个和弦

只改 `siteConfig.chords.items` —— 指法图与试听谱都从它派生，「图上画的」与「耳朵听到的」永远一致。

- `frets` 的顺序与 alphaTab 一致 = **高音弦在前**，即 `[1弦 A, 2弦 E, 3弦 C, 4弦 G]`；而**图上的横向**是最左 4 弦 G、最右 1 弦 A，两者相反，是最容易录反的地方。
- `-1` 表示该弦不弹（图上画 ×）；`fingers`（1 食指 / 2 中指 / 3 无名指 / 4 小指）只影响圆点里的数字，不影响发声。

### 换一套调弦

`tuner.strings`（频率 Hz）、`chords.tuning`、`uke.tuning`（alphaTex 写法，高音弦在前）**三处要一起改**，否则「听到的音」与「图上的音」会不一致。

## 关于音色

alphaTab 在谱面未指定音色时默认给 **25 = 钢弦吉他**，而尤克里里是**尼龙弦** —— 这是全站「声音发尖」的头号原因。本项目做了两件事：

- 全站改用 **24 尼龙吉他**（General MIDI 表里没有尤克里里这一号，24 是最接近的）；
- 在合成器输出后挂一条**低通 + 卷积混响**支路。alphaTab 的合成器本身不带任何效果，音色库也自述 no reverb、采样上限仅 11–32kHz，所以直出又干又贴耳。三个播放器各有一条链、**共用同一份实现**（逻辑在 `src/lib/synthFx.ts`，接线在 `src/hooks/useSynthFx.ts`），参数按内容形态微调：曲谱是复音连续播放、混响湿度取 0.15；和弦库与虚拟尤克里里是「拨一下等余音」的一次性发声、取 0.25。

⚠️ **页面上没有音色开关**：有没有这条链只由配置里的 `fx.enabled` 决定，改完刷新页面。理由与实测数据见 [ADR 0009](docs/adr/0009-uke-timbre-and-synth-fx.md) / [ADR 0010](docs/adr/0010-timbre-and-fx-for-all-players.md)。

## 已知限制

- **虚拟尤克里里是单音**：后一个音会掐掉前一个音的余音（alphaTab 一次性 MIDI 的行为）；想叠加和弦请用和弦库。
- 播放力度固定（velocity 95），无法表现强弱。
- 音色库采样上限 11–32kHz，高频以噪声代替。
- 和弦库首次点击到发声有 150–200ms 延迟（代价是进页时后台静默预载约 4.3MB，换来点击即响）。
- 调音器需要真实麦克风；**输入设备若选成虚拟声卡（BlackHole 等），会表现为「拨弦毫无反应」**。
- `index.html` 里图标的 `type` 与实际 `.ico` 格式不符（靠浏览器嗅探才正常），尚未修正。

## 文档

- **[CONTEXT.md](CONTEXT.md)** —— 领域术语与共享语言：曲谱 / 和弦 / 虚拟尤克里里 / 音色 / 调音 / 页面。**改代码前先读它**。
- **[docs/alphatex.md](docs/alphatex.md)** —— alphaTex 语法速查：本站唯一谱面格式，每条都跑过真解析器。
- **[docs/score-spec.md](docs/score-spec.md)** —— 简谱 spec 语法：从零写一首歌的入口（`python3 .agents/skills/uke-scoregen/scripts/scoregen.py`）。
- **[docs/musicxml-sources.md](docs/musicxml-sources.md)** —— 上哪儿找谱面：来源分级、版权规则、20 份真实谱面实测。
- **[docs/adr/](docs/adr/)** —— 14 篇架构决策记录：

  | ADR | 主题 |
  | --- | --- |
  | [0001](docs/adr/0001-alphatex-as-score-format.md) | 用 alphaTex 作为曲谱存储格式 |
  | [0002](docs/adr/0002-file-driven-song-registry.md) | 文件驱动的歌曲注册与配置机制 |
  | [0003](docs/adr/0003-tailwind-custom-apple-hig-ui.md) | Tailwind + 自定义组件实现 Apple HIG 风格 |
  | [0004](docs/adr/0004-alphatab-built-in-player.md) | alphaTab 内置播放器实现演奏与节拍高亮 |
  | [0005](docs/adr/0005-tuner-pitch-detection.md) | 调音器：自相关检测 + 手动 / 自动双模式 |
  | [0006](docs/adr/0006-chord-library-diagrams-and-audition.md) | 和弦库：自绘 SVG 指法图 + 复用 alphaTab 试听 |
  | [0007](docs/adr/0007-virtual-ukulele-instead-of-metronome.md) | 虚拟尤克里里（替换原「节拍器」规划） |
  | [0008](docs/adr/0008-uke-keyboard-and-portrait-one-screen.md) | 键盘映射、移动端竖置与一屏展示 |
  | [0009](docs/adr/0009-uke-timbre-and-synth-fx.md) | 音色与输出效果链（换尼龙吉他 + 低通混响） |
  | [0010](docs/adr/0010-timbre-and-fx-for-all-players.md) | 音色与效果链推广到全站三个播放器 |
  | [0011](docs/adr/0011-home-cat-motion-engine.md) | 首页那排小猫：描摹稿 → 骨架 → 确定性动效引擎 |
  | [0012](docs/adr/0012-motion-art-as-svg-files.md) | 骨架几何外置成 SVG 文件，数据模块只留元数据 |
  | [0013](docs/adr/0013-home-scene-instead-of-a-row.md) | 首页改成一幕场景，靠「位置」破整齐 |
  | [0014](docs/adr/0014-home-scene-fullscreen-and-heights.md) | 首页场景占满全屏，并靠「分层落脚面」做出高低 |

开发约定：**先读再改**（本仓库手工调整过的文件不少），改完把代码注释与 `CONTEXT.md` 一起同步。

## 素材与许可

| 素材 / 依赖 | 许可 |
| --- | --- |
| alphaTab（`@coderline/alphatab`） | MPL-2.0 |
| lucide-react | ISC |
| Bravura 音乐字体（`public/font/`） | SIL OFL 1.1 |
| SONiVOX EAS 音色库（`public/soundfont/`） | Apache-2.0 |
| 琴头图片、站点图标 | 项目自有素材 |

本仓库目前**未声明开源许可证**（仓库内没有 LICENSE 文件）。
