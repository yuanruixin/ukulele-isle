#!/usr/bin/env python3
"""
把 trace-image.py 描摹出的 SVG 拆成「可独立驱动的部件」（rig），用于做动画。

描摹器的输出约定是「一个色层 = 一条 <path>，一个 d 里的多个子路径按偶奇填充」。
直接按子路径拆开有个致命坑：**嵌套在里面的子路径是孔洞**，拆成独立 <path> 后
孔洞会被填实（猫耳朵中间那块白、线稿闭环的内圈都会变黑）——
本脚本因此用射线法算出每个子路径的嵌套深度：偶数深度 = 实心件，奇数深度 = 孔洞，
孔洞自动跟随紧邻的父件。几何**逐字节保留**（只重新分组，不重画、不抽稀）。

用法:
  python3 rig-parts.py <in.svg> <out.svg> [--json 报告.json]

输出:
  <out.svg>   每个部件一个 <path data-p="L<层号>C<件号>">，保留原层序与填充色
  stdout      部件清单（层号/件号/包围盒/面积/子路径数/是否孔洞父件），供人工识别
"""

import json
import re
import sys

# ---------------------------------------------------------------- 路径解析

NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]")


def split_subpaths(d):
    """只在 'M'/'m' 处切子路径（其余命令字母是段内命令，不是边界），片段原样保留。"""
    marks = [m.start() for m in TOKEN.finditer(d) if m.group() in "Mm"]
    if not marks:
        return []
    if marks[0] != 0:
        marks = [0] + marks
    subs = []
    for i, s in enumerate(marks):
        e = marks[i + 1] if i + 1 < len(marks) else len(d)
        subs.append(d[s:e].strip())
    return [s for s in subs if len(s) > 1]


def _pt_on_cubic(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    )


def flatten(seg, steps=12):
    """把子路径采样成折线点集（只用于几何判定，不写回文件）。"""
    cmds = [(m.group(), m.start()) for m in TOKEN.finditer(seg)]
    pts = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    for ci, (c, _) in enumerate(cmds):
        end = cmds[ci + 1][1] if ci + 1 < len(cmds) else len(seg)
        chunk = [float(x) for x in NUM.findall(seg[cmds[ci][1]:end])]
        if c in "Mm":
            if ci > 0:
                pts.append(cur)
            cur = (chunk[0], chunk[1])
            start = cur
        elif c in "Ll":
            rel = c == "l"
            for j in range(0, len(chunk) - 1, 2):
                p = (chunk[j] + cur[0], chunk[j + 1] + cur[1]) if rel else (chunk[j], chunk[j + 1])
                pts.append(cur)
                cur = p
        elif c in "Hh":
            rel = c == "h"
            for v in chunk:
                x = cur[0] + v if rel else v
                pts.append(cur)
                cur = (x, cur[1])
        elif c in "Vv":
            rel = c == "v"
            for v in chunk:
                y = cur[1] + v if rel else v
                pts.append(cur)
                cur = (cur[0], y)
        elif c in "Cc":
            rel = c == "c"
            for j in range(0, len(chunk) - 5, 6):
                raw = chunk[j:j + 6]
                if rel:
                    a = (cur[0] + raw[0], cur[1] + raw[1])
                    b = (cur[0] + raw[2], cur[1] + raw[3])
                    p3 = (cur[0] + raw[4], cur[1] + raw[5])
                else:
                    a, b, p3 = (raw[0], raw[1]), (raw[2], raw[3]), (raw[4], raw[5])
                for s in range(1, steps + 1):
                    pts.append(_pt_on_cubic(cur, a, b, p3, s / steps))
                cur = p3
        elif c in "Zz":
            pts.append(cur)
            cur = start
    pts.append(cur)
    return pts


def area(pts):
    a = 0.0
    for i in range(len(pts) - 1):
        a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(a) / 2


def bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def inside(pt, poly):
    """射线法：点是否在多边形内（子路径互不相交，取顶点判定足够稳）。"""
    x, y = pt
    hit = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xin:
                hit = not hit
    return hit


# ---------------------------------------------------------------- 主流程


def build(raw):
    """把一份描摹 SVG 拆成部件。返回 (输出 svg 文本, 部件报告)。"""
    head = re.match(r"(.*?)(<path)", raw, re.S).group(1)
    paths = re.findall(r'<path([^>]*?)d="([^"]+)"', raw, re.S)

    layers, report = [], []
    for li, (attrs, d) in enumerate(paths):
        col = re.search(r'data-c="([^"]*)"', attrs).group(1)
        role = re.search(r'data-role="([^"]*)"', attrs).group(1)
        subs = split_subpaths(d)
        polys = [flatten(s) for s in subs]
        boxes = [bbox(p) for p in polys]

        # 嵌套深度：数有多少个其他子路径把它包住
        depth = []
        for i in range(len(subs)):
            probe = polys[i][len(polys[i]) // 3]
            depth.append(sum(1 for j in range(len(subs)) if j != i and inside(probe, polys[j])))

        # 偶数深度 = 实心件；奇数深度 = 孔洞，挂到最近的父件（深度小 1 且包住它）
        comps = []
        for i, dep in enumerate(depth):
            if dep % 2 == 0:
                comps.append({"d": [subs[i]], "polys": [polys[i]], "depth": dep})
        for i, dep in enumerate(depth):
            if dep % 2 == 0:
                continue
            probe = polys[i][len(polys[i]) // 3]
            cands = [
                (c, k) for k, c in enumerate(comps)
                if c["depth"] == dep - 1 and inside(probe, c["polys"][0])
            ]
            if cands:
                cands[0][0]["d"].append(subs[i])
                cands[0][0]["polys"].append(polys[i])
            else:  # 兜底：单独成件（不该发生，发生要在报告里看见）
                comps.append({"d": [subs[i]], "polys": [polys[i]], "depth": dep})

        entries = []
        for ci, c in enumerate(comps):
            x0, y0, x1, y1 = bbox(c["polys"][0])
            entries.append({
                "p": f"L{li}C{ci}", "layer": li, "desc": f"{role}/{col}", "subs": len(c["d"]),
                "bbox": [round(v, 1) for v in (x0, y0, x1, y1)],
                "w": round(x1 - x0, 1), "h": round(y1 - y0, 1),
                "area": round(area(c["polys"][0])), "depth": c["depth"],
            })
        report.append({"layer": li, "role": role, "col": col, "parts": entries})

        body = "".join(
            f'\n    <path data-p="L{li}C{ci}" d="{"".join(c["d"])}"/>'
            for ci, c in enumerate(comps)
        )
        layers.append(
            f'\n  <g data-layer="{li}" data-role="{role}" data-col="{col}"'
            f' fill="{col}" fill-rule="evenodd" data-c="{col}">{body}\n  </g>'
        )

    return head + "".join(layers) + "\n</svg>\n", report


def main():
    src, dst = sys.argv[1], sys.argv[2]
    report_path = None
    if "--json" in sys.argv:
        report_path = sys.argv[sys.argv.index("--json") + 1]

    out, report = build(open(src).read())
    open(dst, "w").write(out)

    if report_path:
        json.dump(report, open(report_path, "w"), ensure_ascii=False, indent=1)
    for L in report:
        print(f"层{L['layer']} {L['role']} {L['col']}  {len(L['parts'])} 件")
        for e in L["parts"]:
            print(f"   {e['p']:8s} {e['w']:6.1f}x{e['h']:5.1f} @({e['bbox'][0]:6.1f},{e['bbox'][1]:6.1f}) "
                  f"面积{e['area']:7d} 子{e['subs']} 深{e['depth']}")
    print(f"\n→ {dst}")


if __name__ == "__main__":
    main()
