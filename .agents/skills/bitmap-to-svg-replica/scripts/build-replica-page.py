#!/usr/bin/env python3
"""
复刻验收页：原图 / 复刻(浅底) / 复刻(深色主题) 三列并排 + 底部两组「舞台底座」。

用法:
  python3 build-replica-page.py [--in 原图目录] [--traced 描摹SVG目录] [-o 输出.html]

默认 --in ./in、--traced ./out，页面写到 <traced>/replica.html。

配对规则：描摹目录里的每个 <name>.svg，去原图目录找同名原图
（先找 orig-<name>.<ext>，再找 <name>.<ext>；png/jpg/jpeg/webp 都认）。
找不到就只出两列复刻，并在原图那一格标出来。
原图就放在描摹目录旁边（即命中的是产出物本身）时直接复用，不会二次裁切。

深色那列靠 JS 现场改 fill（读 data-c / data-role）：
  base 层 → 深色底；其余层 → 保色相、按 L' = 0.16 + (1-L)*0.72 翻转明度。
这是「同一份 SVG 也能进深色主题」的演示；正式接入时改成站点侧的固定映射表。
"""

import argparse
import importlib.util
import os
import re

import numpy as np
from PIL import Image

# 描摹器找自己旁边那个：脚本被软链到别处也能工作（abspath 不解析软链，正好）
HERE = os.path.dirname(os.path.abspath(__file__))
TRACER = os.path.join(HERE, "trace-image.py")

IMG_EXT = ("png", "jpg", "jpeg", "webp", "bmp", "gif")
PAD = 6
BG_THR = 240


def find_original(indir, stem):
    """按 orig-<stem> 优先、<stem> 兜底的顺序找原图，返回路径或 None。"""
    for prefix in ("orig-", ""):
        for ext in IMG_EXT:
            p = os.path.join(indir, f"{prefix}{stem}.{ext}")
            if os.path.isfile(p):
                return p
    return None


def crop_original(src, dst, scale=1):
    """按与描摹完全相同的口径裁出内容包围盒，作为对照用的原图。"""
    spec = importlib.util.spec_from_file_location("ti", TRACER)
    ti = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ti)

    rgb, w, h = ti.load_rgb(src, 0.0, scale)
    cm = ti.content_mask(rgb, BG_THR)
    ys, xs = np.nonzero(cm)
    pad = PAD * scale
    box = (
        max(0, xs.min() - pad),
        max(0, ys.min() - pad),
        min(w - 1, xs.max() + pad) + 1,
        min(h - 1, ys.max() + pad) + 1,
    )
    im = Image.open(src).convert("RGB")
    if im.size != (w, h):
        im = im.resize((w, h))
    im = im.crop(box)
    if scale > 1:
        im = im.resize((im.width // scale, im.height // scale), Image.LANCZOS)
    im.save(dst, "PNG")
    return im.size


def inline(path):
    """把 SVG 变成可内联的片段：宽度撑满容器，去掉 XML 声明。"""
    s = open(path).read().replace("<?xml", "").strip()
    s = re.sub(r'\swidth="\d+"', ' width="100%"', s, count=1)
    s = re.sub(r'\sheight="\d+"', ' height="100%"', s, count=1)
    return s


def main():
    ap = argparse.ArgumentParser(description="描摹复刻的三列对照验收页")
    ap.add_argument("--in", dest="indir", default="./in",
                    help="原图目录（默认 ./in）")
    ap.add_argument("--traced", dest="tdir", default="./out",
                    help="描摹 SVG 目录（默认 ./out）")
    ap.add_argument("-o", "--out", default=None, help="输出 html（默认 <traced>/replica.html）")
    ap.add_argument("--title", default="位图 → SVG 复刻 · 验收")
    ap.add_argument("--dark", default="#1b1d21", help="深色主题底色（默认 #1b1d21）")
    args = ap.parse_args()

    out = args.out or os.path.join(args.tdir, "replica.html")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    os.makedirs(args.tdir, exist_ok=True)

    names = sorted(
        os.path.splitext(f)[0] for f in os.listdir(args.tdir) if f.endswith(".svg")
    )
    if not names:
        raise SystemExit(f"{args.tdir} 里没有 .svg —— 先跑 trace-image.py / trace-batch 生成描摹稿")

    rows, stage_l, stage_d = [], [], []
    missing = []
    for name in names:
        spath = os.path.join(args.tdir, f"{name}.svg")
        raw = open(spath).read()
        m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', raw)
        vw, vh = (int(float(v)) for v in m.groups()) if m else ("?", "?")
        svg = inline(spath)
        kb = os.path.getsize(spath) / 1024

        orig = find_original(args.indir, name)
        dst = os.path.join(args.tdir, f"orig-{name}.png")
        if orig and os.path.abspath(orig) == os.path.abspath(dst):
            # 命中的就是我们自己产出的那张对齐图（原图就放在描摹目录旁边）
            # ⇒ 直接复用，**别再裁一次**，二次裁切会越裁越小
            size = Image.open(dst).size
        elif orig:
            size = crop_original(orig, dst)
        else:
            size = None

        if size:
            orig_cell = (f'<figure class="cell"><div class="frame light">'
                         f'<img src="orig-{name}.png"></div>'
                         f'<figcaption>原图 {size[0]}×{size[1]}</figcaption></figure>')
        else:
            missing.append(name)
            orig_cell = ('<figure class="cell"><div class="frame light empty">'
                         '原图未找到</div><figcaption>—</figcaption></figure>')

        rows.append(f"""<section class="row">
  <div class="meta"><b>{name}</b><span>{name}.svg</span><span>{vw}×{vh}</span><span class="kb">{kb:.1f} KB</span></div>
  {orig_cell}
  <figure class="cell"><div class="frame light">{svg}</div><figcaption>复刻 · 浅底</figcaption></figure>
  <figure class="cell"><div class="frame dark">{svg}</div><figcaption>复刻 · 深色主题</figcaption></figure>
</section>""")
        stage_l.append(f'<div class="slot">{svg}</div>')
        stage_d.append(f'<div class="slot dark">{svg}</div>')

    note = ""
    if missing:
        note = (f'<div class="sub">没找到原图：{", ".join(missing)}'
                f'（放进 <code>{args.indir}/</code>，命名成 <code>&lt;名字&gt;.png</code> '
                f'或 <code>orig-&lt;名字&gt;.png</code> 即可）</div>')

    html = f"""<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>{args.title}</title>
<style>
 :root{{--bg:#f4f5f7;--ink:#111;--ink2:#6b7280;--dark:{args.dark}}}
 *{{box-sizing:border-box}}
 body{{margin:0;padding:28px 26px 64px;background:var(--bg);color:var(--ink);
      font:14px/1.6 -apple-system,"PingFang SC","Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased}}
 h1{{font-size:19px;margin:0 0 5px}}
 .sub{{color:var(--ink2);font-size:12.5px;margin-bottom:22px;max-width:760px}}
 code{{font-size:12px;background:#e8eaee;border-radius:4px;padding:1px 4px}}
 .row{{display:grid;grid-template-columns:118px repeat(3,1fr);gap:14px;align-items:start;margin-bottom:16px}}
 .meta{{display:flex;flex-direction:column;gap:1px;padding-top:13px;font-size:11.5px;color:var(--ink2)}}
 .meta b{{font-size:15px;color:var(--ink);font-weight:600;margin-bottom:3px}}
 .meta .kb{{color:#9599a1}}
 figure{{margin:0;display:flex;flex-direction:column;gap:7px}}
 figcaption{{font-size:11px;color:var(--ink2);text-align:center}}
 .frame{{border-radius:16px;display:flex;align-items:center;justify-content:center;padding:14px;
        min-height:158px;box-shadow:0 1px 2px rgba(16,24,40,.06),0 6px 20px -8px rgba(16,24,40,.18)}}
 .frame.light{{background:#fff}} .frame.dark{{background:var(--dark)}}
 .frame.empty{{color:#b6bac2;font-size:12px}}
 .frame img{{display:block;width:100%;height:auto;max-height:252px;object-fit:contain}}
 .frame svg{{display:block;width:100%;height:auto;max-height:252px}}
 .stage{{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:16px}}
 .stagewrap{{border-radius:20px;padding:22px 18px;
   box-shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px -10px rgba(16,24,40,.2)}}
 .stagewrap.l{{background:#fff}} .stagewrap.d{{background:var(--dark)}}
 .stagewrap h3{{margin:0 0 14px;font-size:12.5px;font-weight:600;color:#6b7280;letter-spacing:.4px}}
 .stagewrap.d h3{{color:#8b9099}}
 .slots{{display:grid;grid-template-columns:repeat({len(names)},1fr);gap:10px}}
 .slot{{background:#fafafa;border-radius:14px;aspect-ratio:1/1;display:flex;align-items:center;
       justify-content:center;padding:10px}}
 .slot.dark{{background:#26282d}}
 .slot svg{{width:100%;height:auto;max-height:100%}}
</style>
<h1>{args.title}</h1>
<div class="sub">左＝原图；中＝按原图逐像素描摹出的 SVG；右＝同一份 SVG 在深色主题下自动换色。
几何、笔触抖动、配色全部取自原图 —— 这一步只做矢量化，没有重画。</div>
{note}
{''.join(rows)}
<div class="stage">
  <div class="stagewrap l"><h3>浅色主题 · 舞台底座</h3><div class="slots">{''.join(stage_l)}</div></div>
  <div class="stagewrap d"><h3>深色主题 · 舞台底座</h3><div class="slots">{''.join(stage_d)}</div></div>
</div>
<script>
function hex2rgb(h){{return [1,3,5].map(i=>parseInt(h.substr(i,2),16)/255);}}
function rgb2hsl(r,g,b){{const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
  if(mx===mn)return[0,0,l];const d=mx-mn,s=l>.5?d/(2-mx-mn):d/(mx+mn);let h;
  if(mx===r)h=(g-b)/d+(g<b?6:0);else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;return[h/6,s,l];}}
function hsl2rgb(h,s,l){{if(!s)return[l,l,l];const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  const f=t=>{{t=(t+1)%1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;}};return[f(h+1/3),f(h),f(h-1/3)];}}
function toHex(r,g,b){{return '#'+[r,g,b].map(v=>
  Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');}}
// 底色层 → 深色舞台；其余层 → 保色相，明度按 L' = .16 + (1-L)*.72 翻转
function toDark(p){{
  if(p.getAttribute('data-role')==='base') return '{args.dark}';
  const c=p.getAttribute('data-c'); if(!c) return p.getAttribute('fill');
  const [r,g,b]=hex2rgb(c);const [h,s,l]=rgb2hsl(r,g,b);
  return toHex(...hsl2rgb(h, Math.min(1,s*1.02), .16+(1-l)*.72));
}}
document.querySelectorAll('.frame.dark svg path, .slot.dark svg path')
  .forEach(p=>p.setAttribute('fill', toDark(p)));
</script>
"""
    open(out, "w").write(html)
    print(f"{out}  ({len(html) / 1024:.0f} KB)  {len(names)} 张")


if __name__ == "__main__":
    main()
