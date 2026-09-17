#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简谱文本 → 站点谱面（alphaTex）或 MusicXML（屿琴项目）

**这个脚本是 `uke-scoregen` 技能的一部分**，所以它住在技能目录里
（`.agents/skills/uke-scoregen/scripts/`），而不是仓库的 `scripts/`。
说明与用法见同目录上一级的 `SKILL.md`。

它是 `scripts/musicxml2tex.py` 的**上游**：那个负责「外部谱面转进来」，
这个负责「从零写一首」。链路是同一条：

    melody.txt（简谱）
        ├─ --format musicxml ──→ songs/<id>/<id>.musicxml    （给 MuseScore 等）
        └─ --format tex ───────→ songs/<id>/score.tex         （站点直读）
                 └─ 内部先把 MusicXML 写到临时文件，再交给 musicxml2tex.py
                    ⇒ 两种输出**结构上保证一致**，不会出现「tex 对、xml 错」

⚠️ `musicxml2tex.py` **不**搬进技能目录：它是仓库的共享工具，
`pnpm tex:from-xml` 也用它。本脚本靠 `find_converter()` 向上找过去。

为什么要有它
------------
站点的谱面格式是 alphaTex（ADR 0002），但 alphaTex 是给机器看的东西：
`8.1 5.1 3.1` 这种串既难写也难核对。而中文世界描述旋律的通用语言是**简谱**——
把简谱数字直接敲进来，才是「加一首歌」最自然的入口。

适用范围（刻意划窄）
--------------------
**只做单旋律**：一行简谱数字 + 可选一行歌词。覆盖民歌、童谣、单音指弹、前奏 riff。
和弦、多声部、技巧记号（击勾弦/滑音/扫弦）请走 `pnpm tex:from-xml`（先用 MuseScore 之类排好再转）。

用法
----
    # 默认读 songs/<id>/melody.txt，输出 songs/<id>/score.tex
    python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua
    python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua --format musicxml
    python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua --format both

    # 也可以直接指一个 spec 文件；不写 -o 时输出到它旁边
    python3 .agents/skills/uke-scoregen/scripts/scoregen.py songs/molihua/melody.txt --format tex

spec 语法见 `docs/score-spec.md`；可跑的样例：`songs/molihua/melody.txt`。
生成后**务必**跑 `pnpm tex:verify`——本脚本只保证文本自洽，真实解析由 alphaTab 说了算。
（本脚本没有 `package.json` 脚本，别去找 `pnpm run score:gen` —— 那个不存在。）
"""

from __future__ import annotations

import argparse
import importlib.util
import math
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from xml.dom import minidom

# 简谱音级（1..7）→ 相对主音的半音数。
# ⚠️ 大调小调**不是同一张表**：小调的 3 是 F 不是 F#。用错一张，整首的三度音全错，
#    而谱面上看不出任何异常（音高合法、指法也按得出来）。
DEGREE_SEMITONE = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11}
DEGREE_SEMITONE_MINOR = {1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 8, 7: 10}  # 自然小调
LETTER_SEMITONE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}

# 时值（拍 = 四分音符数）→ (<type>, 附点数)。找不到就取「不超过它的最大基底」当提示——
# 真正的时值永远以 <duration> 为准，musicxml2tex 也只把 <type> 当 dots hint 用。
DURATION_TYPES: list[tuple[float, str, int]] = [
    (4.0, "whole", 0),
    (3.0, "half", 1),
    (2.0, "half", 0),
    (1.5, "quarter", 1),
    (1.0, "quarter", 0),
    (0.75, "eighth", 1),
    (0.5, "eighth", 0),
    (0.375, "16th", 1),
    (0.25, "16th", 0),
    (0.1875, "32nd", 1),
    (0.125, "32nd", 0),
]

DEFAULT_TIME = (4, 4)
DEFAULT_TEMPO = 120.0
DEFAULT_TUNING = "a4 e4 c4 g4"
DEFAULT_INSTRUMENT = 24  # GM 24 = 尼龙吉他，与 src/config/site.config.ts 的 SITE_INSTRUMENT 一致

# 顶层键。块内出现 `键:` 不会误判，因为只有**行首不缩进**且名字在这个集合里才算键。
SCALAR_KEYS = {"title", "artist", "key", "octave", "tempo", "tuning", "instrument", "maxfret", "time"}
BLOCK_KEYS = {"melody", "lyrics"}
KNOWN_KEYS = SCALAR_KEYS | BLOCK_KEYS

# 一个音符 token：可选升降号 + 音级 + 若干八度记号 + 可选时值后缀
#   5      1'     5,      #4     5-     5---     5:0.5     0
NOTE_RE = re.compile(
    r"^(?P<acc>[#b]?)(?P<deg>[0-7])(?P<oct>[,']*)(?:(?P<dash>-+)|:(?P<beats>\d+(?:\.\d+)?))?$"
)


# ---------------------------------------------------------------------------
# 复用 musicxml2tex（同一项目内的兄弟脚本）
# ---------------------------------------------------------------------------


def find_converter() -> Path:
    """定位仓库里的 `scripts/musicxml2tex.py`。

    按顺序找：① 与本脚本同目录（万一有人把两个脚本放一起）→ ② 从本脚本所在目录逐级向上，
    在每一级的 `scripts/` 里找。

    ⚠️ 不要把相对层数写死。本脚本已经从 `scripts/` 挪到
    `.agents/skills/uke-scoregen/scripts/`，写死 `parent / "musicxml2tex.py"` 会直接失效；
    再挪一次还会失效。向上找是唯一不会因为搬家而断的做法。
    """
    here = Path(__file__).resolve().parent
    candidates = [here / "musicxml2tex.py"]
    candidates += [base / "scripts" / "musicxml2tex.py" for base in here.parents]
    for c in candidates:
        if c.is_file():
            return c
    raise SystemExit(
        "找不到 musicxml2tex.py —— 它在仓库的 scripts/ 下，是本脚本的必经环节。\n"
        "  找过这些位置：\n" + "\n".join("    " + str(c) for c in candidates)
    )


def load_converter():
    """按**文件路径**加载 `musicxml2tex.py`。

    不用 `import musicxml2tex`：本脚本可能从任意工作目录被调用，靠 sys.path 猜太脆。

    ⚠️ 必须先把模块塞进 `sys.modules` 再 exec，否则 dataclass 解析
    `from __future__ import annotations` 产生的字符串注解时会报
    `AttributeError: 'NoneType' object has no attribute '__dict__'`——
    它要按 `cls.__module__` 回头找模块，找不到就炸。
    """
    path = find_converter()
    spec = importlib.util.spec_from_file_location("musicxml2tex", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"加载不了 {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["musicxml2tex"] = mod
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# spec 数据结构与解析
# ---------------------------------------------------------------------------


@dataclass
class Tok:
    """旋律里的一个 token。midi=None 表示休止。"""

    midi: int | None
    beats: Fraction
    raw: str


@dataclass
class Spec:
    path: Path
    title: str = ""
    artist: str = ""
    key: str = "C"
    minor: bool = False
    octave: int = 4
    time: tuple[int, int] = DEFAULT_TIME
    tempo: float = DEFAULT_TEMPO
    tuning: str = DEFAULT_TUNING
    instrument: int | None = DEFAULT_INSTRUMENT
    max_fret: int = 12
    melody: list[list[Tok]] = field(default_factory=list)
    lyrics: list[list[str]] = field(default_factory=list)

    @property
    def note_count(self) -> int:
        return sum(len(b) for b in self.melody)


def parse_key(text: str) -> tuple[str, bool]:
    """`F` / `F#` / `Bb` / `Dm` / `d minor` → (音名, 是否小调)。"""
    t = text.strip().lower().replace(" ", "")
    minor = t.endswith("minor") or (t.endswith("m") and len(t) > 1)
    if t.endswith("minor"):
        t = t[: -len("minor")]
    elif minor:
        t = t[:-1]
    if not re.fullmatch(r"[a-g][#b]?", t):
        raise SystemExit(f"key 写错了：{text!r}（示例 `F`、`Bb`、`Dm`、`a minor`）")
    return t, minor


def parse_tuning(text: str) -> list[int]:
    """`a4 e4 c4 g4` → MIDI 列表，**1 弦在前、保持书写顺序**。

    ⚠️ 绝对不能 `sorted()`。尤克里里 GCEA 是**回归定弦**——4 弦 G4 比 3 弦 C4 高，
    音高序 ≠ 弦号序。排一下序，`strings[1]` 就从「2 弦 E4」变成「4 弦 G4」，
    后面所有 `string/fret` 全错，而且没有任何报错。

    本函数与 `musicxml2tex.resolve_tunings()` 的返回约定一致：index 0 = 第 1 弦 = 最高音弦。
    """
    toks = re.findall(r"([a-gA-G])([#b]?)(-?\d)", text)
    if not toks:
        raise SystemExit(f"tuning 写错了：{text!r}（示例 `a4 e4 c4 g4`，1 弦在前）")
    return [
        (int(o) + 1) * 12 + LETTER_SEMITONE[l.lower()] + {"": 0, "#": 1, "b": -1}[acc]
        for l, acc, o in toks
    ]


def parse_melody_token(tok: str, tonic_midi: int, where: str,
                       degrees: dict[int, int] = DEGREE_SEMITONE) -> Tok:
    m = NOTE_RE.match(tok)
    if not m:
        hint = ""
        if tok.startswith("#"):
            hint = "\n  （行首 `#` 要**跟一个空格**才是注释：`# 说明`。`#4` 是升号音）"
        raise SystemExit(
            f"{where} 看不懂的音符：{tok!r}{hint}\n"
            "  合法写法：`5`、`1'`（高八度）、`5,`（低八度）、`#4`、`0`（休止）、"
            "`5-`（再加一拍）、`5:0.5`（明确 0.5 拍）"
        )

    if m.group("dash"):
        beats = Fraction(1 + len(m.group("dash")))
    elif m.group("beats"):
        beats = Fraction(m.group("beats"))
    else:
        beats = Fraction(1)

    deg = int(m.group("deg"))
    if deg == 0:
        if m.group("acc") or m.group("oct"):
            raise SystemExit(f"{where} 休止符不能带升降号或八度记号：{tok!r}")
        return Tok(midi=None, beats=beats, raw=tok)

    acc = {"": 0, "#": 1, "b": -1}[m.group("acc")]
    shift = m.group("oct").count("'") - m.group("oct").count(",")
    midi = tonic_midi + degrees[deg] + acc + 12 * shift
    if not 0 <= midi <= 127:
        raise SystemExit(f"{where} {tok!r} 换算出的音高 {midi} 超出 MIDI 范围，检查八度记号")
    return Tok(midi=midi, beats=beats, raw=tok)


def load_spec(path: Path) -> Spec:
    if not path.exists():
        raise SystemExit(
            f"找不到 spec 文件：{path}\n"
            "  spec 是一份纯文本简谱，长这样：\n"
            "    title: 曲名\n"
            "    key: F            # 1 = F\n"
            "    melody:\n"
            "      3 3 5 6 | 1' 1' 6 5 |\n"
        )

    spec = Spec(path=path)
    blocks: dict[str, list[tuple[int, str]]] = {"melody": [], "lyrics": []}
    current: str | None = None

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw.strip()
        # 注释 = 行首 `#` **后面跟空格/Tab**（`# 说明`），或整行只有 `#`。
        # ⚠️ 不能见到行首 `#` 就当注释：一个小节完全可能以升号音开头（`#4 5 1' |`），
        #    那样整行会被吃掉，小节数少一个，最后报出来的是「歌词与旋律小节数对不上」，
        #    跟真正的原因差了十万八千里。行内的 `#` 更不能一刀切地 split。
        if not stripped or stripped == "#" or stripped.startswith(("# ", "#\t")):
            continue

        # 顶层键必须**从行首开始**（不缩进）且名字已知 —— 这样块内缩进的
        # `b7:0.5` 之类不会被误判成键。
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", raw)
        if m and m.group(1).lower() in KNOWN_KEYS:
            k, v = m.group(1).lower(), m.group(2).strip()
            if k in BLOCK_KEYS:
                current = k
                if v:
                    blocks[k].append((lineno, v))
                continue
            current = None
            where = f"{path}:{lineno}"
            if k == "title":
                spec.title = v
            elif k == "artist":
                spec.artist = v
            elif k == "key":
                spec.key = v
            elif k == "octave":
                spec.octave = int(v)
            elif k == "tempo":
                spec.tempo = float(v)
            elif k == "tuning":
                spec.tuning = v
            elif k == "instrument":
                spec.instrument = None if v.lower() in ("none", "无", "-", "") else int(v)
            elif k == "maxfret":
                spec.max_fret = int(v)
            elif k == "time":
                tm = re.fullmatch(r"(\d+)\s*/\s*(\d+)", v)
                if not tm:
                    raise SystemExit(f"{where} time 要写成 `4/4`，收到 {v!r}")
                spec.time = (int(tm.group(1)), int(tm.group(2)))
            continue

        if current is None:
            raise SystemExit(f"{path}:{lineno} 这行不在任何块里，也不是 `键: 值`：{raw!r}")
        blocks[current].append((lineno, stripped))

    if not spec.title:
        raise SystemExit(f"{path} 缺 `title:`")
    if not blocks["melody"]:
        raise SystemExit(f"{path} 的 `melody:` 块是空的")

    key_name, minor = parse_key(spec.key)
    acc = {"": 0, "#": 1, "b": -1}[key_name[1:]]
    tonic_midi = (spec.octave + 1) * 12 + LETTER_SEMITONE[key_name[0]] + acc
    spec.key = key_name + ("minor" if minor else "")
    spec.minor = minor
    degrees = DEGREE_SEMITONE_MINOR if minor else DEGREE_SEMITONE

    spec.melody = [
        [parse_melody_token(t, tonic_midi, f"{path}:{ln}", degrees) for t in bar.split()]
        for ln, bar in _bars(blocks["melody"])
    ]
    if blocks["lyrics"]:
        spec.lyrics = [bar.split() for _, bar in _bars(blocks["lyrics"])]
        check_lyrics(spec)
    return spec


def _bars(lines: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """把块内所有行拼起来按 `|` 切小节 → [(**文件真实行号**, 小节内容)]。

    ⚠️ 行号必须是**文件里的行号**，不能是块内的第几行：这份 spec 是给人手改的，
    报错指到「块内第 1 行」，人要自己数它是文件第几行，等于没报。
    """
    out: list[tuple[int, str]] = []
    for lineno, line in lines:
        for bar in line.split("|"):
            if bar.split():
                out.append((lineno, bar))
    return out


def check_lyrics(spec: Spec) -> None:
    """逐小节核对「歌词槽位数 == 音数」。

    ⚠️ 必须**逐小节**报，不能只报总数：错位最常见的原因是某小节多敲/漏敲一个字，
    只报「总数 66 ≠ 67」根本看不出是哪儿。
    """
    if len(spec.lyrics) != len(spec.melody):
        raise SystemExit(
            f"lyrics 有 {len(spec.lyrics)} 小节，melody 有 {len(spec.melody)} 小节，对不上\n"
            "  （两个块里 `|` 的个数也要一一对应）"
        )
    problems = [
        f"  第 {i} 小节：{len(notes)} 个音，却写了 {len(words)} 个字（{' '.join(words)}）"
        for i, (notes, words) in enumerate(zip(spec.melody, spec.lyrics), start=1)
        if len(notes) != len(words)
    ]
    if problems:
        raise SystemExit(
            "歌词与音符数量不匹配 —— 一个音对一个槽位，拖腔的延续音写 `-`：\n"
            + "\n".join(problems)
        )


# ---------------------------------------------------------------------------
# 生成
# ---------------------------------------------------------------------------


def divisions_for(spec: Spec) -> int:
    """让每个时值都能写成整数 tick 的 `<divisions>`。"""
    div = 4
    for bar in spec.melody:
        for t in bar:
            div = math.lcm(div, t.beats.denominator)
    return div


def duration_type(beats: Fraction) -> tuple[str, int]:
    value = float(beats)
    for v, name, dots in DURATION_TYPES:
        if abs(value - v) < 1e-9:
            return name, dots
    # 精确匹配不上：给个「不超过它」的基底当提示，真时值由 <duration> 说话。
    return max((d for d in DURATION_TYPES if d[0] <= value + 1e-9),
               default=(0.25, "16th", 0))[1:]


def check_playable(spec: Spec, strings: list[int]) -> None:
    """每个音都必须在尤克里里上按得出来，否则直接报错。

    ⚠️ 为什么非要单独查一遍：`assign_fingering()` 遇到按不出来的音（低于 3 弦空弦 C4，
    或超出 `maxfret`）会**静默取最接近的弦 + 品 0**，于是谱面上出现一个听感完全不对、
    却看不出任何异常的音，也没有警告 —— 跟 `<staff-tuning>` 写反是同一类事故。
    而且 `tex:verify` 也抓不到：它核的是「定弦+品 == 实音」这条恒等式，而实音是从
    被改写过的品算出来的，自洽。
    """
    bad: list[str] = []
    opened = min(strings)          # 最低空弦（尤克里里 GCEA = C4）
    for bi, bar in enumerate(spec.melody, start=1):
        for t in bar:
            if t.midi is None:
                continue
            if any(0 <= t.midi - open_midi <= spec.max_fret for open_midi in strings):
                continue
            why = (f"比最低空弦还低（最低只能到 {m2t_note_name(opened)}）"
                   if t.midi < opened else f"超出最高品（maxfret {spec.max_fret}）")
            bad.append(f"  第 {bi} 小节 `{t.raw}` —— {why}")
    if bad:
        raise SystemExit(
            f"有 {len(bad)} 个音在尤克里里上按不出来：\n" + "\n".join(bad) + "\n"
            "  · 偏低的音：调 `octave:`（把整首的 1 挪高/低八度），或换 `key:`\n"
            "  · 偏高的音：调大 `maxfret:`\n"
            "  ⚠️ 不拦的话它会被静默改成最接近的音，谱面上完全看不出来。"
        )


def m2t_note_name(midi: int) -> str:
    """MIDI → `C4` 这种写法，只用于报错信息。"""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    return names[midi % 12] + str(midi // 12 - 1)


def assign_fingerings(spec: Spec, strings: list[int], divisions: int, m2t) -> list:
    """给每个音算出 (弦号, 品)。

    ⚠️ 两件事都不能想当然：
    1. **必须一个音一个音地调 `assign_fingering`。** 它是**簇级**函数——传进去的 list
       被当作「同时发声的和弦」，会在同弦撞车时 +100 惩罚。一次喂 8 个连续音，
       第 2 个音起全被当成撞车，算出来的是垃圾。
    2. **不能自己复刻一份把位算法**，就用 `musicxml2tex.py` 里那一个：
       站点的谱面是它算的，这里也是它算的，否则「先生成 xml 再转 tex」会得到两套把位。
    """
    notes = []
    for bar in spec.melody:
        for t in bar:
            n = m2t.XmlNote()
            n.is_rest = t.midi is None
            n.midi = t.midi
            n.ticks = int(t.beats * divisions)
            notes.append(n)

    prev: dict[int, int] = {}
    for n in notes:
        m2t.assign_fingering([n], strings, spec.max_fret, prev, force=False)
    return notes


def build_musicxml(spec: Spec, notes: list, divisions: int, m2t) -> ET.Element:
    root = ET.Element("score-partwise", {"version": "3.1"})
    ET.SubElement(ET.SubElement(root, "work"), "work-title").text = spec.title

    ident = ET.SubElement(root, "identification")
    if spec.artist:
        ET.SubElement(ident, "creator", {"type": "composer"}).text = spec.artist
    ET.SubElement(ET.SubElement(ident, "encoding"), "software").text = "scoregen.py"

    key_name, minor = parse_key(spec.key)
    fifths = {v: k for k, v in (m2t.MINOR_TONICS if minor else m2t.MAJOR_TONICS).items()}.get(key_name)
    if fifths is None:
        raise SystemExit(f"key {spec.key!r} 的调号超出 ±7，不支持")

    strings = parse_tuning(spec.tuning)

    pl = ET.SubElement(root, "part-list")
    sp = ET.SubElement(pl, "score-part", {"id": "P1"})
    ET.SubElement(sp, "part-name").text = spec.title
    if spec.instrument is not None:
        si = ET.SubElement(sp, "score-instrument", {"id": "P1-I1"})
        ET.SubElement(si, "instrument-name").text = "Ukulele"
        mi = ET.SubElement(sp, "midi-instrument", {"id": "P1-I1"})
        # ⚠️ MusicXML 的 <midi-program> 是 **1 基**，而 GM 号（以及本站 site.config）
        #    是 0 基。差一就变成隔壁音色，而且不会报错。
        ET.SubElement(mi, "midi-program").text = str(spec.instrument + 1)

    part = ET.SubElement(root, "part", {"id": "P1"})
    beats, beat_type = spec.time
    idx = 0

    for bi, bar in enumerate(spec.melody, start=1):
        measure = ET.SubElement(part, "measure", {"number": str(bi)})

        if bi == 1:
            at = ET.SubElement(measure, "attributes")
            ET.SubElement(at, "divisions").text = str(divisions)
            k = ET.SubElement(at, "key")
            ET.SubElement(k, "fifths").text = str(fifths)
            ET.SubElement(k, "mode").text = "minor" if minor else "major"
            t = ET.SubElement(at, "time")
            ET.SubElement(t, "beats").text = str(beats)
            ET.SubElement(t, "beat-type").text = str(beat_type)
            sd = ET.SubElement(at, "staff-details", {"number": "1"})
            ET.SubElement(sd, "staff-lines").text = str(len(strings))
            # `<staff-tuning line>` 的方向是这套链路里最阴的一个坑：写反了，
            # 文件里 <pitch> 与 <string>/<fret> 依然自洽，**不报任何错**，只是整首移调。
            #
            # 这里按 **line 1 = 弦号最大那根**（尤克里里 = 4 弦 G4）写。依据两条：
            #   1. alphaTab 读 MusicXML 时用 `tuning[弦数 − line]`，而它的
            #      `tuning[0]` 是第 1 弦 ⇒ line 1 必须落在弦号最大的那根。
            #      本站的校验权威是 alphaTab，就按它的约定来（真 alphaTab 解析在
            #      `pnpm tex:verify` 里跑）。
            #   2. 项目既有谱面也这么写（见 git 历史里的 senbonzakura / molihua）。
            # ⚠️ 所以是**倒着**取 `strings`，不是 `sorted(strings)` —— GCEA 是回归定弦，
            #    音高序 ≠ 弦号序，`sorted()` 会把 2 弦和 4 弦对调。
            # 写完还会 `audit_tuning()` 把定弦读回来跟 spec 对一遍，见 main()。
            for line in range(1, len(strings) + 1):
                midi = strings[len(strings) - line]
                stn = ET.SubElement(sd, "staff-tuning", {"line": str(line)})
                ET.SubElement(stn, "tuning-step").text = m2t.NOTE_NAMES[midi % 12][0]
                alter = (midi % 12) - LETTER_SEMITONE[m2t.NOTE_NAMES[midi % 12][0].lower()]
                if alter:
                    ET.SubElement(stn, "tuning-alter").text = str(alter)
                ET.SubElement(stn, "tuning-octave").text = str(midi // 12 - 1)

            d = ET.SubElement(measure, "direction", {"placement": "above"})
            mm = ET.SubElement(ET.SubElement(d, "direction-type"), "metronome")
            ET.SubElement(mm, "beat-unit").text = "quarter"
            ET.SubElement(mm, "per-minute").text = str(round(spec.tempo))
            ET.SubElement(d, "sound", {"tempo": str(round(spec.tempo))})

        for ti, tok in enumerate(bar, start=1):
            note = ET.SubElement(measure, "note")

            if tok.midi is None:
                ET.SubElement(note, "rest")
            else:
                p = ET.SubElement(note, "pitch")
                name = m2t.NOTE_NAMES[tok.midi % 12]
                ET.SubElement(p, "step").text = name[0]
                alter = (tok.midi % 12) - LETTER_SEMITONE[name[0].lower()]
                if alter:
                    ET.SubElement(p, "alter").text = str(alter)
                ET.SubElement(p, "octave").text = str(tok.midi // 12 - 1)

            ET.SubElement(note, "duration").text = str(int(tok.beats * divisions))
            ET.SubElement(note, "voice").text = "1"
            type_name, dots = duration_type(tok.beats)
            ET.SubElement(note, "type").text = type_name
            for _ in range(dots):
                ET.SubElement(note, "dot")

            if tok.midi is not None:
                n = notes[idx]
                if n.string is not None and n.fret is not None:
                    tech = ET.SubElement(ET.SubElement(note, "notations"), "technical")
                    ET.SubElement(tech, "string").text = str(n.string)
                    ET.SubElement(tech, "fret").text = str(n.fret)

            if spec.lyrics:
                word = spec.lyrics[bi - 1][ti - 1]
                if word and word != "-":
                    # 拖腔：本音是「有字的最后一个音」→ <syllabic>begin</syllabic> + <extend/>
                    nxt = spec.lyrics[bi - 1][ti] if ti < len(bar) else None
                    if nxt is None and bi < len(spec.lyrics):
                        nxt = spec.lyrics[bi][0]
                    ly = ET.SubElement(note, "lyric", {"number": "1"})
                    ET.SubElement(ly, "syllabic").text = "begin" if nxt == "-" else "single"
                    ET.SubElement(ly, "text").text = word
                    if nxt == "-":
                        ET.SubElement(ly, "extend")

            idx += 1

    if idx != len(notes):
        raise SystemExit(f"内部错误：写出 {idx} 个音，算指法时按 {len(notes)} 个算的")
    return root


def write_musicxml(root: ET.Element, path: Path) -> None:
    xml = minidom.parseString(ET.tostring(root, encoding="utf-8")).toprettyxml(indent="  ")
    path.write_text(xml, encoding="utf-8")


def audit_tuning(ps, strings: list[int], m2t) -> str | None:
    """把刚写出的 MusicXML 用**转换器自己的方向判定**读回来，跟 spec 里的定弦对一遍。

    为什么要多这一步：`<staff-tuning line>` 写反时**没有任何报错**，只是整首移调
    （本站真的踩过，见 NOTES 的「头号风险」）。让同一套判定逻辑回头读一遍自己写的东西，
    是唯一能自动抓到这类错的办法。返回 None = 没问题，否则返回一句人话。
    """
    got = m2t.resolve_tunings(ps, "auto", None, quiet=True)
    if got == strings:
        return None
    fmt = lambda xs: " ".join(m2t.midi_to_tex_tuning(x) for x in xs)  # noqa: E731
    return (
        f"定弦对不上：写入的是 `{fmt(strings)}`，读回来却成了 `{fmt(got)}`\n"
        "  多半是 <staff-tuning line> 的方向写反了 —— alphaTab 会因此整首移调且不报错。"
    )


def count_melismas(spec: Spec) -> int:
    """有字、且下一个槽位是 `-` 的音，就是一次拖腔的起点。"""
    n = 0
    for bi, bar in enumerate(spec.lyrics):
        for i, w in enumerate(bar):
            if not w or w == "-":
                continue
            nxt = bar[i + 1] if i + 1 < len(bar) else (
                spec.lyrics[bi + 1][0] if bi + 1 < len(spec.lyrics) else None
            )
            if nxt == "-":
                n += 1
    return n


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def resolve_paths(target: str) -> tuple[Path, Path, Path]:
    """→ (spec 路径, tex 路径, musicxml 路径)。"""
    p = Path(target)
    spec_path = p if p.is_file() else p / "melody.txt"
    outdir = spec_path.parent
    stem = outdir.name or spec_path.stem
    return spec_path, outdir / "score.tex", outdir / f"{stem}.musicxml"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="简谱文本 → alphaTex / MusicXML（屿琴）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("target", help="歌曲目录（读其中的 melody.txt）或直接给 spec 文件")
    ap.add_argument("-f", "--format", choices=["tex", "musicxml", "both"], default="tex",
                    help="生成哪种（默认 tex = 站点直读的格式）")
    ap.add_argument("-o", "--output", help="覆盖输出路径（只在单格式时有意义）")
    ap.add_argument("--print", dest="to_stdout", action="store_true", help="同时把 tex 打到 stdout")
    ap.add_argument("--ragged", action="store_true",
                    help="允许小节拍数与拍号不符（弱起小节等）；默认直接报错")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    spec_path, tex_path, xml_path = resolve_paths(args.target)
    spec = load_spec(spec_path)
    m2t = load_converter()
    strings = parse_tuning(spec.tuning)
    check_playable(spec, strings)
    divisions = divisions_for(spec)
    notes = assign_fingerings(spec, strings, divisions, m2t)

    # 逐小节对拍号 —— 简谱最常见的手误就是某小节少敲/多敲一个音
    beats, beat_type = spec.time
    want = Fraction(beats * 4, beat_type)
    bad = []
    for i, bar in enumerate(spec.melody, start=1):
        got = sum((t.beats for t in bar), Fraction(0))
        if got != want:
            bad.append((i, got))
    if bad:
        detail = "\n".join(f"  第 {i} 小节：{float(g):g} 拍，应为 {float(want):g} 拍" for i, g in bad)
        if not args.ragged:
            raise SystemExit(
                f"有 {len(bad)} 个小节的拍数与 {beats}/{beat_type} 不符：\n{detail}\n"
                "  核对是不是漏敲/多敲了音、或时值后缀写错；弱起小节可加 --ragged 放行。"
            )
        for i, g in bad:
            print(f"  ⚠ 第 {i} 小节 {float(g):g} 拍 ≠ {float(want):g} 拍（--ragged 放行）",
                  file=sys.stderr)

    root = build_musicxml(spec, notes, divisions, m2t)

    # MusicXML 要不要留在磁盘上，由 --format 决定；但只要生成 tex，就**先**落一份
    # （落在临时文件里）—— 因为那份 MusicXML 就是 tex 的输入，两者不可能不一致。
    xml_out: Path | None = None
    if args.format in ("musicxml", "both"):
        xml_out = Path(args.output) if (args.output and args.format == "musicxml") else xml_path

    temp: Path | None = None
    src: Path | None = xml_out
    if src is None and args.format in ("tex", "both"):
        fh = tempfile.NamedTemporaryFile("w", suffix=".musicxml", delete=False, encoding="utf-8")
        fh.close()
        temp = src = Path(fh.name)

    ps = None
    if src is not None:
        write_musicxml(root, src)
        # 回读自检：把这份 MusicXML 当成「外部谱面」再读一遍，确认定弦没被写歪。
        # 定弦写反是本站唯一会**静默出错**的坑（整首移调、零报错），宁可在这里炸。
        ps = m2t.parse_musicxml(str(src))
        problem = audit_tuning(ps, strings, m2t)
        if problem:
            raise SystemExit("内部错误（请把这条报给脚本作者）：\n  " + problem)
        for w in ps.warnings:
            print("  ⚠ " + w, file=sys.stderr)

    wrote_tex = False
    tex_out: Path | None = None
    if args.format in ("tex", "both"):
        # ⚠️ 复用转换器自己的 argparse，绝不手抄一遍默认值（默认值一漂移就出鬼）。
        #    传 --quiet：诊断信息由本脚本统一打印，不然两套口径混在一起。
        conv = m2t.build_arg_parser().parse_args([str(src), "--quiet"])
        tex, _, _, warnings = m2t.convert(ps, conv)
        for w in warnings:
            print("  ⚠ " + w, file=sys.stderr)

        if args.to_stdout:
            sys.stdout.write(tex)
        tex_out = Path(args.output) if (args.output and args.format == "tex") else tex_path
        tex_out.write_text(tex, encoding="utf-8")
        wrote_tex = True

    if temp:
        temp.unlink()

    if not args.quiet:
        total = sum((t.beats for bar in spec.melody for t in bar), Fraction(0))
        print(
            f"· 《{spec.title}》 {len(spec.melody)} 小节 / {float(total):g} 拍 / "
            f"{spec.note_count} 音 / 定弦 " + " ".join(m2t.midi_to_tex_tuning(m) for m in strings),
            file=sys.stderr,
        )
        if spec.lyrics:
            print(f"  歌词 {sum(1 for b in spec.lyrics for w in b if w and w != '-')} 个音节"
                  f" · {count_melismas(spec)} 处拖腔", file=sys.stderr)
        if ps is not None:
            print("  ✓ 定弦自检通过（生成的 MusicXML 读回来与 spec 一致）", file=sys.stderr)
        if xml_out:
            print(f"  ✓ MusicXML → {xml_out}", file=sys.stderr)
        if wrote_tex and tex_out:
            print(f"  ✓ alphaTex → {tex_out}", file=sys.stderr)
        print("  → 别忘了跑 `pnpm tex:verify` 复核", file=sys.stderr)


if __name__ == "__main__":
    main()
