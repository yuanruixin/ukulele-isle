# 简谱 spec → 谱面（`uke-scoregen` 技能）

> 上游文档：`docs/alphatex.md`（tex 语法与坑）、`docs/musicxml-sources.md`（上哪儿找谱）
> 一条命令：`python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id> [-f tex|musicxml|both]`
>
> 本文里的每一条都跑过：示例就是 `songs/molihua/melody.txt`，
> 它生成出来的 `score.tex` 与站点线上版本**逐字节一致**。

---

## 0. 什么时候用它，什么时候别用

| | 用什么 |
| --- | --- |
| 民歌、童谣、单音指弹、前奏 riff —— 脑子里有简谱数字就能写出来 | **本工具**（`scoregen.py`，见 §1） |
| 和弦、多声部、击勾弦 / 滑音 / 扫弦 / 闷音 | `pnpm tex:from-xml`（先用 MuseScore 之类排好再转） |

`scoregen` **刻意只做单旋律**：一行简谱数字 + 一行歌词。想要技巧记号，先手写 `score.tex`
（语法见 `docs/alphatex.md`），或者用别的软件排好、走 `tex:from-xml`。

⚠️ 本工具**没有** `package.json` 里的 npm 脚本，直接跑 python（路径见 §1）。
`pnpm <script>` 只用在 `tex:verify` / `tex:from-xml` 这两个项目级命令上。

---

## 1. 命令

本工具是**技能目录里的一个 python 脚本**，直接跑它 —— `package.json` 里**没有**对应脚本，
`pnpm <script>` 只用在 `tex:verify` / `tex:from-xml` 这两个项目级命令上。

```bash
# 从仓库根跑；下文用 `scoregen` 代指这一长串路径
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua            # → score.tex（默认，站点直读）
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua -f musicxml # → molihua.musicxml
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua -f both     # 两份都要
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua --print     # 顺手把 tex 打到屏幕上
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua/melody.txt   # 也可以直接给 spec 文件

# 嫌长就在当前 shell 里设个别名（可选）
alias scoregen='python3 .agents/skills/uke-scoregen/scripts/scoregen.py'
```

| 参数 | 作用 |
| --- | --- |
| `-f, --format tex\|musicxml\|both` | 生成哪种。`tex` = 站点直读；`musicxml` = 给 MuseScore 等外部软件 |
| `-o, --output` | 覆盖输出路径（只在单格式时有意义） |
| `--print` | 把 tex 同时打到 stdout |
| `--ragged` | 放行拍数不符的小节（弱起小节等）。默认**直接报错**，这是故意的 |
| `--quiet` | 不打诊断信息 |

**生成完一定要跑 `pnpm tex:verify`** —— `scoregen` 只保证文本自洽，谱面对不对由真 alphaTab 说了算。

---

## 2. 东西都放在哪儿

```
.agents/skills/uke-scoregen/       ← 技能真身（进 git），**自洽的一整包**
  SKILL.md                         ← 给 AI 用的速查：命令、坑、验收
  scripts/scoregen.py              ← 简谱 → 谱面（本工具）
  scripts/musicxml2tex.py          ← MusicXML → alphaTex（技能自带，必须与 scoregen 同目录）
.workbuddy/skills/uke-scoregen     → 软链接到上面（WorkBuddy 的发现路径；.workbuddy 不进 git）

scripts/musicxml2tex.py            → 软链到技能里那一份（`pnpm tex:from-xml` 走它）
scripts/verify-tex.mjs             ← 站点校验器（真 alphaTab 解析 + 逐音核对）

songs/<id>/
  meta.json        ← 站点的歌曲信息（手写）
  melody.txt       ← 本工具的输入（手写）
  score.tex        ← 生成物（站点读这个）
  <id>.musicxml    ← 生成物（可选，外部软件用）
```

`scoregen.py` 先在**自己旁边**找 `musicxml2tex.py`，找不到才逐级向上找 `scripts/`，
所以整包搬走也不会断。调用时给的是 `.agents/` 那条路径（软链接那条也能跑，
但 `.workbuddy/` 不进 git、别人 clone 不到，写文档、写脚本一律用 `.agents/`）。

⚠️ **软链接是被 WorkBuddy 支持的**（条目是 symlink 也照常加载），但**技能清单在任务创建时就固化了** ——
`.workbuddy/skills/` 里新增/搬动技能后，**当前会话看不到，新建任务（或重启）才会加载**。
所以搬完技能当场测不出来是正常的，不代表方案有问题。

一次生成两份时，**tex 是先落 MusicXML、再交给 `musicxml2tex.py` 转出来的**。
所以两份输出是同一条链路的下游，不会出现「tex 对、xml 错」这种对不上的情况。

---

## 3. 顶层键

```
title: 茉莉花          ← 必填
artist: 江苏民歌
key: F                ← 1 = 哪个音。写 `F`、`Bb`、`F#`、`Dm`、`a minor` 都行
octave: 4             ← 1 落在哪个八度。key: F + octave: 4 → `1` = F4
tempo: 80
tuning: a4 e4 c4 g4   ← ⚠️ 按弦号写，1 弦（最高音弦）在最前
time: 4/4
instrument: 24        ← GM 号（0 基）。缺省 24 = 尼龙吉他，与 site.config 一致；写 `none` 就不写进 MusicXML
maxfret: 12           ← 指法推算时允许的最大品位
```

⚠️ **小调的音级表和大调不是一张**。`Dm` 时 `3` = F 本位（3 个半音），不是 F#。
写成 `Dm` / `a minor` 都会自动切到自然小调音级表，调号也按小调写。

键必须**顶格写**（不缩进）；缩进的行一律当块内内容。块内出现 `键: 值` 形状的内容
不会被误判成顶层键（只有名字在已知集合里、且顶格的才算）。

---

## 4. 音怎么写

| 写法 | 意思 |
| --- | --- |
| `5` | 音级 5（`key: F` 时 = C） |
| `1'` | 高八度（每个 `'` 升一个八度） |
| `5,` | 低八度（每个 `,` 降一个八度） |
| `#4` / `b7` | 临时升 / 降（升降号**紧贴数字**） |
| `0` | 休止 |
| `5-` | 一拍 + 再加一拍 = 2 拍。`5---` = 4 拍 |
| `5:0.5` | 明确写 0.5 拍。小数、`5:1.5` 都行 |

音级 ↔ 半音（大调）：`1=0 2=2 3=4 4=5 5=7 6=9 7=11`（相对主音）。
小调换成 `1=0 2=2 3=3 4=5 5=7 6=8 7=10`（自然小调）。

⚠️ **注释 = 行首 `#` 后面跟一个空格**（`# 说明`），或整行只有一个 `#`。
`#4 5 1' |` 这种**以升号音开头的小节不会被当注释吃掉**——这一点是专门修过的，
因为被吃掉之后报的是「歌词与旋律小节数对不上」，跟真正的原因差了十万八千里。
行内的 `#` 永远是升号。
⚠️ 时值后缀只有 `-` 和 `:N` 两种；`5:0.5-` 这种混写不支持。

---

## 5. 小节与拍号

一行写一个小节（也可以一行写几个，用 `|` 隔开），`|` 收尾。`|` 的个数决定小节数。

默认情况下**逐小节核对拍数**，不符就报错并指出是第几小节：

```
有 1 个小节的拍数与 4/4 不符：
  第 7 小节：3 拍，应为 4 拍
  核对是不是漏敲/多敲了音、或时值后缀写错；弱起小节可加 --ragged 放行。
```

这条检查专抓「少敲一个音」——简谱手误里最常见、也最难靠眼睛发现的一种。

---

## 6. 歌词

单独一个 `lyrics:` 块，与 `melody:` **小节数一一对应**，且每小节**槽位数 == 音数**：

```
melody:
  3 3 5 6 |
  ...
lyrics:
  好 一 朵 美 |
  ...
```

| 槽位写法 | 意思 |
| --- | --- |
| `好` | 这个音唱「好」 |
| `-` | **延续上一个音节**（一字多音 / 拖腔），谱面上这个音不显示字 |

⚠️ 占位**必须写 `-`，不能留空**：留空会被按空白切掉，槽位数就对不上，报错反而更难懂。

⚠️ **反过来的方向同样要记住：旋律里的时值后缀 `-` 不是第 2 个音。**
`5-` 是**一个音**唱两拍，所以 `6 6 5-` 这一小节只有 **3 个音**，歌词要写 3 个字：

```
  6 6 5- |         ← 3 个音
  亮 晶 晶 |        ✓ 3 个槽位
  亮 晶 晶 - |      ✗ 报「第 2 小节：3 个音，却写了 4 个字」
```

很多人会把谱面上的「5 –」看成两格（简谱确实写成两个位置），然后顺手在歌词里也补一个 `-`。

报错是**逐小节**报的（只报总数根本看不出错在哪）：

```
歌词与音符数量不匹配 —— 一个音对一个槽位，拖腔的延续音写 `-`：
  第 3 小节：3 个音，却写了 2 个字（花 -）
```

生成的谱面里，歌词是 `{lyrics "花"}` 这种**拍属性**。语法细节与踩过的坑见
`docs/alphatex.md §6.3 / §7.4`。

---

## 7. 生成之前与之后会自动做四道检查

| 检查 | 时机 | 抓的是 |
| --- | --- | --- |
| **每个音都按得出来** | 生成前 | 音低于 3 弦空弦 C4、或超出 `maxfret` —— 不拦的话会被**静默换成最接近的音** |
| 逐小节拍数 == 拍号 | 生成前 | 漏敲 / 多敲音符、时值后缀写错 |
| 逐小节歌词槽位数 == 音数 | 生成前 | 歌词错位（最常见：某小节多一个字） |
| **回读生成的 MusicXML，核对定弦** | 生成后 | `<staff-tuning line>` 方向写反 —— 这条错了**不报任何错**，只是整首移调，所以必须专门查一遍 |

按不出来的音长这样：

```
有 1 个音在尤克里里上按不出来：
  第 2 小节 `5,` —— 比最低空弦还低（最低只能到 C4）
```

最后一条定弦检查会打印 `✓ 定弦自检通过（生成的 MusicXML 读回来与 spec 一致）`；对不上直接报错退出。

全部通过后，再跑一道外部校验（真 alphaTab 解析 + 逐音恒等式）：

```bash
pnpm tex:verify
```

---

## 8. ⚠️ 定弦与 `<staff-tuning line>` 的方向

这是这条链路上唯一「静默出错」的地方，单独说清楚。

- **alphaTab 怎么读**：`_parseStaffTuning` 里算的是
  `staff.tuning[staff.tuning.length - line]`
  （`node_modules/@coderline/alphatab/dist/alphaTab.core.mjs:23413`）。
  而 `staff.tuning[0]` 是**第 1 弦（最高音弦）**——所以 **`line 1` 落在弦号最大的那根弦上**。
- **本站怎么写**：`scoregen.py` 按上面这条规则写，即 `line n` = 第 `弦数 + 1 - n` 根弦。
  尤克里里 GCEA → `line 1 = G4`（4 弦），`line 4 = A4`（1 弦）。
- ⚠️ **不是音高升序**。尤克里里是**回归定弦**——4 弦 G4 比 3 弦 C4 高，
  音高序 ≠ 弦号序。写成 `sorted()` 会把 2 弦和 4 弦对调。
- ⚠️ **写反了不会报错**：文件里 `<pitch>` 与 `<string>/<fret>` 依然自洽，
  只是 alphaTab 读出来的实音全错。`musicxml2tex.py` 不猜，它两种解释各试一遍、
  用恒等式 `定弦[弦] + 品 == <pitch>` 数命中数自动选，并打印判定结果
  （详见 `docs/alphatex.md §7.1`）。

`scoregen` 生成时落的是 alphaTab 认的那一种，实测回读 `spec 命中 67/67、document 命中 0/67`。

---

## 9. 完整例子

`songs/molihua/melody.txt`（16 小节 / 67 音 / 51 音节 / 9 处拖腔）就是可跑的最小完整样本。

加一首新歌的完整流程：

```bash
mkdir songs/<id>
# 1. 手写 songs/<id>/melody.txt
# 2. 手写 songs/<id>/meta.json（照着 songs/molihua/meta.json 抄，改 id / title / tags）
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id>
pnpm tex:verify
pnpm dev     # 浏览器里听一遍
```

`meta.json` 是站点索引的依据，字段说明见 `CONTEXT.md` 的「歌曲 (Song)」一节。

---

## 10. 常犯的错 → 报错长什么样

| 症状 | 原因 |
| --- | --- |
| `歌词与音符数量不匹配` | 某小节多/漏一个字，或拖腔处忘了写 `-` |
| `有 N 个小节的拍数与 4/4 不符` | 音符数不对，或 `-` 的个数算错 |
| `有 N 个音在尤克里里上按不出来` | 音太低（调 `octave:` / 换 `key:`）或太高（调大 `maxfret:`） |
| `看不懂的音符：'5'` 之类 | 时值后缀混写（`5:0.5-`），或行首注释忘写空格（`#注释` → 写成 `# 注释`） |
| `这行不在任何块里，也不是 键: 值` | 漏写 `melody:` / `lyrics:`，或键名拼错 |
| `找不到 spec 文件` | 目录里没有 `melody.txt`，或路径写错（给目录或给文件都行） |
| 报错行号指到别处 | 不应该发生：行号是**文件真实行号**，发现不对请提 |
