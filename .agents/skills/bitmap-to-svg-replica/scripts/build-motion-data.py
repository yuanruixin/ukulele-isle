#!/usr/bin/env python3
"""
描摹 SVG → 可动画的骨架：给部件打语义标注 + 把所有角色归一化到同一舞台坐标系。

输入：一张张**已描摹**的 SVG（trace-image.py 的产物）+ 一份 rig 配置（语义部件表）。
输出：
  ① <svg 目录>/<id>.svg   归一化到统一舞台坐标系的骨架 —— **这就是要维护的那份产物**：
                          一个姿态一个文件，可读、可 diff、可直接用浏览器打开；几何一字未动
  ② <out 目录>/<id>.svg   同一份骨架，但保留**原始** viewBox（排查用的中间稿，可以不要）
  ③ 数据模块（TS / 可选 JS / 可选 JSON）—— **只留元数据**：姿态顺序、舞台画幅、各语义部件
                          的 data-p 列表。SVG 本体不内嵌，正文在 ① 那些文件里。

为什么把骨架落成 SVG 文件、而不是塞进数据模块的一个字符串字段：
  · 塞进去之后读不了、diff 不了、手改不了，一切都得回头改脚本；
  · 部件枢轴会**两处各存一份**（数据里一份、SVG 的 data-px/data-py 一份），迟早对不上。
    现在枢轴只写在 SVG 属性上（消费侧的引擎本来就是从那儿读的）——一处真相。

不做的事：不推导几何、不动任何坐标、不写 CSS。运动参数在消费侧的引擎里。

用法:
  # ① 正常：从描摹稿生成
  python3 build-motion-data.py --rig rig.json [--traced DIR] [--out DIR] [--svg DIR]

  # ② 迁移：把**旧格式**的生成物（SVG 内嵌在数据里）换成新布局
  python3 build-motion-data.py --rig rig.json --migrate <旧数据模块>.ts

rig.json 是**每个角色组一份**的配置（字段说明见同目录 rig.example.json）。
里面的相对路径 —— 以及命令行里路径类的参数 —— 都**以 rig.json 所在目录为基准**解析，
所以整包挪位置也不会断；命令行给的同名参数覆盖 rig.json 里的值。
"""

import argparse
import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

spec = importlib.util.spec_from_file_location("rp", os.path.join(HERE, "rig-parts.py"))
rp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rp)


def resolve(path, base):
    """相对路径按 base 解析（配置里的路径都是文件相对的，不是 cwd 相对的）。"""
    if path is None:
        return None
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(base, path))


def load_rig(path, need_parts=True):
    with open(path, encoding="utf-8") as f:
        rig = json.load(f)
    if "order" not in rig:
        raise SystemExit(f"{path}: 缺少必填字段 `order`")
    if need_parts:
        if "parts" not in rig:
            raise SystemExit(f"{path}: 缺少必填字段 `parts`")
        for cid in rig["order"]:
            if cid not in rig["parts"]:
                raise SystemExit(f"{path}: parts 里没有 `{cid}`（order 里列了它）")
    return rig


def load_legacy(path):
    """从**旧格式的生成物**里把数据对象抠出来。

    旧格式有两种载体（本脚本自己产出的 `--js` 经典脚本、`--ts` ES 模块）外加裸 JSON，
    它们都是「一段 {order,vbStage,vbThumb,targetBodyH,data} 的 JSON + 前后各一行样板」。
    所以做法是：从每个 `{` 起用 json 的 raw_decode 试一次，第一个能解出目标形状的就是它 ——
    比对花括号、不依赖前后缀长什么样。
    """
    with open(path, encoding="utf-8") as f:
        text = f.read()
    dec = json.JSONDecoder()
    for m in re.finditer(r"\{", text):
        try:
            obj, _ = dec.raw_decode(text, m.start())
        except ValueError:
            continue
        if isinstance(obj, dict) and "data" in obj and ("order" in obj or "vbStage" in obj):
            return obj
    raise SystemExit(
        f"{path}: 没找到数据对象。`--migrate` 要的是**旧格式**的生成物"
        "（形如 {order,vbStage,vbThumb,targetBodyH,data:{<姿态>:{…,markup}}} 的 JSON，"
        "扒在 window.X = … / export const X = … 里也行）。")


def layer_bbox(report, layer=0):
    xs, ys = [], []
    for e in report[layer]["parts"]:
        xs += [e["bbox"][0], e["bbox"][2]]
        ys += [e["bbox"][1], e["bbox"][3]]
    return min(xs), min(ys), max(xs), max(ys)


def stage_svg(annotated, norm_t, vb_stage):
    """骨架（保留原 viewBox）→ 舞台版：只多一层 <g.norm> 把原始坐标映射到舞台坐标。

    几何一字未动 —— 换掉的是取景框（viewBox）与宽高属性，路径数据原样。
    """
    s = re.sub(r'(<svg[^>]*?>)', r'\1<g class="norm" transform="' + norm_t + '">',
               annotated, count=1)
    s = s.replace("</svg>", "</g></svg>")
    s = re.sub(r'viewBox="[^"]*"', f'viewBox="{vb_stage}"', s)
    # 原图自带的 width/height 与舞台画幅比例不同，留着会让「宽 100% + 高 auto」的用法差几个百分点
    s = re.sub(r'\swidth="\d+"\s+height="\d+"', "", s)
    s = re.sub(r"<svg", '<svg preserveAspectRatio="xMidYMid meet"', s, count=1)
    return s


def write_outputs(spec_, order, vb_stage, vb_thumb, target_body_h, svg_dir, out_dir,
                  js_name, json_name, ts_path, ts_types, ts_names, ts_data_type,
                  global_name, stamp):
    """把 SVG 文件与数据模块写出去（正常模式与迁移模式共用这一条出口）。"""
    ts_pose, ts_order, ts_data = ts_names[:3]
    os.makedirs(svg_dir, exist_ok=True)

    # ---- ① 骨架 SVG：一个姿态一个文件（要维护的就是这些）
    for cid in order:
        p = os.path.join(svg_dir, f"{cid}.svg")
        with open(p, "w", encoding="utf-8") as f:
            f.write(spec_[cid]["svg"])
        print(f"→ {p}  ({os.path.getsize(p) / 1024:.1f} KB)")

    # ---- 数据：只留引擎要用的标量。SVG 名字由 `order` 派生：<svg 目录>/<id>.svg
    data = {}
    for cid in order:
        s = spec_[cid]
        data[cid] = dict(label=s["label"], bodyH=s["bodyH"], bodyW=s["bodyW"],
                         scale=s["scale"], parts=s["parts"])
    payload = dict(order=order, vbStage=vb_stage, vbThumb=vb_thumb,
                   targetBodyH=target_body_h, data=data)
    # 缩进展开：这份文件也**给人看**的（一个部件增删、一个标量变化都该是干净的一行 diff）
    body = json.dumps(payload, ensure_ascii=False, indent=2)

    # ---- ② JS：经典 script，挂 window.<global>（不经打包器、file:// 直接打开也能用）
    if js_name:
        js = [stamp.rstrip("\n"),
              "// 只含元数据；骨架是同级的 <id>.svg 文件（一个姿态一个）。",
              f"window.{global_name} = " + body + ";"]
        js_file = os.path.join(out_dir, js_name)
        os.makedirs(out_dir, exist_ok=True)
        with open(js_file, "w", encoding="utf-8") as f:
            f.write("\n".join(js) + "\n")
        print(f"→ {js_file}  ({os.path.getsize(js_file) / 1024:.0f} KB)")

    # ---- ③ 裸 JSON（可选）
    if json_name:
        json_file = os.path.join(out_dir, json_name)
        os.makedirs(out_dir, exist_ok=True)
        with open(json_file, "w", encoding="utf-8") as f:
            f.write(body + "\n")
        print(f"→ {json_file}  ({os.path.getsize(json_file) / 1024:.0f} KB)")

    # ---- ④ ES 模块 + 类型（可选）
    if ts_path:
        ts_dir = os.path.dirname(ts_path)
        svg_rel = os.path.relpath(svg_dir, ts_dir)
        ts_id = " | ".join(f'"{c}"' for c in order)
        data_annot = f": {ts_data_type}" if ts_types else ""
        tsv = [stamp.rstrip("\n"),
               f"// 骨架 SVG 是**独立文件**（一个姿态一个）：`{svg_rel}/<id>.svg` —— 可读、可 diff、",
               "// 可用浏览器直接打开。本文件只留引擎要用的标量。",
               "// 部件枢轴不在这儿重复一份：它写在各自 SVG 的 data-px / data-py 上（引擎从那儿读）。"]
        if ts_types:
            tsv.append(f'import type {{ {ts_data_type} }} from "{ts_types}";')
        tsv += ["",
                "/** 姿态 id（= rig 配置里的 order）：所有姿态相关的 props 都用它，写错编译期就报 */",
                f"export type {ts_pose} = {ts_id};",
                "",
                "/** 姿态顺序 = 页面里的排列顺序 */",
                f"export const {ts_order}: {ts_pose}[] = {json.dumps(order)};",
                "",
                "/** 骨架元数据：几何在 SVG 文件里，勿手改（改几何请改描摹稿后重跑生成器） */",
                f"export const {ts_data}{data_annot} = {body};"]
        os.makedirs(ts_dir, exist_ok=True)
        with open(ts_path, "w", encoding="utf-8") as f:
            f.write("\n".join(tsv) + "\n")
        print(f"→ {ts_path}  ({os.path.getsize(ts_path) / 1024:.0f} KB)")


def main():
    ap = argparse.ArgumentParser(description="描摹稿 → 动画骨架（SVG 文件 + 元数据）")
    ap.add_argument("--rig", required=True, help="rig 配置 json（语义部件表，见 rig.example.json）")
    ap.add_argument("--migrate", default=None,
                    help="旧格式生成物的路径：把内嵌的 SVG 外置成文件、数据换成新布局（不读描摹稿）")
    ap.add_argument("--traced", default=None, help="描摹 SVG 目录（覆盖 rig 里的 traced）")
    ap.add_argument("--out", default=None, help="输出目录（覆盖 rig 里的 out）")
    ap.add_argument("--svg", default=None,
                    help="骨架 SVG 的落地目录（覆盖 rig 里的 svg，默认 svg）")
    ap.add_argument("--global", dest="global_name", default=None,
                    help="JS 版本挂到 window 上的名字（默认 CHARACTERS）")
    ap.add_argument("--js", default=None,
                    help="经典 script 版本的文件名 —— **默认不产出**；要就给个名字（如 data.js）")
    ap.add_argument("--json", dest="json_name", default=None,
                    help="额外再存一份裸 JSON（给这个文件名，如 data.json）")
    ap.add_argument("--ts", default=None, help="ES 模块输出路径（覆盖 rig 里的 ts）")
    ap.add_argument("--ts-types", default=None,
                    help="类型模块 specifier，**原样写进 import 行**（所以要相对 ts 输出文件写，"
                         "不是相对 rig.json）；给了才写 import type 行")
    ap.add_argument("--ts-names", default=None,
                    help="逗号分隔：姿态id联合类型名,顺序常量名,数据常量名（默认 PoseId,ORDER,DATA）")
    ap.add_argument("--ts-data-type", default=None, help="数据常量的类型名（默认 MotionData）")
    args = ap.parse_args()

    rig_path = os.path.abspath(args.rig)
    base = os.path.dirname(rig_path)
    migrate_path = resolve(args.migrate, base)
    rig = load_rig(rig_path, need_parts=migrate_path is None)

    STAGE = dict(rig.get("stage") or {})
    TARGET_BODY_H = float(rig.get("targetBodyH", 190.0))
    STAGE_PAD_X = float(STAGE.get("padX", 16.0))
    STAGE_HEADROOM = float(STAGE.get("headroom", 92.0))
    THUMB_PAD_Y = float(STAGE.get("thumbPadY", 8.0))
    THUMB_PAD_TOP = float(STAGE.get("thumbPadTop", 52.0))

    OUT = resolve(args.out or rig.get("out", "out"), base)
    SVG_DIR = resolve(args.svg or rig.get("svg", "svg"), base)
    global_name = args.global_name or rig.get("global", "CHARACTERS")
    js_name = args.js or rig.get("js")
    json_name = args.json_name or rig.get("json")
    ts_path = resolve(args.ts or rig.get("ts"), base)
    ts_types = args.ts_types or rig.get("tsTypes")
    ts_names = (args.ts_names or rig.get("tsNames") or "PoseId,ORDER,DATA").split(",")
    ts_names = [n.strip() for n in ts_names] + ["", "", ""]
    ts_pose, ts_order, ts_data = ts_names[:3]
    ts_data_type = args.ts_data_type or rig.get("tsDataType", "MotionData")

    src_note = f"按 {os.path.basename(rig_path)} 产出"
    if migrate_path:
        src_note += f"（数据从旧格式 {os.path.basename(migrate_path)} 迁移而来）"
    stamp = f"// 生成物，勿手改：由 bitmap-to-svg-replica 技能的 build-motion-data.py {src_note}。\n"

    spec_ = {}

    # ══════════════════════════ ① 迁移模式 ══════════════════════════
    if migrate_path:
        legacy = load_legacy(migrate_path)
        order = list(legacy.get("order") or rig["order"])
        if order != list(rig["order"]):
            print(f"⚠️  {os.path.basename(migrate_path)} 里的 order {order} 与 rig 的 "
                  f"{list(rig['order'])} 不一致 —— 以文件里的为准。", file=sys.stderr)
        vb_stage = legacy["vbStage"]
        vb_thumb = legacy["vbThumb"]
        target_body_h = float(legacy.get("targetBodyH", TARGET_BODY_H))
        LABEL = dict(rig.get("labels") or {})
        for cid in order:
            d = legacy["data"][cid]
            mk = d.get("markup")
            if not mk:
                raise SystemExit(
                    f"{migrate_path}: `{cid}` 里没有 markup —— 这份看起来**已经是新格式**了，"
                    "不需要迁移（直接当数据模块用即可）。")
            spec_[cid] = dict(
                label=d.get("label", LABEL.get(cid, cid)),
                bodyH=d["bodyH"], bodyW=d["bodyW"], scale=d["scale"],
                # 旧格式的部件表是「带 px/py/bbox 的对象数组」，新格式只要 data-p 列表：
                # 那些数字本来就在 SVG 的 data-px/data-py 上，且引擎读的是 SVG 那份。
                parts={n: [e["p"] for e in arr] for n, arr in d["parts"].items()},
                svg=mk)
            print(f"{cid:8s} 身体高 {d['bodyH']:6.1f}  舞台身宽 {d['bodyW']:6.1f}  倍率 {d['scale']:.4f}"
                  f"  部件 {[(k, len(v)) for k, v in spec_[cid]['parts'].items()]}")
        print(f"\n（迁移模式：不读描摹稿，也不产 `{os.path.relpath(OUT, base)}/` 里的原始 viewBox 中间稿。"
              f"舞台 viewBox {vb_stage}）")
        write_outputs(spec_, order, vb_stage, vb_thumb, target_body_h, SVG_DIR, OUT,
                      js_name, json_name, ts_path, ts_types, ts_names, ts_data_type,
                      global_name, stamp)
        return

    # ══════════════════════════ ② 正常模式 ══════════════════════════
    ORDER = list(rig["order"])
    LABEL = dict(rig.get("labels") or {})
    RIG = rig["parts"]
    traced = resolve(args.traced or rig.get("traced", "traced"), base)
    os.makedirs(OUT, exist_ok=True)

    stage, built = [], {}
    for cid in ORDER:
        src = os.path.join(traced, f"{cid}.svg")
        if not os.path.isfile(src):
            raise SystemExit(f"找不到 {src} —— 先用 trace-image.py 描摹出每个角色")
        with open(src, encoding="utf-8") as f:
            raw = f.read()
        m = re.search(r'viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"', raw)
        if not m:
            raise SystemExit(f"{src}: 没有可解析的 viewBox")
        out, report = rp.build(raw)

        # ---- 归一化：以 base 层（身体剪影）为准
        # 几何一律不动：改用一层 <g class="norm"> 把原始坐标映射到舞台坐标
        #   x_stage = (x - body_cx) * s ,  y_stage = (y - body_bottom) * s
        bx0, by0, bx1, by1 = layer_bbox(report, 0)
        body_h = by1 - by0
        body_cx = (bx0 + bx1) / 2
        s = TARGET_BODY_H / body_h
        norm_t = f"translate({(-body_cx * s):.4f} {(-by1 * s):.4f}) scale({s:.6f})"

        def sx(x, _cx=body_cx, _s=s):  # viewBox x → 舞台 x（原点 = 身体中线）
            return (x - _cx) * _s

        def sy(y, _b=by1, _s=s):  # viewBox y → 舞台 y（原点 = 身体底边，向上为负）
            return (y - _b) * _s

        # ---- 部件元信息
        # 枢轴/中心用**原始坐标**：部件变换写在 norm 组**里面**，所以必须用原始单位；
        # 幅度仍按「身体高的比例」给（消费侧用该角色自己的 bodyH 换算）⇒ 视觉上一致。
        meta = {e["p"]: e for L in report for e in L["parts"]}
        parts = {}
        for name, spec_p in RIG[cid].items():
            items = []
            if spec_p["scope"] == "group":
                xs0 = min(meta[p]["bbox"][0] for p in spec_p["parts"])
                xs1 = max(meta[p]["bbox"][2] for p in spec_p["parts"])
                ys0 = min(meta[p]["bbox"][1] for p in spec_p["parts"])
                ys1 = max(meta[p]["bbox"][3] for p in spec_p["parts"])
                gcx = (xs0 + xs1) / 2
                gcy = {"center": (ys0 + ys1) / 2, "top": ys0, "bottom": ys1}[spec_p["anchor"]]
                for p in spec_p["parts"]:
                    e = meta[p]
                    items.append(dict(p=p, px=gcx, py=gcy,
                                      cx=(e["bbox"][0] + e["bbox"][2]) / 2,
                                      cy=(e["bbox"][1] + e["bbox"][3]) / 2,
                                      w=e["w"], h=e["h"], bbox=e["bbox"]))
            else:
                for p in spec_p["parts"]:
                    e = meta[p]
                    x0, y0, x1, y1 = e["bbox"]
                    items.append(dict(p=p, px=(x0 + x1) / 2,
                                      py={"center": (y0 + y1) / 2, "top": y0, "bottom": y1}[spec_p["anchor"]],
                                      cx=(x0 + x1) / 2, cy=(y0 + y1) / 2,
                                      w=x1 - x0, h=y1 - y0, bbox=[x0, y0, x1, y1]))
            parts[name] = items

        # ---- 舞台包围盒（所有角色取并集 ⇒ 同一 viewBox ⇒ 同一比例、同一落点）
        xs, ys = [0.0], [0.0]
        for L in report:
            for e in L["parts"]:
                xs += [sx(e["bbox"][0]), sx(e["bbox"][2])]
                ys += [sy(e["bbox"][1]), sy(e["bbox"][3])]
        stage.append((min(xs), min(ys), max(xs), max(ys)))

        # ---- 标注 data-part（语义名:组内序号）与几何（枢轴/中心），消费侧只读属性不做推导
        annotated = re.sub(
            r'<path data-p="([^"]+)"',
            lambda mm: f'<path data-p="{mm.group(1)}"' + "".join(
                f' data-part="{n}:{i}"' for n, its in parts.items()
                for i, e in enumerate(its) if e["p"] == mm.group(1)),
            out)

        pmeta = {e["p"]: e for its in parts.values() for e in its}

        def with_meta(mm):
            e = pmeta.get(mm.group(1))
            if not e:
                return mm.group(0)
            return (f'<path data-p="{mm.group(1)}" data-px="{e["px"]:.2f}" data-py="{e["py"]:.2f}"'
                    f' data-cx="{e["cx"]:.2f}" data-cy="{e["cy"]:.2f}"')
        annotated = re.sub(r'<path data-p="([^"]+)"', with_meta, annotated)

        # <out>/<id>.svg = 保留原 viewBox 的骨架（排查用；站点读的是下面那份舞台版）
        with open(os.path.join(OUT, f"{cid}.svg"), "w", encoding="utf-8") as f:
            f.write(annotated)

        built[cid] = dict(annotated=annotated, norm_t=norm_t, bodyH=body_h,
                          bodyW=(bx1 - bx0) * s, scale=s,
                          parts={n: [e["p"] for e in its] for n, its in parts.items()})
        print(f"{cid:8s} 身体 {body_h:6.1f}→{TARGET_BODY_H} 倍率 {s:.4f}  舞台身宽 {(bx1 - bx0) * s:6.1f}"
              f"  归一化 {norm_t}  部件 {[(k, len(v)) for k, v in built[cid]['parts'].items()]}")

    # ---- 统一舞台 / 缩略图 viewBox
    x0 = min(b[0] for b in stage) - STAGE_PAD_X
    x1 = max(b[2] for b in stage) + STAGE_PAD_X
    y1 = max(b[3] for b in stage) + THUMB_PAD_Y
    y0 = min(b[1] for b in stage) - STAGE_HEADROOM
    vb_stage = f"{x0:.1f} {y0:.1f} {x1 - x0:.1f} {y1 - y0:.1f}"
    ty0 = min(b[1] for b in stage) - THUMB_PAD_TOP
    vb_thumb = f"{x0:.1f} {ty0:.1f} {x1 - x0:.1f} {y1 - ty0:.1f}"
    print(f"\n舞台 viewBox {vb_stage}   缩略图 viewBox {vb_thumb}")

    for cid in ORDER:
        b = built[cid]
        spec_[cid] = dict(label=LABEL.get(cid, cid), bodyH=b["bodyH"],
                          bodyW=b["bodyW"], scale=b["scale"], parts=b["parts"],
                          svg=stage_svg(b["annotated"], b["norm_t"], vb_stage))
    print()

    write_outputs(spec_, ORDER, vb_stage, vb_thumb, TARGET_BODY_H, SVG_DIR, OUT,
                  js_name, json_name, ts_path, ts_types, ts_names, ts_data_type,
                  global_name, stamp)


if __name__ == "__main__":
    main()
