#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MusicXML → alphaTex 转换器（屿琴项目）

把一个 MusicXML 谱面转成本项目 `songs/<id>/score.tex` 用的 alphaTex 文本。
零依赖（只用标准库）。

为什么需要它
------------
`score.tex` 是这个站点**唯一**的谱面存储格式（见 ADR 0002，文件驱动）。
而 MusicXML 是外面世界的通用交换格式：MuseScore / Guitar Pro / 各类扒谱工具
导出、以及 `midi-to-musicxml` 那条链路的产物都是它。
所以「MusicXML → tex」就是把外部谱面搬进站点的唯一一道门。

它做什么
--------
1. 元数据：标题/作者/专辑/速度/拍号 → `\\title` `\\artist` `\\album` `\\tempo` `\\ts`
2. 定弦：从 `<staff-details><staff-tuning>` 反推，并**自动判定 line 语义**（见下）
3. 谱体：`<note>` / `<chord/>` / `<rest>` / `<unpitched>+<notehead>x</notehead>`
   → `品.弦` / `(和弦)` / `r` / `x.弦`，按小节分行、`|` 收尾
4. 时值：`<duration>`（参考 `<type>`/`<dot/>`）→ `:N` / `:N{d}` / `:N{dd}` / `:N{tu 3}`
5. 效果：`<arpeggiate>` `<hammer-on>` `<pull-off>` `<tie>` `<articulations>` 等 → `{...}`
6. 歌词：`<lyric><text>` → `{lyrics "字"}`（`--no-lyrics` 可关掉）
7. 缺 `<string>/<fret>` 时，可以直接从 `<pitch>` 自动指派把位（`--fingering auto`）

⚠️ 关于 `<staff-tuning line="N">` 的方向
---------------------------------------
MusicXML 规范里 `line` 是**从最下面那条线数起**（line 1 = 最底线）。
而 alphaTab 内部 `staff.tuning[0]` 是**最高音弦**，`<string>1</string>` 也是最高音弦，
于是 alphaTab 读 MusicXML 时做的是 `tuning[弦数 - line]`。

后果：一份「line 1 写成第一弦」的文件（手写的、AI 生成的文件经常这么写），
alphaTab 读出来的定弦是**反的**，每个音的实音都错。

本脚本不猜：两种语义都试一遍，用 `定弦[弦] + 品 == <pitch>` 这条恒等式
数「哪种解释对的音多」，自动选对的那个，并把判定结果打在 stderr。
`--tuning-mode {auto,document,spec}` 可手动强制。

用法
----
    python3 scripts/musicxml2tex.py songs/senbonzakura/senbonzakura.musicxml
    python3 scripts/musicxml2tex.py in.musicxml -o songs/foo/score.tex
    python3 scripts/musicxml2tex.py in.musicxml --instrument 25 --title "曲名"
    python3 scripts/musicxml2tex.py in.musicxml --brush brush   # 用 {bd}/{bu} 而不是 {ad}/{au}

生成后**务必**跑一遍 `node scripts/verify-tex.mjs <生成的.tex>`：
本脚本只保证文本层面自洽，真实解析由 alphaTab 说了算。
"""

from __future__ import annotations

import argparse
import itertools
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

STEP_TO_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# alphaTab 内部时基：960 tick = 一个四分音符。alphaTex 的 `:N` 是 1/N 音符。
TICKS_PER_QUARTER = 960

TYPE_TO_QUARTERS = {
    "whole": 4.0,
    "half": 2.0,
    "quarter": 1.0,
    "eighth": 0.5,
    "16th": 0.25,
    "32nd": 0.125,
    "64th": 0.0625,
    "128th": 0.03125,
}

QUARTERS_TO_TOKEN = {v: k for k, v in {
    1: 4.0, 2: 2.0, 4: 1.0, 8: 0.5, 16: 0.25, 32: 0.125, 64: 0.0625, 128: 0.03125
}.items()}

# alphaTab tuplet 支持的分母（AlphaTex1LanguageHandler._getTupletDenominator）
TUPLET_NUMERATORS = (3, 5, 6, 7, 9, 10, 11, 12)

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

HARMONIC_MAP = {
    "natural": "nh",
    "artificial": "ah",
    "tap": "th",
    "pinch": "ph",
    "semi": "sh",
    "feedback": "fh",
}

BRUSH_TO_ARPEGGIO = {"ad": "ad", "au": "au"}
ARPEGGIO_TO_BRUSH = {"ad": "bd", "au": "bu"}

# 调号：<fifths> → alphaTab 的 `\ks` 音名。
# ⚠️ 实测：`\ks f` = F 大调（-1）；`\ks dminor` = D 小调（-1）；
#    而 `\ks (d minor)` / `\ks dm` / `\ks -1` 都解析失败。所以小调要写成 `dminor`（无空格无括号）。
MAJOR_TONICS = {
    7: "c#", 6: "f#", 5: "b", 4: "e", 3: "a", 2: "d", 1: "g", 0: "c",
    -1: "f", -2: "bb", -3: "eb", -4: "ab", -5: "db", -6: "gb", -7: "cb",
}
MINOR_TONICS = {
    7: "a#", 6: "d#", 5: "g#", 4: "c#", 3: "f#", 2: "b", 1: "e", 0: "a",
    -1: "d", -2: "g", -3: "c", -4: "f", -5: "bb", -6: "eb", -7: "ab",
}


def key_directive(fifths: int, mode: str) -> str | None:
    table = MINOR_TONICS if mode == "minor" else MAJOR_TONICS
    tonic = table.get(fifths)
    if tonic is None:
        return None
    return tonic + ("minor" if mode == "minor" else "")


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------


def midi_to_tex_tuning(midi: int) -> str:
    """MIDI → alphaTab 的定弦写法（小写音名 + 升号 + 八度），如 69 → `a4`。"""
    return NOTE_NAMES[midi % 12].lower() + str(midi // 12 - 1)


@dataclass
class XmlNote:
    """MusicXML `<note>` 归一化后的中间表示。"""

    is_rest: bool = False
    is_dead: bool = False
    is_grace: bool = False
    measure_rest: bool = False
    chord: bool = False
    midi: int | None = None
    string: int | None = None
    fret: int | None = None
    ticks: int = 0
    type_name: str | None = None
    dots: int = 0
    voice: str = "1"

    tie_start: bool = False
    tie_stop: bool = False
    hammer: bool = False
    pull: bool = False
    harmonic: str | None = None
    brush: str | None = None
    articulations: list[str] = field(default_factory=list)
    unsupported: list[str] = field(default_factory=list)
    # 歌词：[(MusicXML 的 lyric @number, 文本)]。@number 是**1 基**，写出时转成 0 基。
    lyrics: list[tuple[int, str]] = field(default_factory=list)


@dataclass
class Beat:
    """输出侧的一拍。"""

    ticks: int
    notes: list[XmlNote]
    is_rest: bool
    token: int
    dots: int
    tuplet: int | None
    beat_fx: list[str] = field(default_factory=list)
    bar_index: int = 0
    # 歌词也是**拍属性**（alphaTex 里 `{lyrics "字"}` 挂在拍上，不挂在音上）
    lyrics: list[tuple[int, str]] = field(default_factory=list)

    @property
    def dur_key(self) -> tuple:
        return (self.token, self.dots, self.tuplet)


@dataclass
class ParsedScore:
    title: str = ""
    artist: str = ""
    tempo: float = 120.0
    beats: int = 4
    beat_type: int = 4
    fifths: int = 0
    mode: str = "major"
    staff_lines: int = 0
    divisions: int = 1
    tunings: list[tuple[int, int]] = field(default_factory=list)  # (line, midi)
    measures: list[list[XmlNote]] = field(default_factory=list)
    time_changes: dict[int, tuple[int, int]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def warn(self, msg: str) -> None:
        if msg not in self.warnings:
            self.warnings.append(msg)


# ---------------------------------------------------------------------------
# MusicXML 读取
# ---------------------------------------------------------------------------


def _text(el, default: str = "") -> str:
    if el is None:
        return default
    return (el.text or "").strip() or default


def _tag(el) -> str:
    return el.tag.split("}")[-1]


def pitch_to_midi(step: str, alter: float, octave: int) -> int:
    return (octave + 1) * 12 + STEP_TO_SEMITONE.get(step.upper(), 0) + int(round(alter))


def parse_note(el) -> XmlNote:
    n = XmlNote()

    if el.find("rest") is not None:
        n.is_rest = True
        n.measure_rest = el.find("rest").get("measure") == "yes"
    if el.find("grace") is not None:
        n.is_grace = True
        n.unsupported.append("grace")
    if el.find("chord") is not None:
        n.chord = True

    p = el.find("pitch")
    up = el.find("unpitched")
    if p is not None:
        n.midi = pitch_to_midi(
            _text(p.find("step"), "C"),
            float(_text(p.find("alter"), "0")),
            int(_text(p.find("octave"), "4")),
        )
    elif up is not None:
        n.midi = pitch_to_midi(
            _text(up.find("display-step"), "C"), 0.0, int(_text(up.find("display-octave"), "4"))
        )

    if _text(el.find("notehead")) in ("x", "X", "circle-x"):
        n.is_dead = True

    n.ticks = int(_text(el.find("duration"), "0"))
    n.type_name = _text(el.find("type")) or None
    n.dots = len(el.findall("dot"))
    n.voice = _text(el.find("voice"), "1")

    for tie in list(el.findall("tie")) + list(el.findall("notations/tied")):
        t = tie.get("type")
        if t == "start":
            n.tie_start = True
        elif t == "stop":
            n.tie_stop = True

    tech = el.find("notations/technical")
    if tech is not None:
        s = tech.find("string")
        if s is not None and _text(s):
            n.string = int(_text(s))
        f = tech.find("fret")
        if f is not None and _text(f):
            n.fret = int(_text(f))
        for ho in tech.findall("hammer-on"):
            if (ho.get("type") or "start") == "start":
                n.hammer = True
        for po in tech.findall("pull-off"):
            if (po.get("type") or "start") == "start":
                n.pull = True
        harm = tech.find("harmonic")
        if harm is not None:
            for kind, code in HARMONIC_MAP.items():
                if harm.find(kind) is not None:
                    n.harmonic = code
                    break
            else:
                n.harmonic = "nh"
        if tech.find("bend") is not None:
            n.unsupported.append("bend")
        if tech.find("tap") is not None:
            n.unsupported.append("tap")
        if tech.find("fingering") is not None:
            n.unsupported.append("fingering")

    arts = el.find("notations/articulations")
    if arts is not None:
        for c in arts:
            tg = _tag(c)
            if tg == "staccato":
                n.articulations.append("st")
            elif tg == "accent":
                n.articulations.append("ac")
            elif tg == "strong-accent":
                n.articulations.append("hac")
            elif tg == "tenuto":
                n.articulations.append("ten")
            else:
                n.unsupported.append(tg)

    arp = el.find("notations/arpeggiate")
    if arp is not None:
        n.brush = {"down": "ad", "up": "au"}.get(arp.get("direction", "down"), "ad")

    if el.find("notations/ornaments") is not None:
        n.unsupported.append("ornament")
    if el.find("notations/slide") is not None or el.find("notations/glissando") is not None:
        n.unsupported.append("slide")
    if el.find("notations/slur") is not None:
        n.unsupported.append("slur")

    n.lyrics = parse_lyrics(el)

    return n


def parse_lyrics(el) -> list[tuple[int, str]]:
    """读 `<lyric number="N"><text>字</text></lyric>` → [(N, "字")]。

    ⚠️ 「一字多音」的两种写法都要当成**不产出音节**，否则整个字会错位：
      - 延续音干脆不写 `<lyric>`（最常见）
      - 或写成 `<lyric number="1"><extend/></lyric>`（只有 extend、没有 text）
    两种都跳过。`<elision>` 是同一个音节内的连字（如英文 "ev'-ry"），拼进去。

    多个 `<text>` 用空格连接——与 alphaTab 的 MusicXmlImporter._parseLyric 行为一致。
    """
    out: list[tuple[int, str]] = []
    for ly in el.findall("lyric"):
        raw = ly.get("number")
        try:
            num = int(raw) if raw else 1
        except ValueError:
            num = 1
        parts: list[str] = []
        for c in ly:
            tg = _tag(c)
            if tg == "text":
                if _text(c):
                    parts.append(_text(c))
            elif tg == "elision":
                parts.append(_text(c))
        text = " ".join(parts)
        if text:
            out.append((num, text))
    return out


def parse_musicxml(path: str) -> ParsedScore:
    root = ET.parse(path).getroot()
    if _tag(root) != "score-partwise":
        raise SystemExit(
            f"只支持 score-partwise（partwise）形式的 MusicXML，当前根节点是 <{_tag(root)}>"
        )

    ps = ParsedScore()
    ps.title = _text(root.find("work/work-title")) or _text(root.find("movement-title"))
    # 作者按优先级取：作曲 > 作词 > artist > 编曲（一份文件里常有多个 <creator>）
    creators: dict[str, str] = {}
    for creator in root.findall("identification/creator"):
        t = creator.get("type", "")
        if t and t not in creators:
            creators[t] = _text(creator)
    for t in ("composer", "lyricist", "artist", "arranger"):
        if creators.get(t):
            ps.artist = creators[t]
            break
    part_name = _text(root.find("part-list/score-part/part-name"))

    part = root.find("part")
    if part is None:
        raise SystemExit("MusicXML 里没有 <part>")

    divisions_seen = False
    first_attrs_done = False
    implicit_seen = False

    for measure in part.findall("measure"):
        if measure.get("implicit") == "yes":
            implicit_seen = True
        bar_notes: list[XmlNote] = []

        for el in measure:
            tag = _tag(el)

            if tag == "attributes":
                d = el.find("divisions")
                if d is not None and _text(d):
                    ps.divisions = int(_text(d))
                    divisions_seen = True

                t = el.find("time")
                if t is not None:
                    pair = (int(_text(t.find("beats"), "4")), int(_text(t.find("beat-type"), "4")))
                    if not first_attrs_done:
                        ps.beats, ps.beat_type = pair
                    else:
                        ps.time_changes[len(ps.measures)] = pair

                k = el.find("key")
                if k is not None and not first_attrs_done:
                    ps.fifths = int(_text(k.find("fifths"), "0"))
                    ps.mode = _text(k.find("mode"), "major")

                sd = el.find("staff-details")
                if sd is not None:
                    sl = sd.find("staff-lines")
                    if sl is not None and _text(sl):
                        ps.staff_lines = int(_text(sl))
                    for st in sd.findall("staff-tuning"):
                        line = int(st.get("line", "1"))
                        step = _text(st.find("tuning-step"), "C")
                        alter = float(_text(st.find("tuning-alter"), "0"))
                        octv = int(_text(st.find("tuning-octave"), "4"))
                        item = (line, pitch_to_midi(step, alter, octv))
                        if item not in ps.tunings:
                            ps.tunings.append(item)
                first_attrs_done = True

            elif tag == "direction":
                if not ps.measures:
                    sound = el.find("sound")
                    mm = el.find("direction-type/metronome/per-minute")
                    if sound is not None and sound.get("tempo"):
                        ps.tempo = float(sound.get("tempo"))
                    elif mm is not None and _text(mm):
                        ps.tempo = float(_text(mm))

            elif tag == "note":
                bar_notes.append(parse_note(el))

            elif tag == "backup":
                ps.warn("检测到 <backup>（多声部），本工具按单声部顺序拼接，请人工核对")
            elif tag == "forward":
                ps.warn("检测到 <forward>，本工具按单声部顺序拼接，请人工核对")
            elif tag == "barline":
                rep = el.find("repeat")
                if rep is not None:
                    ps.warn("检测到反复记号 <repeat>，alphaTex 的小节线写法未覆盖，请人工处理")
                if el.find("ending") is not None:
                    ps.warn("检测到跳房子 <ending>，请人工处理")

        if bar_notes:
            ps.measures.append(bar_notes)

    if not divisions_seen:
        ps.warn("MusicXML 里没有 <divisions>，按 1 处理（时值可能错）")
    if implicit_seen:
        ps.warn('存在 implicit="yes" 的不完整小节（弱起），首/末小节时值可能不满')
    if not ps.tunings:
        ps.warn("MusicXML 没有 <staff-tuning>，按 GCEA（a4 e4 c4 g4）处理")
    if part_name and not ps.title:
        ps.title = part_name

    return ps


# ---------------------------------------------------------------------------
# 定弦方向判定
# ---------------------------------------------------------------------------


def resolve_tunings(ps: ParsedScore, mode: str, override: str | None, quiet: bool = False) -> list[int]:
    """
    返回**按弦号排列**的定弦：index 0 = 第 1 弦 = 最高音弦。
    """
    if override:
        toks = re.findall(r"([a-gA-G])([#b]?)(-?\d)", override)
        if not toks:
            raise SystemExit(f"--tuning 解析失败：{override!r}（写法示例 `a4 e4 c4 g4`）")
        return [
            (int(o) + 1) * 12 + STEP_TO_SEMITONE[l.upper()] + {"": 0, "#": 1, "b": -1}[a]
            for l, a, o in toks
        ]

    if not ps.tunings:
        return [69, 64, 60, 67]

    count = ps.staff_lines or len(ps.tunings)

    def by_document() -> list[int]:
        return [m for _, m in ps.tunings]

    def by_spec() -> list[int]:
        table = {line: m for line, m in ps.tunings}
        return [table.get(count + 1 - n, 0) for n in range(1, count + 1)]

    candidates = {"document": by_document(), "spec": by_spec()}
    if mode in candidates:
        return candidates[mode]

    def matches(tuning: list[int]) -> tuple[int, int]:
        ok = bad = 0
        for bar in ps.measures:
            for n in bar:
                if n.is_rest or n.is_dead or n.string is None or n.fret is None or n.midi is None:
                    continue
                if 1 <= n.string <= len(tuning) and tuning[n.string - 1] + n.fret == n.midi:
                    ok += 1
                else:
                    bad += 1
        return ok, bad

    ok_doc, bad_doc = matches(candidates["document"])
    ok_spec, bad_spec = matches(candidates["spec"])
    pick = "document" if ok_doc >= ok_spec else "spec"
    # ⚠️ 警告要看**被选中**那个解释的 bad 数，不是 document 的。
    #    之前这里判 `if bad_doc` 却印 `bad_spec`（pick == "spec" 时），
    #    于是「document 全错、spec 全对」这种最健康的情况反而会印出
    #    「有 0 个音……对不上」的假警告。
    ok, bad = (ok_doc, bad_doc) if pick == "document" else (ok_spec, bad_spec)
    if not quiet:
        print(
            f"· 定弦方向自动判定：document 命中 {ok_doc}/{ok_doc + bad_doc}，"
            f"spec 命中 {ok_spec}/{ok_spec + bad_spec} → 采用 {pick}",
            file=sys.stderr,
        )
        if bad:
            print(
                f"  ⚠ 有 {bad} 个音在选定解释下仍对不上，"
                "多半是文件本身的定弦声明有误，建议人工过一眼",
                file=sys.stderr,
            )
    return candidates[pick]


# ---------------------------------------------------------------------------
# 缺 string/fret 时从 <pitch> 指派把位
# ---------------------------------------------------------------------------


def assign_fingering(notes: list[XmlNote], tuning: list[int], max_fret: int,
                     prev: dict[int, int], force: bool) -> None:
    """
    给音补上把位（就地修改）。
    枚举这一簇音的弦位组合，取「总品位 + 换把惩罚」最小的那个。簇 ≤ 4 音、4 弦，暴力枚举足够。
    """
    targets = [
        n for n in notes
        if not n.is_rest and not n.is_dead and n.midi is not None
        and (force or n.string is None or n.fret is None)
    ]
    if not targets:
        return

    options: list[list[tuple[int, int]]] = []
    for n in targets:
        opts = []
        for si, open_midi in enumerate(tuning, start=1):
            fret = (n.midi or 0) - open_midi
            if 0 <= fret <= max_fret:
                opts.append((si, fret))
        if not opts:
            best = min(range(len(tuning)), key=lambda i: abs((n.midi or 0) - tuning[i]))
            opts.append((best + 1, max(0, (n.midi or 0) - tuning[best])))
        options.append(opts)

    best_cost = None
    best_pick: list[tuple[int, int]] = []
    for combo in itertools.product(*options):
        used = [c[0] for c in combo]
        cost = sum(fret + 0.6 * abs(fret - prev.get(si, 0)) for si, fret in combo)
        if len(set(used)) != len(used):
            cost += 100  # 同弦撞车：重罚但不排除（同音簇只能这样）
        if best_cost is None or cost < best_cost:
            best_cost, best_pick = cost, list(combo)

    for n, pick in zip(targets, best_pick):
        n.string, n.fret = pick
        prev[pick[0]] = pick[1]


# ---------------------------------------------------------------------------
# 时值
# ---------------------------------------------------------------------------


def duration_token(ticks: int, divisions: int, dots_hint: int) -> tuple[int, int, int | None] | None:
    """返回 (N, dots, tuplet) —— 对应 `:N` + `{d}`*dots + `{tu k}`；无法精确表示时返回 None。"""
    if divisions <= 0 or ticks <= 0:
        return None
    quarters = ticks / divisions
    dot_choices = [dots_hint] if dots_hint else [0, 1, 2]

    for d in dot_choices:
        base = quarters / (2 - 0.5**d)
        token = QUARTERS_TO_TOKEN.get(round(base, 6))
        if token is not None and abs(base - round(base, 6)) < 1e-9:
            return token, d, None

    for k in TUPLET_NUMERATORS:
        for d in (0, 1, 2):
            base = quarters * k / (2 - 0.5**d)
            token = QUARTERS_TO_TOKEN.get(round(base, 6))
            if token is not None and abs(base - round(base, 6)) < 1e-9:
                return token, d, k
    return None


def fill_missing_time(quarters: float) -> tuple[int, int, int | None] | None:
    """退路：找一个 ≤ quarters 的最大整时值。"""
    for q, token in sorted(QUARTERS_TO_TOKEN.items(), reverse=True):
        if q <= quarters + 1e-9:
            return token, 0, None
    return None


# ---------------------------------------------------------------------------
# 组装
# ---------------------------------------------------------------------------


def build_bars(ps: ParsedScore, tuning: list[int], args):
    warnings: list[str] = []
    prev_fret: dict[int, int] = {}
    bars: list[list[Beat]] = []

    for bi, xml_notes in enumerate(ps.measures):
        clusters: list[list[XmlNote]] = []
        for n in xml_notes:
            if n.chord and clusters and not n.is_rest:
                clusters[-1].append(n)
            else:
                clusters.append([n])

        bar_beats: list[Beat] = []
        for cluster in clusters:
            head = cluster[0]

            assign_fingering(cluster, tuning, args.max_fret, prev_fret, force=(args.fingering == "auto"))
            for n in cluster:
                if n.string is not None and n.fret is not None:
                    prev_fret[n.string] = n.fret

            # 死音：补一个弦号（输出只看弦，不看品）
            for n in cluster:
                if n.is_dead:
                    n.fret = 0
                    if n.string is None and n.midi is not None:
                        n.string = min(range(len(tuning)), key=lambda i: abs(tuning[i] - n.midi)) + 1

            # 整小节休止常常不写 <duration>，按拍号补满
            if head.measure_rest and head.ticks <= 0:
                head.ticks = int(round(ps.beats * (4.0 / ps.beat_type) * ps.divisions))

            if head.is_grace:
                dt = (4, 0, None)
            else:
                dt = duration_token(head.ticks, ps.divisions, head.dots)
            if dt is None:
                approx = fill_missing_time(head.ticks / ps.divisions) if head.ticks else None
                if approx is None:
                    warnings.append(f"第 {bi + 1} 小节有一拍时值为 0，按四分音符占位")
                    approx = (4, 0, None)
                else:
                    warnings.append(
                        f"第 {bi + 1} 小节时值 {head.ticks}/{ps.divisions} 拍无法用 `:N` 精确表示，"
                        f"已近似为 :{approx[0]}"
                    )
                dt = approx
            token, dots, tuplet = dt

            beat = Beat(ticks=head.ticks, notes=cluster, is_rest=head.is_rest,
                        token=token, dots=dots, tuplet=tuplet, bar_index=bi)

            if head.brush:
                code = head.brush if args.brush == "arpeggio" else ARPEGGIO_TO_BRUSH[head.brush]
                beat.beat_fx.append(code)

            if not args.no_lyrics:
                # 和弦簇里任何一个音带 <lyric> 都算这一拍的歌词（alphaTab 的
                # MusicXmlImporter 也是把 lyric 记在拍上，读的是簇里那个音的子节点）
                beat.lyrics = next((n.lyrics for n in cluster if n.lyrics), [])

            for n in cluster:
                for u in n.unsupported:
                    warnings.append(f"第 {bi + 1} 小节有 <{u}> 记号，alphaTex 侧未表达，已忽略")

            bar_beats.append(beat)

        bars.append(bar_beats)

    return bars, warnings


def render_note(n: XmlNote) -> str:
    if n.is_rest:
        return "r"
    if n.string is None or n.fret is None:
        return ""

    fx: list[str] = []
    if n.hammer or n.pull:
        fx.append("h")
    if n.tie_stop:
        fx.append("-")
    if n.harmonic:
        fx.append(n.harmonic)
    # ⚠️ 死音不写 `{x}`：alphaTex 里 `x.N` 本身就已经是死音，
    #    再挂一个 `{x}` 只是噪声（两者等价）。
    fx.extend(n.articulations)

    body = ("x" if n.is_dead else str(n.fret)) + "." + str(n.string)
    return body + "{" + " ".join(fx) + "}" if fx else body


def render_beat(beat: Beat, prev_key, warnings: list[str], force_duration: bool) -> str:
    parts: list[str] = []

    if force_duration or beat.dur_key != prev_key:
        # ⚠️ `:N` 后面必须留空格，否则 `:8(0.1 …)` 会跟和弦括号粘成一个 token
        parts.append(f":{beat.token} ")

    if beat.is_rest:
        parts.append("r")
    else:
        rendered = [r for r in (render_note(n) for n in beat.notes) if r]
        if not rendered:
            if not beat.is_rest:
                warnings.append(
                    f"第 {beat.bar_index + 1} 小节有音缺 <string>/<fret> 或 <pitch>，已写成休止"
                )
            parts.append("r")
        elif len(rendered) == 1:
            parts.append(rendered[0])
        else:
            parts.append("(" + " ".join(rendered) + ")")

    # ⚠️ 附点/连音/刷弦都是**拍效果**，必须写在音符后面；而且**只能合成一个 `{...}` 组**——
    #    实测 `(0.1 1.2){bd} {d}` 会解析失败，`{d bd}` 才行。
    #    顺序也有讲究：附点写在前面，`{bd}` 的默认刷弦时长才会按附点后的拍长算
    #    （`{d bd}` → brushDuration 90；`{bd d}` → 60，因为算的时候还没加附点）。
    tokens: list[str] = []
    if beat.dots == 1:
        tokens.append("d")
    elif beat.dots >= 2:
        tokens.append("dd")
    if beat.tuplet:
        tokens.append(f"tu {beat.tuplet}")
    tokens.extend(beat.beat_fx)

    # 歌词也是拍属性。⚠️ 三个实测出来的硬规矩：
    #   1. 文本**必须带引号**——`{lyrics 好}` 会报
    #      `Error parsing arguments: no overload matched arguments ()` + `Unrecognized property '好'`。
    #   2. 多行歌词写成 `{lyrics (行号 "字")}`；括号不能省（省了只出 Hint，但会跟下个属性粘一起）。
    #      行号是 **0 基**，而 MusicXML 的 @number 是 1 基，所以这里减 1。
    #   3. 转义规则与 `\title` 相同（见 tex_str）——歌词里出现 `"` 一样会炸整份谱面。
    for num, text in beat.lyrics:
        esc = tex_str(text)
        tokens.append(f'lyrics "{esc}"' if num <= 1 else f'lyrics ({num - 1} "{esc}")')

    if tokens:
        # 和弦后面留空格更接近手写习惯（`:8 (0.1 1.2) {bd}`），单音则紧贴（`:16 2.3{h}`）
        sep = " " if (len(beat.notes) > 1 and not beat.is_rest) else ""
        parts.append(sep + "{" + " ".join(tokens) + "}")

    return "".join(parts)


def tex_str(value: str) -> str:
    """把任意文本塞进 alphaTex 的 `"..."` 字面量里。

    ⚠️ 不转义会静默炸掉整份谱面：MusicXML 的 <work-title> 里常有内嵌引号，例如
    Telemann 那份的标题是 `Excerpt from "Liebe! Liebe! ..."`，原样写进去会变成
    `\\title "Excerpt from "Liebe!..."` —— 字符串在第二个 `"` 处提前闭合，
    后面的内容被当成指令，alphaTab 直接报 "Error parsing alphaTex"，
    而错误信息里**看不到**是哪一行，极难定位。

    1.8.4 实测支持 `\\"` 与 `\\\\` 两种转义，所以按顺序：先反斜杠、再引号。
    """
    return value.replace("\\", "\\\\").replace('"', '\\"')


def render_tex(ps: ParsedScore, tuning: list[int], bars, args) -> str:
    warnings: list[str] = []

    title = args.title if args.title is not None else ps.title
    lines: list[str] = []
    if title:
        lines.append(f'\\title "{tex_str(title)}"')
    subtitle = args.subtitle or ""
    if subtitle:
        lines.append(f'\\subtitle "{tex_str(subtitle)}"')
    artist = args.artist if args.artist is not None else ps.artist
    if artist:
        lines.append(f'\\artist "{tex_str(artist)}"')
    if args.album:
        lines.append(f'\\album "{tex_str(args.album)}"')
    lines.append(f"\\tempo {round(args.tempo if args.tempo else ps.tempo)}")
    lines.append(".")
    if args.instrument is not None:
        lines.append(f"\\instrument {args.instrument}")
    tune = " ".join(midi_to_tex_tuning(m) for m in tuning)
    lines.append(f"\\tuning {tune}" if args.bare_meta else f"\\tuning ({tune})")
    if args.key:
        kd = key_directive(ps.fifths, ps.mode)
        if kd is None:
            print(f"  ⚠ 调号 fifths={ps.fifths} 超出 ±7，已跳过 \\ks", file=sys.stderr)
        else:
            lines.append(f"\\ks {kd}")
    ts = f"{ps.beats} {ps.beat_type}"
    lines.append(f"\\ts {ts}" if args.bare_meta else f"\\ts ({ts})")
    lines.append("")

    prev_key = None
    for bi, bar in enumerate(bars):
        if bi in ps.time_changes:
            b, bt = ps.time_changes[bi]
            lines.append(f"\\ts {b} {bt}" if args.bare_meta else f"\\ts ({b} {bt})")
            prev_key = None
        if not bar:
            lines.append("|")
            continue
        chunk = []
        for beat in bar:
            chunk.append(render_beat(beat, prev_key, warnings, force_duration=not args.sticky))
            prev_key = beat.dur_key
        lines.append(" ".join(chunk) + " |")

    for w in warnings:
        print("  ⚠ " + w, file=sys.stderr)
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    """构造 CLI 解析器。

    ⚠️ 单独抽出来是为了让 `.agents/skills/uke-scoregen/scripts/scoregen.py`
    （简谱 → 谱面那个技能脚本）**复用同一套默认值**——
    它在进程内调本模块的 parse/build/render，需要一份现成的 `args`。
    若在那里手抄一份默认值，迟早会跟这里漂移（比如以后把 `--brush` 默认值改了）。

    `main()` 与 `scoregen.py` 都以这里为唯一真相源：
        args = build_arg_parser().parse_args([str(xml_path)])
    """
    ap = argparse.ArgumentParser(
        description="MusicXML → alphaTex（屿琴 songs/<id>/score.tex）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("input", help="输入 .musicxml / .xml")
    ap.add_argument("-o", "--output", help="输出 .tex（缺省写到 stdout）")
    ap.add_argument("--title", help="覆盖标题")
    ap.add_argument("--subtitle", help="副标题")
    ap.add_argument("--artist", help="覆盖作者")
    ap.add_argument("--album", help="专辑")
    ap.add_argument("--tempo", type=float, help="覆盖速度")
    ap.add_argument("--instrument", type=int, default=None,
                    help="写一行 `\\instrument <GM号>`（0 基）。缺省不写，交给站点统一补（src/lib/songTex.ts）")
    ap.add_argument("--tuning", help="强制定弦，如 `a4 e4 c4 g4`（缺省从 <staff-tuning> 读）")
    ap.add_argument("--tuning-mode", choices=["auto", "document", "spec"], default="auto")
    ap.add_argument("--fingering", choices=["fallback", "auto"], default="fallback",
                    help="fallback=保留文件里的 <string>/<fret>，只在缺失时推算（默认）；auto=全部按 <pitch> 重新指派")
    ap.add_argument("--max-fret", type=int, default=12)
    ap.add_argument("--brush", choices=["arpeggio", "brush"], default="arpeggio",
                    help="<arpeggiate> 映射成 {au}/{ad}（默认，忠实）还是 {bu}/{bd}（本项目手写谱的实扫弦习惯）")
    ap.add_argument("--sticky", action="store_true",
                    help="时值与上一拍相同时省略 `:N`（旧写法；缺省每拍都写，更显式、更抗错）")
    ap.add_argument("--key", action="store_true",
                    help="按 MusicXML 的 <key> 写一行 `\\ks`（缺省不写；本站既有谱面都没写）")
    ap.add_argument("--no-lyrics", action="store_true",
                    help="丢弃 <lyric>（缺省会把歌词转成 {lyrics \"…\"}；含歌词的声乐谱面会很占宽度）")
    ap.add_argument("--bare-meta", action="store_true",
                    help="元数据不加括号（旧写法，alphaTab 1.8.4 会出 P/301 警告）")
    ap.add_argument("--quiet", action="store_true", help="不打印诊断")
    return ap


def convert(ps: ParsedScore, args) -> tuple[str, list[int], list[list[Beat]], list[str]]:
    """解析好的 ParsedScore → (tex 文本, 定弦, 小节, 警告)。

    从 `run()` 里拆出来，方便调用方拿中间结果（比如只要小节气数、不要文本）。
    """
    tuning = resolve_tunings(ps, args.tuning_mode, args.tuning, quiet=args.quiet)
    if len(tuning) != 4 and not args.quiet:
        print(f"  ⚠ 定弦不是 4 根（{len(tuning)}），尤克里里谱面请确认是否写错", file=sys.stderr)
    bars, warnings = build_bars(ps, tuning, args)
    tex = render_tex(ps, tuning, bars, args)
    return tex, tuning, bars, warnings


def run(args) -> str:
    """按 args 跑完整条链路；写文件由调用方负责（`main` 或 `scoregen.py`）。"""
    ps = parse_musicxml(args.input)
    tex, tuning, bars, warnings = convert(ps, args)

    if not args.quiet:
        for w in ps.warnings + warnings:
            print("  ⚠ " + w, file=sys.stderr)
        print(
            f"· {len(ps.measures)} 小节 / {sum(len(b) for b in bars)} 拍 / 定弦 "
            + " ".join(midi_to_tex_tuning(m) for m in tuning),
            file=sys.stderr,
        )
    return tex


def main() -> None:
    args = build_arg_parser().parse_args()
    tex = run(args)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(tex)
        if not args.quiet:
            print(f"· 已写入 {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(tex)


if __name__ == "__main__":
    main()
