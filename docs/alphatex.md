# alphaTex 语法速查（屿琴项目版）

> 面向 alphaTab **1.8.4**（`package.json` 里锁的版本）。
> **本文每一条都在本机跑过 alphaTab 真实解析器验证**：跑不通的写法不会出现在「可用」表里，
> 只有「⚠️ 坑」一节会写那些失败/报错的写法。凡是没有实测过的，都会显式标注「未验证」。
>
> 验收脚本：`pnpm tex:verify <文件>`——它做的就是「用真 alphaTab 解析一遍 + 逐音核对」。
> 外部谱面转进来：`pnpm tex:from-xml <文件.musicxml> -o songs/<id>/score.tex`

---

## 0. 为什么本站只有这一种谱面格式

`score.tex`（alphaTex）是本项目**唯一**的谱面存储格式，理由见 `docs/adr/0002`：

- 纯文本，`git diff` 看得懂，改一个品就是一个字符
- alphaTab 原生格式，不需要经过 MIDI 这一层做有损转换
- `songs/<id>/score.tex` + `meta.json` 就是一首歌的全部，`src/songs/index.ts` 自动索引

**谱面不是代码**：`score.tex` 是「作者写的样子」，任何时候都不要让程序去改写它，
程序的活儿只是**在内存里补东西**（典型例子：`src/lib/songTex.ts` 补 `\instrument`）。

---

## 1. 文件骨架

```
\tempo 154                  ← ① 元数据段（score / staff / bar 级指令都在这里）
\title "千本樱"
.
\tuning (a4 e4 c4 g4)       ← ② 谱面段（定弦、拍号、每个小节）
\ts (4 4)

:8 (0.1 1.2 2.3 2.4) {bd} | ← ③ 谱体：一行一个小节，`|` 收尾
:8 0.3 1.2 0.4 0.4 0.1 0.1 0.1 0.1 |
```

| 记号 | 作用 | 本站约定 |
| --- | --- | --- |
| `.` | 元数据段与谱面段的分隔符 | **必须保留**。alphaTab 1.8.4 会警告 `P/400`「点号可以删掉」，但 `songTex.ts` 补 `\instrument` 时要靠它定位，删了补行就失准 |
| `\|` | 小节线 | 一行一个小节，行尾加 ` \|` |
| `//` `/* */` | 注释 | 可放心用（`/* 多行 */` 实测通过） |
| 空格 | 音符之间的分隔 | **`:N` 后面必须有空格**，`:8(0.1 …)` 会被当成一个 token（见「坑」） |

> alphaTab 1.8.4 起 `.` 是可选的（会提示 `P/400`）。**但本站不要删**——理由同上。

---

## 2. 元数据指令

### 2.1 取值写法

```text
\title "千字樱"          ← 单值：字符串用双引号包起来
\subtitle "…"           ← 引号可选（\title t 实测也能解析），但本站统一加引号
\title "a \"b\" c"      ← 内嵌引号要转义，否则字符串提前闭合（见 §8 第 13 条）
\tuning (a4 e4 c4 g4)   ← 多值：必须用括号包成一组
\tuning a4 e4 c4 g4     ← 也能解析，但 alphaTab 会警告 P/301（"should be wrapped into parenthesis"）
```

⚠️ 本站两份老谱面写法不一致（`aoi-shiori` 用无括号、`senbonzakura` 用括号）。
**新写的统一用括号**，因为无括号会持续吐警告，混在真警告里容易漏看。

### 2.2 本站实际用到的

| 指令 | 作用 | 例 |
| --- | --- | --- |
| `\title` | 曲名 | `\title "千本樱"` |
| `\subtitle` | 副标题 | `\subtitle "尤克里里单音指弹版"` |
| `\artist` | 艺术家 | `\artist "周杰伦"` |
| `\album` | 专辑 | `\album "叶惠美"` |
| `\tempo` | 速度 | `\tempo 75` |
| `\instrument` | 音色（GM 编号，**0 基**） | `\instrument 24`（24 = 尼龙吉他 = 站点统一音色 `SITE_INSTRUMENT`） |
| `\tuning` | 定弦 | `\tuning (a4 e4 c4 g4)` |
| `\ts` | 拍号 | `\ts (4 4)` |
| `\ks` | 调号 | `\ks dminor`（见 2.4） |

### 2.3 完整清单（从 1.8.4 的签名表里抄的，未逐条实测）

- **score 级**：`title` `subtitle` `artist` `album` `words` `music` `wordsandmusic` `copyright`
  `copyright2` `instructions` `notices` `tab` `systemsLayout` `defaultSystemsLayout` `showDynamics`
  `hideDynamics` `useSystemSignSeparator` `multiBarRest` `extendBarLines` `chordDiagramsInScore`
  `hideEmptyStaves` `hideEmptyStavesInFirstSystem` `defaultBarNumberDisplay` …
- **staff 级**：`tuning` `chord` `capo` `lyrics` `articulation` `displayTranspose` `transpose`
  `instrument` `bank` `ts` `clef` `ottava` `tempo` `accidentals` `barnumberdisplay` `beaming` `scale` `width`
- **结构级**：`track` `staff` `voice` `section`
- **小节级**：`ts` `ro` `rc` `ks` `clef` `ottava` `tempo` `simile` `barlineLeft` `barlineRight`
  `scale` `width` `sync` `accidentals` `barnumberdisplay` `beaming`

⚠️ **`\ro` / `\rc`（反复记号）和 `\clef tab` 在本机实测解析失败**，别用。
反复段落只能老老实实把谱体抄两遍（本站 `senbonzakura` 就是这么处理的）。

### 2.4 调号 `\ks`（实测踩过）

alphaTab 的调号只认**音名**，不认 `<fifths>` 数字。实测：

| 写法 | 结果 | 说明 |
| --- | --- | --- |
| `\ks f` | 1 个降号 ✓ | F 大调 |
| `\ks f#` | 6 个升号 ✓ | |
| `\ks bb` | 2 个降号 ✓ | |
| `\ks aminor` | 0 ✓ | A 小调 |
| `\ks dminor` | 1 个降号 ✓ | D 小调 —— **这是正确写法** |
| `\ks (d minor)` | 2 个升号 ✗ | 括号+空格：`minor` 被丢掉，当成 D 大调了 |
| `\ks dm` | 解析失败 ✗ | 不支持缩写 |
| `\ks -1` | 解析失败 ✗ | 不接受数字 |

**结论：小调写成 `<音名>minor`，中间不能有空格，不要加括号。**

---

## 3. 拍（beat）的语法顺序

一个「拍」= 同一时刻要响的一组音。它的书写顺序：

```text
[ :时值 ]  音符…  [ {效果…} ]
                    ↑ 附点 / 连音 / 刷弦 / 力度… 都塞进这一个组
```

实测要点：

- **时值前缀 `:N` 是「粘性」的**：写一次 `:8` 之后，后面的音都按八分算，直到出现新的 `:N`。
  本站两份谱面风格不同（`aoi-shiori` 靠粘性省字，`senbonzakura` 每拍都重写）。
- **时值后面必须有空格**：`:8(0.1 1.2)` ≠ `:8 (0.1 1.2)`。
- **拍级效果只能有一个 `{...}` 组**。`(0.1 1.2){bd} {d}` 实测**解析失败**，必须合并成 `(0.1 1.2){d bd}`。
- **合并时附点要写在前**：`{d bd}` 与 `{bd d}` 都能解析，但默认刷弦时长不同——
  `{d bd}` → 90 tick（按附点后的拍长算），`{bd d}` → 60 tick（算的时候还没加附点）。**统一写 `{d bd}`。**
- 音符自己还能再挂一个 `{...}`：`:4 0.3{h} {bd}` 是合法的（前一个给音，后一个给拍）。

---

## 4. 音符怎么写

| 写法 | 含义 | 例 |
| --- | --- | --- |
| `品.弦` | 单个音 | `0.1` = 第 1 弦空弦（A4）；`2.4` = 第 4 弦第 2 品（也是 A4） |
| `(a b c)` | 和弦：**同一拍**同时响 | `(0.1 1.2 2.3 2.4)` = C 和弦（A-C-E-A） |
| `r` | 休止 | `:4 0.1 r r r` |
| `x.弦` | 死音（左手闷掉） | `x.2` = 第 2 弦闷掉；等价于给普通音挂 `{x}` |

### ⚠️ 弦号只有一套，但它和 alphaTab 内部编号相反

写谱面时只认这一条：

> **弦号 1 = 最高的那根弦 = A4**（纸面 TAB 最上面一行）。
> 4 = 最低的 = G4。

所以 `\tuning (a4 e4 c4 g4)` 的**书写顺序就是弦号 1→4**，而 `0.1` 就是 A 弦空弦。
`CONTEXT.md` 里那条「`Note.string` 反向」说的是**库内部**的编号（内部 1 = 最低弦 G），
写谱面时不用管——但**用 JS 读 `note.string` 时必须换算**（见附录 A）。

### ⚠️ 和弦必须用括号

```text
:4 (0.1 1.2 2.3 2.4)    ← ✓ 一拍四个音同时响
:4 0.1 1.2 2.3 2.4      ← ✗ 四个独立的四分音符，依次弹响
```

### ⚠️ 不写 `\tuning` 会静默变成 6 弦吉他

实测：**只写 `\instrument` 而不写 `\tuning`，弦数会回退成 6 弦标准调弦（E4 B3 G3 D3 A2 E2）**，
此时 `0.1` 会被解释成「6 弦谱的第 1 弦」= E4，音高全错，而且**不报任何错**。

> **尤克里里谱面的第一条铁律：`\tuning` 必须在。**

（`\instrument` 不影响这件事：`\instrument 24` 和不写 `\instrument`，
只要没有 `\tuning`，弦数都是 6。）

---

## 5. 时值

| 写法 | 时值 | alphaTab 内部 tick |
| --- | --- | --- |
| `:1` | 全音符 | 3840 |
| `:2` | 二分 | 1920 |
| `:4` | 四分 | 960 |
| `:8` | 八分 | 480 |
| `:16` | 十六分 | 240 |
| `:32` | 三十二分 | 120 |
| `:64` `:128` | 更细 | 60 / 30 |

（960 tick = 一个四分音符，就是 `src/lib/chord.ts` 里的 `TICKS_PER_QUARTER`。）

| 需求 | 正确写法 | 实测结果 |
| --- | --- | --- |
| 附点 | `{d}` | `:4 0.1{d}` → 1440 tick ✓ |
| 双附点 | `{dd}` | `:4 0.1{dd}` → 1680 tick ✓ |
| 三连音 | `{tu 3}`，**每个音都要标** | `:8 0.1{tu 3} 0.2{tu 3} 0.3{tu 3}` → 各 320 tick ✓ |
| 拍倍数 | `*N`（写在音符之后） | `:4 0.1*3` → 三个四分音符 ✓ |
| 附点 + 倍数 | 两者顺序随意 | `:4 0.1{d}*3` 与 `:4 0.1*3{d}` 都是 3 个附点四分音符 ✓ |

> `{tu N}` 支持 N = 3 / 5 / 6 / 7 / 9 / 10 / 11 / 12。

### ⚠️ 附点**不是** `:4.`

`:4. 0.1`、`:4 0.1.`、`:4 0.1 .` 三种写法**全部解析失败**（`P/202 Unexpected 'Dot' token`）。
附点是一个**拍效果** `{d}`，写在音符后面。

> `src/lib/chord.ts` 的注释里写着顺序是「`:时值 → 音符 → .附点 → *倍数 → {效果}`」，
> 其中「`.附点`」这个说法是**不准确的**——会让人照字面去写 `:4.`。本文件已按实测改正。

---

## 6. 效果一览

写在**音符之后**的 `{...}` 里，多个效果用空格分隔。alphaTab 的解析器会先按音符级匹配，
匹配不到再按拍级匹配——所以**两类效果可以混在一个组里**（`:4 0.3{h bd}` 实测通过）。

### 6.1 拍级效果

| 写法 | 含义 | 备注 |
| --- | --- | --- |
| `{bd}` | BrushDown：**实扫下扫**（4 弦 → 1 弦） | 默认时长 = 该拍时长 × 0.25 ÷ 弦数 |
| `{bu}` | BrushUp：实扫上扫 | 同上 |
| `{bd 120}` | 显式指定刷弦时长（tick） | 本站 `chord.ts` 用这个控制扫弦快慢 |
| `{au}` / `{ad}` | 琶音上 / 下 | 默认时长 = 该拍时长 ÷ 弦数 |
| `{d}` / `{dd}` | 单 / 双附点 | |
| `{tu 3}` | 连音 | 3/5/6/7/9/10/11/12 |
| `{dy ff}` `{dy p}` | 力度 | 支持 `ppp pp p mp mf f ff fff sf sfz fp rfz…` |
| `{tempo 120}` | 拍内变速 | 可写在任意拍上 |
| `{fermata}` | 延长记号 | 可带 `short` / `medium` / `long` |
| `{f}` `{fo}` | 渐强（fade in / out） | |
| `{v}` `{vw}` | 微 / 大揉弦 | |
| `{cre}` `{dec}` | 渐强 / 渐弱 | |
| `{tp}` `{tp buzzroll}` | 震音（tremolo picking） | |
| `{gr}` | 装饰音 | 时值由上下文决定 |
| `{s}` `{p}` | 上 / 下拨弦方向 | |
| `{ch "C"}` | 挂一个和弦名 | |
| `{ds}` | 死打（dead slap） | |
| `{barre 3}` `{barre 3 half}` | 横按 | |
| `{rasg ii}` … | 轮指（弗拉门戈） | |
| `{ot 8va}` `{ot 8vb}` | 移八度 | |
| `{beam up}` `{beam down}` … | 符杠方向 | |
| `{timer}` | 计时器 | |
| `{instrument 25}` `{bank 0}` | 当前拍换音色 | |
| `{lyrics "…"}` `{txt "…"}` | 歌词 / 文本 | |

### 6.2 音符级效果

| 写法 | 含义 |
| --- | --- |
| `{h}` | **击弦/勾弦起点**（hammer-on / pull-off origin） |
| `{-}` 或 `{t}` | **连线终点**（tie destination）——连线后一个音这么写 |
| `{x}` | 死音（与 `x.弦` 等价） |
| `{lr}` | let ring：让音一直延音 |
| `{st}` | 顿音（staccato） |
| `{ac}` / `{hac}` / `{ten}` | 重音 / 强重音 / 保持音 |
| `{pm}` | 右手闷音（palm mute） |
| `{g}` | 幽灵音（ghost note） |
| `{v}` / `{vw}` | 微 / 大揉弦 |
| `{nh}` `{ah}` `{th}` `{ph}` `{sh}` `{fh}` | 自然 / 人工 / 点 / 捏 / 半 / 反馈 泛音 |
| `{sl}` `{ss}` | 滑出：连奏 / 移位 |
| `{sib}` `{sia}` | 滑入：从下方 / 从上方 |
| `{sou}` `{sod}` | 滑出：向上 / 向下 |
| `{psu}` `{psd}` | 推弦滑音 上 / 下 |
| `{tr 12}` `{tr 12 32}` | 颤音（trill）到某品，速度 16/32/64 分 |
| `{lf 2}` `{rf 1}` | 左手 / 右手手指（1=拇指 … 5=小指） |
| `{string}` | 在五线谱上显示弦号 |
| `{hide}` | 隐藏这个音（拍就变成休止） |
| `{turn}` `{iturn}` `{umordent}` `{lmordent}` | 回音 / 逆回音 / 上波音 / 下波音 |
| `{acc #}` `{acc n}` `{acc b}` | 强制变音记号 |
| `{lht}` | 左手点弦 |
| `{slur "a"}` | 连音线（同一 id 成对） |

### ⚠️ `{b}` / `{be}`（推弦）会把 alphaTab 直接弄崩

`0.1{b}` 和 `0.1{b bend}` 实测都抛 `Cannot read properties of undefined`。
尤克里里用不到，**别写**。真要写推弦，必须给完整的弯音点参数（本项目未验证）。

### 6.3 歌词

歌词有**两套写法**，1.8.4 两套都实测通过。它们的语义完全不同，别混。

#### 写法一：`{lyrics "字"}` —— 逐拍显式（推荐）

```text
:4 0.1{lyrics "好"} :4 0.1{lyrics "一"} :4 3.1{lyrics "朵"} :4 5.1{lyrics "美"} |
:4 4.1{lyrics "丽"} :4 4.1 :4 2.1 :2 0.1 |      ← 后三个音没有歌词 = 「一字多音」的拖腔
```

- **文本必须带引号**。`{lyrics 好}` 这种裸中文会报
  `Error parsing arguments: no overload matched arguments ()`，紧接着再报一条
  `Unrecognized property '好'`——**两条错误都不是"歌词"这个词的问题**，很容易看歪。
- 多行歌词写成 `{lyrics (行号 "字")}`，**行号是 0 基**。括号可以省（省了只出一句
  `Property args should be wrapped into parenthesis` 的 Hint，仍能解析），但省了容易和后面
  的属性粘在一起，建议一律加括号。
- 它跟 `{d}` `{bd}` `{h}` 等**同属一个 `{...}` 组**，直接写在一起即可：`{d lyrics "好"}`、
  `{lyrics "好" bd}` 实测都对。**组内顺序随意**（附点在前在后都行）。
- 文本要转义，规则与 `\title` 完全相同（见 §8 第 13 条）：歌词里出现 `"` 会炸掉整份谱面。
- **`{lyrics}` 是拍属性，不是音属性。** 和弦拍 `(0.1 3.2){lyrics "好"}` 只有**一条**歌词。
- **没有任何"一字多音"的语法糖**。拖腔的写法就是：第一个音挂 `{lyrics "字"}`，
  后面的延续音**不写 `{lyrics}`**。谱面上会看到那个字只出现在它起头的音下面。
- **休止拍也能挂歌词**（`r{lyrics "啊"}` 实测通过），拍上有没有音不影响。

#### 写法二：`\lyrics "…"` —— staff 级整段文本，自动逐拍分配

```text
\tuning (a4 e4 c4 g4)
\lyrics "好 一 朵 美 丽 的 茉 莉 花"
:4 0.1 :4 0.1 :4 3.1 :4 5.1 |
```

- 这是**元数据指令**，写在谱体之前，可以带起始小节：`\lyrics 0 "…"`（0 = 第 1 小节）。
  参数不加括号只出 Hint，功能正常。
- 文本是 **Guitar Pro 格式**，**空格分词**。分配规则（`Track.applyLyrics` 实测）：
  从起始小节的第 1 拍开始，**一次跳过一个空拍/休止拍**，**一拍吃一个音节**，文本用完即止。
- ⚠️ **它做不了「一字多音」**——每拍硬吃一个音节。所以像《茉莉花》这种有拖腔的曲子，
  用它一定会错位。**有拖腔就老实写 `{lyrics "…"}`。**
- ⚠️ GP 格式里额外的 `+` / `-` / `[注释]` **别用**。文档说 `+` 是「合并音节」，
  但 1.8.4 实测 `"好 一 + 朵 美"` 得到的 4 个音节是 `好` / `一` / `" "`（一个空格）/
  `朵`——`+` 变成了一个独立音节。`-` 同理变成字面的 `-`，`[x]` 变成空串 `""`。
- `words` 是另一个东西：`\words "…"` 写的是**作词人**，显示在谱头，跟逐音歌词无关。

#### 渲染：不用担心被「只显示 TAB」吃掉

歌词画在 alphaTab 的 **effect band** 上，`shouldCreateGlyph` 只看 `beat.lyrics` 有没有值
（`src/rendering/effects/LyricsEffectInfo.ts`），**跟 `showStandardNotation` 无关**。
所以本站 `ScoreView.tsx` 里那句 `staff.showStandardNotation = false` 不会影响歌词。

实测位置：**落在五线谱（本站是空的那条）与 TAB 之间**，居中在对应音的上方，
跟随 `SCORE_COLORS` 的前景色——亮色下深灰、暗色下浅灰，两套主题都清楚。

窄屏（`barsPerRowMobile: 1`，1 小节/行）歌词间距充裕；但**字号不随行宽缩**，
所以如果哪天把窄屏改成 2 小节/行，歌词会开始横向撞车。

---

## 7. MusicXML ↔ tex 对照

`scripts/musicxml2tex.py` 就是照着这张表实现的；反向（tex → MusicXML）目前没做。

| MusicXML | alphaTex | 备注 |
| --- | --- | --- |
| `<work><work-title>` | `\title "…"` | |
| `<creator type="composer">` | `\artist "…"` | 优先级 composer > lyricist > artist > arranger |
| `<sound tempo="154"/>` | `\tempo 154` | |
| `<time><beats>4</beats><beat-type>4</beat-type>` | `\ts (4 4)` | 小节内变化 → 该小节前插一行 `\ts (n d)` |
| `<key><fifths>-1</fifths><mode>minor</mode>` | `\ks dminor` | 可选 `--key` 才写 |
| `<staff-tuning line="N">A4` | `\tuning (a4 e4 c4 g4)` | **⚠️ 方向陷阱，见下** |
| `<note><pitch>` + `<string>N</string>` + `<fret>F</fret>` | `F.N` | 弦号一致，不用换算 |
| `<note><chord/>` | 塞进同一个 `( … )` | |
| `<note><rest/>` | `r` | |
| `<unpitched>…<notehead>x</notehead>` | `x.N` | 死音 |
| `<duration>` + `<type>` + `<dot/>` | `:N` + `{d}` | 见 7.2 |
| `<notations><arpeggiate direction="down"/>` | `{ad}`（默认）/ `{bd}`（`--brush brush`） | 见 7.3 |
| `<technical><hammer-on type="start"/>` | `{h}` | `<pull-off>` 同样 |
| `<tie type="start">` / `<tie type="stop">` | 在**结束**那个音上写 `{-}` | |
| `<articulations><staccato/>` | `{st}` | `<accent/>`→`{ac}`、`<strong-accent/>`→`{hac}`、`<tenuto/>`→`{ten}` |
| `<technical><harmonic><natural/>` | `{nh}` | artificial→`{ah}`、tap→`{th}` |
| `<lyric number="N"><text>字</text>` | `{lyrics "字"}` | 见 7.4；`number` 是 1 基，tex 侧是 0 基 |
| `<note><grace/>` | *不支持* | 会按普通四分音符处理并给出警告 |
| `<barline><repeat/>` | *不支持* | 提示人工处理 |
| `<backup>` `<forward>` | *不支持* | 多声部会被顺序拼成单声部，给出警告 |

### 7.1 ⚠️ `<staff-tuning line="N">` 的方向

- MusicXML 规范：`line` **从最下面那条线数起**（line 1 = 最底线 = 最低音弦）。
- alphaTab 内部：`staff.tuning[0]` 是**最高音弦**，`<string>1</string>` 也是最高音弦。

于是 alphaTab 读 MusicXML 时算的是 `tuning[弦数 − line]`。
**一旦文件把 line 1 写成「第 1 弦」（手写/AI 生成的文件经常这样），定弦就被读反，每个音的实音都错。**

`senbonzakura.musicxml` 就是这样一份文件（`<pitch>` 与 `<string>/<fret>` 自洽，
但按规范解释会整首移调）。转换器不猜：两种解释各试一遍，用恒等式
`定弦[弦] + 品 == <pitch>` 数命中数，自动选对的那个并打印判定结果。
实测该文件 `document` 命中 323/323、`spec` 命中 0/323 → 判为 document。

### 7.2 时值换算

`<duration>` 的单位是 `<divisions>` 分之一（`divisions=4` 时，四分音符 = 4）。
换算成 `:N` 时按 `<dot>` 数量反推基底，匹配不上再试连音（三连、五连…）。
两种都对不上会给警告并按最近的时值近似（不静默）。

### 7.3 `{bd}` 和 `{ad}` 不是一回事

| tex | alphaTab 枚举 | MusicXML | 默认时长 |
| --- | --- | --- | --- |
| `{bu}` | BrushUp = 1 | — | 拍长 × 0.25 ÷ 弦数 |
| `{bd}` | BrushDown = 2 | — | 拍长 × 0.25 ÷ 弦数 |
| `{au}` | ArpeggioUp = 3 | `<arpeggiate direction="up"/>` | 拍长 ÷ 弦数 |
| `{ad}` | ArpeggioDown = 4 | `<arpeggiate direction="down"/>` | 拍长 ÷ 弦数 |

alphaTab 自己的 MusicXML 导入器把 `<arpeggiate>` 读成 `{au}/{ad}`。
但**本站手写谱面用的是 `{bd}`/`{bu}`**——`senbonzakura` 那 84 处扫弦全是实扫弦，
听感是「一把刷下去」，不是琶音。所以转换器默认忠实映射成 `{ad}/{au}`，
再用 `--brush brush` 换成本站习惯的 `{bd}/{bu}`。

### 7.4 歌词（`<lyric>` ↔ `{lyrics "…"}`）

`musicxml2tex.py` 会读 `<note><lyric>`，转成 `{lyrics "字"}` 挂在那一拍上。

「一字多音」在 MusicXML 侧有两种写法，**两种都不产出音节**（跳过后，字序才不会错位）：

- 延续音干脆不写 `<lyric>`
- 或写成 `<lyric number="1"><extend/></lyric>`（只有 `<extend/>`、没有 `<text>`）

反过来，生成带拖腔的 MusicXML 时，起头那个音要写
`<lyric number="1"><syllabic>begin</syllabic><text>花</text><extend/></lyric>`
（`--no-lyrics` 可整份丢掉歌词）。

⚠️ **`<lyric number>` 是 1 基，alphaTex 的行号是 0 基**，转换器做了减 1。
首行（`number="1"`）写成最简形式 `{lyrics "字"}`，第 2 行起才是 `{lyrics (1 "字")}`。

《茉莉花》是这条链路的实测样本：`songs/molihua/melody.txt` 的 `melody`（音）× `lyrics`（字槽位）
逐音对齐、`-` 表示拖腔延续；它是 `uke-scoregen` 技能的 `scoregen.py` 生成出来的，
语法与限制见 `docs/score-spec.md`。

---

## 8. 坑清单（全部实测）

按「踩到的概率 × 破坏力」排序：

1. **不写 `\tuning` → 静默变 6 弦吉他。** `\instrument` 单独出现救不了。写谱面第一件事就是写定弦。
2. **弦号两套编号。** 写 tex 时弦 1 = 最高弦 A；读 `Note.string` 时 1 = 最低弦 G。
   用 `note.stringTuning`（已换算）而不是 `staff.tuning[note.string-1]`。
3. **和弦不括号 → 变成依次弹响的独立音。** 界面看着还挺像，听感完全不同。
4. **附点是 `{d}`，不是 `:4.`。** 写 `:4.` 直接解析失败。
5. **拍级效果只能一个组：`{d bd}` ✓，`{bd} {d}` ✗。** 顺序也要 `{d}` 在前，否则刷弦时长不对。
6. **`:8(` 之间少个空格就变意思。** `:8(0.1 1.2)` 会被当成一个整体 token。
7. **`. 分隔符不能删。** alphaTab 提示能删，但 `songTex.ts` 靠它定位插入点。
8. **`{b}` 会把 alphaTab 弄崩**（`Cannot read properties of undefined`）。别写推弦。
9. **`\ks` 只认音名，且小调必须写成 `dminor`**（无空格、无括号、无缩写）。
10. **`brushDuration` 会被截断**：alphaTab 内部是
    `brushIncrement = floor(brushDuration / (弦数 − 1))`（4 弦 → 除以 3）。
    所以给 `{bd}` 的 tick 数要留够，否则会出现「弦没扫完」——这就是 `chord.ts` 里
    `strumTiming()` 存在的理由，别绕过它自己算。
11. **`\ro` `\rc`（反复）和 `\clef tab` 不支持**，解析会失败。
12. **`x.2` 就够，不要再挂 `{x}`。** 两者等价，叠着写只是噪声。
13. **字符串里的 `"` 必须转义成 `\"`。** 元数据值是 `"…"` 字面量，
    内嵌引号会提前闭合字符串 —— 而报错只说
    `There are errors in the parsed alphaTex`，**不告诉你在哪一行**，极难定位。
    1.8.4 实测 `\"` 和 `\\` 都支持；`\n` 这类未知转义只吞掉反斜杠、不报错。
    从 MusicXML 转过来的谱面特别容易中招（MusicXML 的 `<work-title>` 常带引号），
    见 `scripts/musicxml2tex.py` 的 `tex_str()`。
14. **歌词不写引号 → 报错信息骗人。** `{lyrics 好}` 报的是
    `Error parsing arguments: no overload matched arguments ()` 加
    `Unrecognized property '好'`，两条都在说「参数」「属性」，
    **完全不提歌词**，会让人以为是别的效果写错了。正确写法是 `{lyrics "好"}`。
15. **指令名是复数 `lyrics`。** 单数的 `\lyric` 报 `Unrecognized metadata 'lyric'`，
    `{lyric …}` 报 `Unrecognized property 'lyric'`；`\words` 是**作词人**、不是歌词。
    另外 `{txt "…"}` 是拍文本、`{tx …}` 不存在 —— 这类「少一个字母」的错误
    全都报成 "Unrecognized"，只能靠 `docs/alphatex.md` 的清单对照，别凭记忆写。

---

## 9. 怎么验收一份谱面

```bash
# ① 静态体检：解析 + 逐音核对 + 每小节时值对拍号
pnpm tex:verify                       # 不带参数 = 扫 songs/<id>/score.tex 全跑一遍
pnpm tex:verify songs/<id>/score.tex  # 也可以只查一份

# ② 从外部谱面转进来
pnpm tex:from-xml in.musicxml -o songs/<id>/score.tex
pnpm tex:verify songs/<id>/score.tex --against-xml in.musicxml   # 逐拍比对
pnpm tex:verify a.tex --against b.tex                            # 两份 tex 互比

# ③ 耳朵验收
pnpm dev
```

`verify` 检查三件事：

1. **解析无错**（lexer / parser / semantic 三级诊断，`P/400` 那类提示会单独列出来）
2. **逐音恒等式**：`空弦音 + 品 == 实音` —— 弦号写反、定弦写错的唯一可靠探针
3. **每小节时值 == 拍号要求** —— 少拍/多拍会被抓出来

> ⚠️ 音频相关的验收必须走 `agent-browser click`（无头环境里 `element.click()` 不算用户激活），
> 这一点见项目 `MEMORY.md`。

---

## 附录 A：alphaTab 内部编号（写给写代码的人）

| 概念 | 规则 |
| --- | --- |
| alphaTex 弦号 | 1 = 最高音弦（A4）——和纸面 TAB 最上面一行一致 |
| `Note.string` | 1 = 最低音弦（G4）。换算：`Note.string = 弦数 − alphaTex弦号 + 1` |
| `staff.tuning[]` | index 0 = 第 1 弦 = 最高音弦。`[69, 64, 60, 67]` ↔ `a4 e4 c4 g4` |
| MusicXML `<staff-tuning line>` | line 1 = 最底线。alphaTab 用 `tuning[弦数 − line]` |
| 某音的空弦音 | `note.stringTuning`（= `staff.tuning[弦数 − Note.string]`），已含 capo |
| 某音的实音 | `note.realValue` = 空弦音 + `note.fret` |
| 时基 | 960 tick = 四分音符 |
| `BrushType` | 1 = BrushUp，2 = BrushDown，3 = ArpeggioUp，4 = ArpeggioDown |
| `\instrument` 默认 | 25（钢弦吉他）。站点在 `songTex.ts` 里统一补成 **24 尼龙吉他**（`SITE_INSTRUMENT`） |
| `\tuning` 缺省 | **6 弦吉他标准调弦**（不是尤克里里！） |

## 附录 B：本站谱面的写法差异

| | `aoi-shiori` | `qingtian-intro` | `molihua` |
| --- | --- | --- | --- |
| 定弦写法 | `\tuning a4 e4 c4 g4`（无括号） | 无括号 | `\tuning (a4 e4 c4 g4)` |
| 拍号写法 | `\ts 4 4` | `\ts 4 4` | `\ts (4 4)` |
| 时值 | 靠粘性省字 | 靠粘性 + 每拍写 | 每拍都写 |
| `\instrument` | 无（由 `songTex.ts` 补） | 无 | 无 |
| 效果 | 无 | 无 | 歌词 `{lyrics "…"}` |
| 小节数 | 10 | 4 | 16 |

**新写的谱面按 `molihua` 的风格来**（括号元数据 + 每拍写时值 + 和弦加空格），
理由：显式 > 隐式，`git diff` 也更干净。

> 早先还有一份 `senbonzakura`（19 小节，带 `{bd}`/`{bu}`/`{h}`/`x.N` 这些效果记号），
> 2026-09-17 已从仓库移除。本文其它地方仍把它当例子引用 —— 那些是历史记录，
> 它演示的写法本身并没有失效。
