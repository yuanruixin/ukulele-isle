# 上哪儿找 MusicXML（屿琴项目版）

> 用途：给 `scripts/musicxml2tex.py` 找输入。
> 结论全部是本机实测的，不是抄来的——每份都真的下载 + 转换 + 用真 alphaTab 解析过。
> 最后一次实测：2026-09-17。

---

## 0. 先分清「能下」和「能合法用」

这份文档只收**能直接下载**的来源。但下载 ≠ 能放进站点，分三种：

| 类别 | 能不能放进 `songs/` | 说明 |
|---|---|---|
| **公有领域（PD）** | ✅ 可以 | 著作权已过期。放自己站上没问题 |
| **CC 授权 / 作者明确授权** | ✅ 可以 | 留意有没有 NC（禁止商用）条款 |
| **版权作品（当代流行歌）** | ⚠️ 别放 | 自己练琴是灰色地带，公开托管是另一回事 |

屿琴现在的 `songs/` 里两份（千本桜 / 晴天）都属于第三类 —— 那是既有决定，
要新增的话建议走 PD 这条路，省得以后要挪。

---

## 1. A 类：直接下、马上能用

### 1.1 musicxml.com 官方示例集

格式标准（MusicXML 4.0，由 Finale 导出后手工修过），**永久链接、无需注册**，
是这套工具链最好的试金石。整包 `xmlsamples.zip` 也可以一次拿走。

```
基址  https://wpmedia.musicxml.com/wp-content/uploads/2021/06/<名字>.musicxml
整包  https://wpmedia.musicxml.com/wp-content/uploads/2021/06/xmlsamples.zip
索引  https://www.musicxml.com/music-in-musicxml/example-set/
```

| 名字 | 曲目 | 作曲家 |
|---|---|---|
| `Echigo-Jishi` | **越後獅子**（1892 年的日本流行歌，带日文歌词） | 長井/小畑 编 |
| `BrookeWestSample` | **West Point**（当代流行歌，歌手亲自授权） | Jonatha Brooke |
| `SchbAvMaSample` | 圣母颂（Ellens Gesang III） | 舒伯特 |
| `Dichterliebe01` | 诗人之恋 Op.48 第一首（**完整曲**） | 舒曼 |
| `MozartPianoSonata` | 钢琴奏鸣曲 K.331 | 莫扎特 |
| `MozartTrio` | 单簧管五重奏 K.581 | 莫扎特 |
| `MozaVeilSample` | 紫罗兰 K.476（**UTF-16 小端**） | 莫扎特 |
| `MozaChloSample` | 致克洛伊 K.524（**UTF-16 大端**） | 莫扎特 |
| `BeetAnGeSample` | 致遥远的爱人 Op.98 | 贝多芬 |
| `BrahWiMeSample` | 如旋律般萦绕我 Op.105 No.1 | 布拉姆斯 |
| `DebuMandSample` | 曼陀林 | 德彪西 |
| `FaurReveSample` | 梦后 Op.7 No.1 | 福雷 |
| `MahlFaGe4Sample` | 旅人之歌 4 | 马勒 |
| `Saltarello` | 萨尔塔雷洛舞曲 | 佚名 |
| `Telemann` | Liebe! Liebe!（**标题里嵌双引号**） | 泰勒曼 |
| `Chant` | Quem queritis（无小节线的素歌） | 佚名 |
| `Binchois` | 尊主颂 | 班舒瓦 |
| `ActorPreludeSample` | Prelude to a Tragedy（完整管弦乐） | Lee Actor |

### 1.2 OSMD 仓库的测试谱面（328 份）

`opensheetmusicdisplay` 是个开源五线谱渲染库，它的测试集里全是**边界用例**，
想验证奇怪记号的时候翻这里最快。

```
基址  https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/<名字>.musicxml
列表  https://api.github.com/repos/opensheetmusicdisplay/opensheetmusicdisplay/contents/test/data?ref=develop
```

跟本站最相关的是 6 份 TAB 专项（**六弦吉他**，不是尤克里里，但走的是
`<technical><string>/<fret>` + `<staff-tuning>` 那条路径，和本站同一套）：

| 名字 | 测什么 |
|---|---|
| `OSMD_Function_Test_Tablature_Hammeron_Pulloff` | 击弦 / 勾弦 `{h}` `{p}` |
| `OSMD_Function_Test_Tablature_Alleffects` | 各种技法堆一起 |
| `OSMD_Function_Test_Tablature_Slides` | 滑音 |
| `OSMD_Function_Test_Tablature_Bends` | 推弦 |
| `OSMD_Function_Test_Tablature_Multibends` | 多重推弦 |
| `OSMD_Function_Test_Tablature_Vibrato` | 揉弦 |

### 1.3 中文曲目：`hrsoup/Dizi_Dataset`（27 首）

一个 MusicXML 格式的**竹笛数据集**，27 首中国曲目，都是单旋律 + 单谱表 ——
正好是转换器最擅长的那一档。曲目含民歌与传统曲：小放牛、南绣荷包、江河水、
姑苏行、鹧鸪飞、牧民新歌、扬鞭催马运粮忙、幽兰逢春、欢乐歌、水乡船歌……

```
基址  https://raw.githubusercontent.com/hrsoup/Dizi_Dataset/master/MusicXML/<曲名>.xml
列表  https://api.github.com/repos/hrsoup/Dizi_Dataset/contents/MusicXML
```

实测两份（2026-09-17）：

| 曲目 | 规模 | 结果 |
|---|---|---|
| `小放牛` | 155 小节 · 657 拍 · 647 音 | ✅ **完全通过**（解析 ✓、恒等式 ✓、拍号 ✓） |
| `南绣荷包` | 454 小节 · 1371 拍 · 1310 音 | ⚠️ 多声部，部分小节 2400 vs 1920 tick |

### 1.4 ⚠️ 下载必须校验完整性

`raw.githubusercontent.com` 偶尔会**静默返回截断的文件**：实测 `小放牛.xml`
第一次只拿到 41553 字节（实际 171788），XML 在 `<measur` 处断掉。
转换器会报 `ParseError: unclosed token`，但更糟的是——如果断点正好落在
`</measure>` 之后，文件能解析，只是**少了几十个小节而不报错**。

```bash
# 下完先校验再转换
python3 -c "import xml.etree.ElementTree as ET,sys;ET.parse(sys.argv[1]);print('✓')" 小放牛.xml
# 或者直接比对大小：GitHub API 的 contents 接口会给出 size
```

---

## 1.5 专项调查：《茉莉花》没有可直接下载的 MusicXML

2026-09-17 逐个查过，结论是**拉不到**：

| 来源 | 结果 |
|---|---|
| musicxml.com 官方示例集（18 份） | 无 |
| OSMD `test/data`（328 份） | 无 |
| GitHub 仓库搜索（`茉莉花` / `molihua` / `jasmine flower`，含 Gitee） | 只有 `piotr-yuxuan/molihua`，**是 LilyPond 源，不是 MusicXML** |
| `hrsoup/Dizi_Dataset`（27 首中文曲） | 无茉莉花 |
| IMSLP | 只有 PDF；一份 2015 年萨克斯改编是 CC-BY-NC，无 MusicXML |
| 维基百科 | 本机网络取不到 |

**唯一线索**：`piotr-yuxuan/molihua`（Artistic-2.0，可直接用）
—— 有 `茉莉花.ly` 与已排版的 PDF。但那是**琵琶 + 钢琴的三谱表改编版**，
不是单旋律；而且 `.ly` 用的是 `\relative` 相对音高，要拿到准确音高必须先跑
LilyPond 或自己实现相对八度解算（**不能靠人眼读谱**——实测读错概率很高）。

两条可行路径：
1. **装 lilypond → 输出 MIDI → 用 `midi-to-musicxml` 转**。音高由 LilyPond 权威解析，可靠；
   代价是要装 lilypond，且转出来的是多声部，还得挑出旋律轨。
2. **按流传简谱手写一份**。快，但音准需要人工核对 —— 民歌整理版（何仿，1957）
   还有版权问题（何仿 2013 年去世，2063 年才进入公有领域）。
   原始民歌《鲜花调》（明清流传）本身是无版权的。

> ✅ **2026-09-17：路径 2 已落地** —— 见 `songs/molihua/`。
> 输入是 `songs/molihua/melody.txt`（纯文本简谱），一条命令出 MusicXML 或 `score.tex`：
>
> ```bash
> python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua -f both
> ```
>
> 音级抄自流传简谱，**节奏是按歌词重音配的**，听感不对就改 `melody.txt`。
> 这套「简谱音级表 → 带 TAB 指法的 MusicXML」的写法已收进 `uke-scoregen` 技能
> （`.agents/skills/uke-scoregen/scripts/scoregen.py`），任何曲子都能复用；
> 语法见 `docs/score-spec.md`。

> 顺带记一下版权：**何仿 1957 年整理的「江苏民歌」版**是大家最熟悉的那版，
> 但它在中国的保护期到 2063 年。要用在公开站点上，建议走《鲜花调》或注明来源。

---

## 2. B 类：MuseScore —— 流行歌的实际来源

现当代流行歌（周杰伦、五月天、YOASOBI、Ed Sheeran…）的 MusicXML
**基本只在 musescore.com 上有**，都是用户上传的编排。官方帮助页写得很清楚：

- **免费账号**：只能下「公有领域作品」+「用户自己标注为 Original 的原创曲」，每天 20 份
- **PRO 订阅**：才能下版权作品的谱面
- **Official HQ scores**：任何账号都不给下载/打印（版权方要求）
- 下载格式里**有 MusicXML**，在谱面页右侧 Download 按钮里选

所以：

- 想拿**当代流行歌** → 先看那份谱面页面上的授权标记；标 PD 或 CC 的才能免费下
- 标 `Official` 或需要 Pro 的 → 免费拿不到
- 有些上传者会把自己的编排设成 PD/CC，这类可以合法用
- 站点页脚会显示授权；**别只看标题，要看授权标记**

> ⚠️ 顺带一说：网上那些 `musescore-dl` 之类的第三方下载器绕的是订阅墙，
> 属于违反站点条款，别用，也别把结果放到公开站点上。

---

## 3. C 类：要批量 —— PDMX 数据集

250K 份**公有领域** MusicXML，全部来自 MuseScore 的 PD 部分，
是目前唯一规模够大又版权干净的符号音乐数据集。

```
主页   https://pnlong.github.io/PDMX.demo/
论文   https://arxiv.org/abs/2409.10831
数据   https://zenodo.org/records/15571083     （14.4 GB）
代码   https://github.com/pnlong/PDMX
```

Zenodo 上的文件（挑你要的下，别整包拉）：

| 文件 | 大小 | 里面是什么 |
|---|---|---|
| `PDMX.csv` | 225 MB | **索引**。先下这个，按歌名/作曲家筛，再决定下哪个包 |
| `mxl.tar.gz` | 1.9 GB | 压缩版 MusicXML（`.mxl`，本质是 zip，解开就是 `.xml`） |
| `data.tar.gz` | 2.2 GB | JSON 化的谱面（`MusicRender` 格式，不是 MusicXML） |
| `mid.tar.gz` | 214 MB | MIDI |
| `pdf.tar.gz` | 9.6 GB | 印刷谱 PDF |
| `subset_paths.tar.gz` | 29 MB | 官方划好的子集路径清单 |

两个坑：

1. **务必用 `no_license_conflict` 子集**。作者自己发现 12.29%（31221 首）的曲子在
   MuseScore 网页显示的公版标记和文件内部标记**不一致**，官方建议避开这批。
2. `.mxl` 要先解压才能喂给转换器：
   ```bash
   mv foo.mxl foo.zip && unzip -o foo.zip       # 里面那个 .xml 才是要的
   ```

---

## 4. 实测结果：20 份真实谱面跑一遍

命令：
```bash
python3 scripts/musicxml2tex.py <输入>.musicxml -o /tmp/out.tex
node scripts/verify-tex.mjs /tmp/out.tex
```

**结果：20 / 20 全部成功转换并解析通过**（含 UTF-16 大端与小端、含标题嵌引号、含六弦 TAB）。

转换质量分两档：

| 档 | 条件 | 表现 |
|---|---|---|
| ✅ 干净 | **单声部**（一个小节里只有一条音流） | 逐音恒等式 ✓、每小节时值对拍号 ✓ |
| ⚠️ 要人工 | 多声部：小节里有 `<backup>` / `<forward>` | 声部被**顺序拼接**，小节时值成倍超出 |

干净的一档：`BeetAnGeSample` `BrahWiMeSample` `BrookeWestSample` `DebuMandSample`
`Dichterliebe01` `Echigo-Jishi` `Saltarello` + 三份 OSMD TAB。

多声部会超长的例子（`MozartPianoSonata` 第 1 小节 7680 tick，2/4 只要 1920 —— 正好 4 倍，
= 2 个声部 × 2 个谱表全被摊平拼在一起）。这类会有一条明确告警：

```
⚠ 检测到 <backup>（多声部），本工具按单声部顺序拼接，请人工核对
```

**所以挑谱面的经验：优先找单旋律的（声乐曲、童谣、器乐独奏、TAB），别拿钢琴谱。**

顺带实测出来的其它事实：

- **UTF-16 没问题**：`MozaChloSample`（BE）和 `MozaVeilSample`（LE）都正常转换
- **`<part>` 只取第一个**。声乐 + 钢琴的曲子取到的是**人声那一路**，
  这正是想要的（前几小节是前奏，会产出 `:1 r`，人工删掉即可）
- **弱起小节**（`implicit="yes"`）会被正常识别并告警
- **反复记号 / 跳房子 / 连音线记号 `<slur>`** 目前不表达，只告警

---

## 5. 已修的坑：标题里的引号

`Telemann.musicxml` 的标题是 `Excerpt from "Liebe! Liebe! Was ist schöner als die Liebe?"`。
转换器原来把值原样写进 `\title "..."`，于是：

```
\title "Excerpt from "Liebe! Liebe! Was ist schöner als die Liebe?""
                     ↑ 字符串在这里就闭合了
```

alphaTab 只会说 `There are errors in the parsed alphaTex`，**不告诉你哪一行**，
排查成本很高。现在 `tex_str()` 会转义（`\"` 与 `\\`，1.8.4 实测都支持）。

**注意**：alphaTex 的 `\title` 等字符串字面量**必须转义内嵌引号**，
这一条已记进 `docs/alphatex.md` 的坑清单。

---

## 6. 现成命令

```bash
# ── 拿一份官方示例（舒伯特圣母颂，单声部 + 人声，转换质量最好）
curl -L -o /tmp/ave.musicxml \
  https://wpmedia.musicxml.com/wp-content/uploads/2021/06/SchbAvMaSample.musicxml

# ── 转换 + 校验
pnpm tex:from-xml /tmp/ave.musicxml -o /tmp/ave.tex
pnpm tex:verify /tmp/ave.tex

# ── 满意了再放进站点（songTex.ts 会统一补 \instrument）
mkdir -p songs/<id> && cp /tmp/ave.musicxml songs/<id>/ && cp /tmp/ave.tex songs/<id>/score.tex
# 然后按 songs/senbonzakura/meta.json 的样子写一份 meta.json

# ── 整包下载官方示例集
curl -L -o /tmp/xmlsamples.zip \
  https://wpmedia.musicxml.com/wp-content/uploads/2021/06/xmlsamples.zip
```

---

## 7. 挑谱面速查

| 你想要 | 去哪儿 |
|---|---|
| 随便找一份干净的试工具链 | musicxml.com 示例集，挑 **单声部** 的 |
| 测 TAB / 击勾弦 / 滑音 | OSMD 的 6 份 `Tablature_*` |
| 测奇怪编码 | `MozaChloSample`(UTF-16 BE) / `MozaVeilSample`(UTF-16 LE) |
| 测标题嵌引号 | `Telemann` |
| 测多声部 / 看告警长什么样 | `MozartPianoSonata` |
| **一首真正的流行歌** | `Echigo-Jishi`（1892 日本流行歌）/ `BrookeWestSample`（当代，吉他 TAB） |
| 当代流行歌（周杰伦等） | musescore.com，看授权标记；多数需要 Pro |
| 批量、且要版权干净 | PDMX 的 `no_license_conflict` 子集 |
