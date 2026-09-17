---
name: uke-scoregen
description: 用简谱文本给「屿琴」尤克里里站点加/改一首歌，一条命令生成 alphaTex（score.tex）或 MusicXML（或两者都要）。当用户说「添加 XX 的谱子」「加一首歌」「生成谱面/曲谱」「把这首简谱做成谱子」「重新生成 score.tex / musicxml」「歌词对不上」「小节拍数不对」，或需要往 songs/<id>/ 里放歌、核对谱面音高与指法时使用。
agent_created: true
---

# 屿琴 · 简谱 → 谱面（score.tex / MusicXML）

项目根目录 = 当前工作目录（含 `package.json` / `songs/` / `.agents/`）。
工具链的唯一入口是 **`.agents/skills/uke-scoregen/scripts/scoregen.py`**（下面统称 `scoregen`），
绝不要在 `songs/` 里另写一次性脚本。

技能目录布局（本技能的脚本就住在这儿，不再是仓库的 `scripts/`）：

```
.agents/skills/uke-scoregen/      ← 真身，进 git
  SKILL.md
  scripts/scoregen.py             ← 技能专属脚本
.workbuddy/skills/uke-scoregen    → 软链接到上面（WorkBuddy 的发现路径；.workbuddy 不进 git）
```

⚠️ WorkBuddy **支持**用软链接挂技能，但技能清单是**任务创建时**读的：
新搬进来或新建的技能，当前会话里看不见，**新建一个任务（或重启 WorkBuddy）才会加载**。
所以搬完当场用 `Skill` 试会得到 `Can not find skill` —— 这是正常的，换新任务即可。

`scoregen` 靠**向上查找**定位仓库的 `scripts/musicxml2tex.py`
（`musicxml2tex.py` 与 `verify-tex.mjs` 是**共享**工具，`pnpm tex:from-xml` / `pnpm tex:verify` 也用，
所以留在 `scripts/` 没搬）。

## 0. 一条命令

本工具是**技能目录里的一个 python 脚本**，没有 `package.json` 脚本，
所有命令都直接跑 `python3 <路径>`（别去找 `pnpm run score:gen`，那个不存在）：

```bash
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id>                # → songs/<id>/score.tex（默认，站点直读）
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id> -f musicxml    # → songs/<id>/<id>.musicxml（给 MuseScore 等）
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id> -f both        # 两份都要
```

**格式由用户选**。默认 `tex` 就是站点能直接读的那种；`musicxml` 是给外部软件的。
一次生成两份时，tex 是**先落 MusicXML、再交给 `scripts/musicxml2tex.py` 转出来的** ——
两份输出在同一条链路上，不会出现「tex 对、xml 错」。

## 1. 加一首歌的完整流程

```bash
mkdir songs/<id>              # <id> = 路由 /#/song/<id>，小写连字符
# ① 写 songs/<id>/melody.txt   （简谱，见 §2；模板见 §5）
# ② 写 songs/<id>/meta.json    （照 songs/molihua/meta.json 抄）
python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/<id>
pnpm tex:verify            # 零参数 = 扫全站 score.tex
pnpm dev                   # 浏览器里听一遍
```

`melody.txt` 与 `meta.json` 是可手改的源文件；`score.tex` / `<id>.musicxml` 是**生成物**，
不要手改生成物（手改会在下次生成时被覆盖）。

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

看到 `✓ 定弦自检通过` 才算这一步过了。最后**务必**再跑真引擎校验：

```bash
pnpm tex:verify                                      # 全站
pnpm tex:verify songs/<id>/score.tex                 # 单份
```

它用真 alphaTab 解析 + 逐音核对「定弦 + 品 == 实音」+ 每小节时值对拍号。
**只靠 scoregen 的文本自检不够 —— 谱面对不对由 alphaTab 说了算。**

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
| 和弦、多声部、击勾弦 / 滑音 / 扫弦 / 闷音 `x.N` | 用 MuseScore 之类排好 → `pnpm tex:from-xml <file.musicxml> -o songs/<id>/score.tex` |
| 只有一份外部 MusicXML | 同上（转换器会自动判定 `<staff-tuning line>` 方向） |
| 只要改几个品 / 加个效果记号 | 直接手改 `score.tex`（语法见 `docs/alphatex.md`），但**下次重新跑 `scoregen` 会覆盖它** |

## 7. 人工核对与版权

- **音级可信、节奏要听**。以茉莉花为例：音级是抄流传简谱的，**节奏是按歌词重音配的**，
  不是从原谱抄的。转完请听一遍，不对就改 `melody.txt`。
- ⚠️ **当代流行歌没有免费合法的 MusicXML 源**（musescore.com 免费号只能下 PD 作品与
  用户标注 Original 的原创曲）。加歌时别默认「网上找一份」。
- ⚠️ **何仿 1957 整理的《茉莉花》版在中国的保护期到 2063 年**；明清流传的《鲜花调》无版权。
  往公开站点加歌前先看版权（分级见 `docs/musicxml-sources.md`）。

## 8. 已知的「静默出错」清单（改完对一遍）

1. 谱面缺 `\tuning` → alphaTab 按 **6 弦吉他**调弦，`0.1` 变 E4，音高全错且不报错。
2. `<staff-tuning line>` 写反 → 整首移调且不报错（见 §4）。
3. 音低于 C4 / 超 `maxfret` → 被静默换成最接近的音（scoregen 已拦）。
4. `key` 用错大调/小调音级表 → 三度音错，谱面看不出。
5. 歌词里出现 `"` → 不转义会炸整份谱面，且错误信息里看不到行号（转换器已 `tex_str()` 转义）。

## 9. 更细的资料（都在仓库里，按需读）

- `docs/score-spec.md` —— 本 spec 的完整语法与报错对照表。
- `docs/alphatex.md` —— alphaTex 语法速查（逐条实测）、MusicXML ↔ tex 对照、坑清单。
- `docs/musicxml-sources.md` —— 上哪儿找谱面、来源分级、版权规则、20 份真实谱面实测。
- `CONTEXT.md` 的「曲谱 (Score)」一节 —— 领域术语与定弦铁律。
- `.workbuddy/memory/NOTES-topics.md` —— 分主题实现细节（歌词、音色链、图标…）。
