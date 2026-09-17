---
name: uke-scoregen
description: 把简谱文本（一行数字 + 一行歌词）转成 alphaTab 的谱面格式 alphaTex（score.tex）或 MusicXML，也能把外部 MusicXML 转成 alphaTex。当用户说「加一首歌」「把这首简谱做成谱子」「生成谱面 / 曲谱」「重新生成 score.tex / musicxml」「歌词对不上」「小节拍数不对」，或需要核对谱面音高、指法、定弦时使用。
agent_created: true
---

# 简谱 → 谱面（alphaTex / MusicXML）

本技能**自洽**：脚本就在本目录的 `scripts/` 下，装完即可用，不依赖任何宿主工程。

```
scripts/scoregen.py        简谱文本 → score.tex / MusicXML   ← 主入口
scripts/musicxml2tex.py    MusicXML → alphaTex               ← 把外部谱面转进来
```

两个脚本都**零第三方依赖**（只用标准库），任何 `python3` 都能跑；
`scoregen.py` 会在**自己旁边**找 `musicxml2tex.py`，所以两个文件必须放一起。

## 0. 一条命令

```bash
python3 scripts/scoregen.py <歌曲目录>                # → <歌曲目录>/score.tex（默认）
python3 scripts/scoregen.py <歌曲目录> -f musicxml    # → <歌曲目录>/<目录名>.musicxml
python3 scripts/scoregen.py <歌曲目录> -f both        # 两份都要
python3 scripts/scoregen.py <歌曲目录>/melody.txt     # 也可以直接指 spec 文件
```

**格式由用户选**。默认 `tex` 是 alphaTab 直接读的那种；`musicxml` 是给 MuseScore 等外部软件的。
一次生成两份时，tex 是**先落 MusicXML、再交给 `musicxml2tex.py` 转出来的** ——
两份输出在同一条链路上，不会出现「tex 对、xml 错」。

## 1. 加一首歌的完整流程

```bash
mkdir -p <歌曲目录>
# ① 写 <歌曲目录>/melody.txt   （简谱，见 §2；最小模板见 §5）
# ② 宿主工程若另有自己的歌单元数据（封面 / 标题 / 路由之类），按它的约定再放一份
python3 scripts/scoregen.py <歌曲目录>
# ③ 用真实 alphaTab 引擎解析一遍复核（见 §3）
```

`melody.txt` 是可手改的源文件；`score.tex` / `<目录名>.musicxml` 是**生成物**，
不要手改生成物（手改会在下次生成时被覆盖）。

放哪个目录、叫什么名，由宿主工程决定 —— 本技能只负责从 `melody.txt` 产出谱面文本。

## 2. melody.txt 速查

```text
title: 茉莉花          ← 必填。其余键都可省
artist: 江苏民歌
key: F                ← 1 = 哪个音（`F` `Bb` `F#` `Dm` `a minor`）
octave: 4             ← 1 的八度。key: F + octave: 4 → `1` = F4
tempo: 80
tuning: a4 e4 c4 g4   ← 按**弦号**写，1 弦（最高音弦）在最前
time: 4/4
instrument: 24        ← GM 号（0 基），缺省 24 = 尼龙吉他；`none` = 不写进 MusicXML
maxfret: 12

melody:
  3 3 5 6 |
  1' 1' 6 5 |
  5 6 5- |
lyrics:
  好 一 朵 美 |
  丽 的 茉 莉 |
  花 - - |
```

| 写法 | 意思 |
| --- | --- |
| `5` / `1'` / `5,` | 音级 5 / 高八度 / 低八度 |
| `#4` / `b7` | 临时升 / 降（升降号紧贴数字） |
| `0` | 休止 |
| `5-` / `5---` | 1 拍 + 1 拍 = 2 拍 / = 4 拍 |
| `5:0.5` | 明确 0.5 拍 |

音级↔半音：大调 `1=0 2=2 3=4 4=5 5=7 6=9 7=11`；**小调是另一张表** `3=3 6=8 7=10`（自然小调）。
`key: Dm` 时 `3` = F 本位。

四条硬规则：

1. **注释 = 行首 `#` 后跟一个空格**（`# 说明`）或整行只有 `#`。`#4 5 1' |` 是升号音开头的**正常小节**，不会被吃掉。
2. **歌词槽位数必须 == 该小节音数**，拖腔延续处**必须写 `-`**（留空会被空白切掉，槽位数反而对不上）。
   ⚠️ 反向也成立：时值后缀 `-` 是**同一个音的延长**，**不占歌词槽位**。
   `6 6 5-` 是 **3 个音**（`5-` = 一个音唱 2 拍），歌词就写 3 个字 ——
   写成「亮 晶 晶 -」会报 `第 2 小节：3 个音，却写了 4 个字`。这是最容易犯的一个。
3. **每小节拍数必须 == 拍号**，不符直接报错（弱起可加 `--ragged`）。
4. 顶层键必须**顶格写**（缩进的行一律算块内内容）。

## 3. 生成器会自动做四道检查，全过才算数

| 检查 | 时机 | 抓的是 |
| --- | --- | --- |
| 每个音都按得出来 | 生成前 | 低于 3 弦空弦 **C4** 或超出 `maxfret` —— 不拦的话会被**静默换成最接近的音** |
| 逐小节拍数 == 拍号 | 生成前 | 漏敲 / 多敲音符 |
| 逐小节歌词槽位数 == 音数 | 生成前 | 歌词错位（逐小节报，能直接定位） |
| 回读生成的 MusicXML 核对定弦 | 生成后 | `<staff-tuning line>` 方向写反 —— **零报错，只是整首移调** |

看到 `✓ 定弦自检通过` 才算这一步过了。但它只保证**文本自洽**，
谱面对不对最终由 **alphaTab 说了算**，所以还要拿真引擎解析一遍：

- 宿主工程若有自己的谱面校验器（用真 alphaTab 解析 + 逐音核对「定弦 + 品 == 实音」），跑它；
- 没有的话，把生成的 `score.tex` 丢进任何 alphaTab 环境（官方编辑器 / 自己的播放器）看一遍
  音高与指法合不合预期。

**只靠 scoregen 的文本自检不够。**

## 4. 头号坑：`<staff-tuning line>` 的方向

- **alphaTab 怎么读**：`staff.tuning[staff.tuning.length - line]`
  （`node_modules/@coderline/alphatab/dist/alphaTab.core.mjs` 的 `_parseStaffTuning`）。
  `staff.tuning[0]` 是**第 1 弦（最高音弦）** ⇒ **`line 1` = 弦号最大的那根弦**。
- **尤克里里 GCEA 是回归定弦**：4 弦 G4 比 3 弦 C4 **高** ⇒ 音高序 ≠ 弦号序。
  写成 `sorted()` 会把 2 弦和 4 弦对调。正确写法：`line 1 = G4`（4 弦）… `line 4 = A4`（1 弦）。
- **写反了不报错**：文件里 `<pitch>` 与 `<string>/<fret>` 依然自洽，只是实音全错。
  `musicxml2tex.py` 不猜：两种解释各试一遍、用恒等式 `定弦[弦] + 品 == <pitch>` 数命中数自动选
  （零参数跑会打印判定结果，健康的样子是 `document 命中 0/N、spec 命中 N/N`）。

`scoregen` 按 alphaTab 认的这一种写，并且生成后会自己回读核对，所以正常不会踩。

## 5. 最小模板

```text
title: 曲名
key: C
melody:
  1 2 3 4 |
  5 5 3 1 |
```

## 6. 什么时候**别**用它

`scoregen` **刻意只做单旋律**（一行简谱数字 + 一行歌词）。以下情况走另一条路：

| 需求 | 怎么做 |
| --- | --- |
| 和弦、多声部、击勾弦 / 滑音 / 扫弦 / 闷音 `x.N` | 用 MuseScore 之类排好 → `python3 scripts/musicxml2tex.py in.musicxml -o out.tex` |
| 只有一份外部 MusicXML | 同上（转换器会自动判定 `<staff-tuning line>` 方向） |
| 只要改几个品 / 加个效果记号 | 直接手改生成的 `score.tex`，但**下次重新跑 `scoregen` 会覆盖它** |

`musicxml2tex.py` 的主要参数：`-o` 输出、`--instrument`、`--tuning` / `--tuning-mode`、
`--fingering auto`（缺 `<string>/<fret>` 时按 `<pitch>` 指派把位）、`--no-lyrics`、`--brush`。
`--help` 里有全部。

## 7. 人工核对与版权

- **音级可信、节奏要听**。以茉莉花为例：音级是抄流传简谱的，**节奏是按歌词重音配的**，
  不是从原谱抄的。转完请听一遍，不对就改 `melody.txt`。
- ⚠️ **当代流行歌没有免费合法的 MusicXML 源**（musescore.com 免费号只能下公有领域作品与
  用户标注为原创的曲子）。加歌时别默认「网上找一份」。
- ⚠️ **何仿 1957 整理的《茉莉花》版在中国的保护期到 2063 年**；明清流传的《鲜花调》无版权。
  往公开站点加歌前先看版权。

## 8. 已知的「静默出错」清单（改完对一遍）

1. 谱面缺 `\tuning` → alphaTab 按 **6 弦吉他**调弦，`0.1` 变 E4，音高全错且不报错。
2. `<staff-tuning line>` 写反 → 整首移调且不报错（见 §4）。
3. 音低于 C4 / 超 `maxfret` → 被静默换成最接近的音（scoregen 已拦）。
4. `key` 用错大调/小调音级表 → 三度音错，谱面看不出。
5. 歌词里出现 `"` → 不转义会炸整份谱面，且错误信息里看不到行号（转换器已 `tex_str()` 转义）。

## 9. 更细的资料

- 本文件 §2（语法速查）+ §8（静默出错清单）已覆盖日常所需的全部规则；
  脚本的报错信息里带小节号 / 行号，按提示改就行。
- alphaTex 是 alphaTab 的原生格式，语法以**官方文档与真实解析器**为准 ——
  改完拿 alphaTab 解析一遍，比对照任何速查表都可靠。
- 转换器（`musicxml2tex.py`）的模块 docstring 里有一段「`<staff-tuning line>` 方向」
  的完整推导，改定弦相关逻辑前先读它。
