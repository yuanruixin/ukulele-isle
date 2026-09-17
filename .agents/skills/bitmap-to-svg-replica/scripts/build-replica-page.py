#!/usr/bin/env python3
"""
复刻验收页：原图 / 复刻(浅底) / 复刻(深色主题) 三列并排 + 底部两组「舞台底座」。

用法:
  python3 scripts/build-replica-page.py [输出 html]

前提：先跑过 scripts/trace-cats.sh 生成 docs/preview/traced/<name>.svg。

深色那列靠 JS 现场改 fill（读 data-c / data-role）：
  base 层 → 深色底；其余层 → 保色相、按 L' = 0.16 + (1-L)*0.72 翻转明度。
这是"同一份 SVG 也能进深色主题"的演示；正式接入时改成站点侧的固定映射表。
"""

import os
import re
import sys

import numpy as np
from PIL import Image

# 描摹器找自己旁边那个：脚本被软链到 scripts/ 下也能工作（abspath 不解析软链，正好）
HERE = os.path.dirname(os.path.abspath(__file__))
TRACER = os.path.join(HERE, "trace-image.py")
# 参考图与产物目录都相对**当前工作目录**（约定在项目根跑）
CLIP = os.environ.get("CLIP_DIR", "/Users/ewan/.workbuddy/clipboard-images/")
ROOT = os.getcwd()

CATS = [
    ("listen", "听歌", "clipboard-2026-09-17T09-56-16-462Z-eb4191e6.png"),
    ("sing", "唱歌", "clipboard-2026-09-17T09-56-16-463Z-9e70c176.png"),
    ("curl", "蜷睡", "clipboard-2026-09-17T09-56-16-464Z-55729246.png"),
    ("sleep", "睡觉", "clipboard-2026-09-17T09-56-16-464Z-fb82b06b.png"),
]
PAD = 6
BG_THR = 240


def crop_original(src, dst, scale=1):
    """按与描摹完全相同的口径裁出内容包围盒，作为对照用的原图。"""
    import importlib.util

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
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ROOT, "docs/preview/cats-replica.html")
    tdir = os.path.join(ROOT, "docs/preview/traced")

    rows, stage_l, stage_d = [], [], []
    for name, label, clip in CATS:
        orig_rel = f"traced/orig-{name}.png"
        size = crop_original(CLIP + clip, os.path.join(tdir, f"orig-{name}.png"))
        spath = os.path.join(tdir, f"{name}.svg")
        raw = open(spath).read()
        vw, vh = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', raw).groups())
        svg = inline(spath)
        kb = os.path.getsize(spath) / 1024

        rows.append(f"""<section class="row">
  <div class="meta"><b>{label}</b><span>{name}.svg</span><span>{vw}×{vh}</span><span class="kb">{kb:.1f} KB</span></div>
  <figure class="cell"><div class="frame light"><img src="{orig_rel}"></div><figcaption>原图 {size[0]}×{size[1]}</figcaption></figure>
  <figure class="cell"><div class="frame light"><img src="traced/{name}.svg"></div><figcaption>复刻 · 浅底</figcaption></figure>
  <figure class="cell"><div class="frame dark">{svg}</div><figcaption>复刻 · 深色主题</figcaption></figure>
</section>""")
        stage_l.append(f'<div class="slot">{svg}</div>')
        stage_d.append(f'<div class="slot dark">{svg}</div>')

    html = f"""<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>屿琴 · 小猫复刻验收</title>
<style>
 :root{{--bg:#f4f5f7;--ink:#111;--ink2:#6b7280;--dark:#1b1d21}}
 *{{box-sizing:border-box}}
 body{{margin:0;padding:28px 26px 64px;background:var(--bg);color:var(--ink);
      font:14px/1.6 -apple-system,"PingFang SC","Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased}}
 h1{{font-size:19px;margin:0 0 5px}}
 .sub{{color:var(--ink2);font-size:12.5px;margin-bottom:22px;max-width:760px}}
 .row{{display:grid;grid-template-columns:118px repeat(3,1fr);gap:14px;align-items:start;margin-bottom:16px}}
 .meta{{display:flex;flex-direction:column;gap:1px;padding-top:13px;font-size:11.5px;color:var(--ink2)}}
 .meta b{{font-size:15px;color:var(--ink);font-weight:600;margin-bottom:3px}}
 .meta .kb{{color:#9599a1}}
 figure{{margin:0;display:flex;flex-direction:column;gap:7px}}
 figcaption{{font-size:11px;color:var(--ink2);text-align:center}}
 .frame{{border-radius:16px;display:flex;align-items:center;justify-content:center;padding:14px;
        min-height:158px;box-shadow:0 1px 2px rgba(16,24,40,.06),0 6px 20px -8px rgba(16,24,40,.18)}}
 .frame.light{{background:#fff}} .frame.dark{{background:var(--dark)}}
 .frame img{{display:block;width:100%;height:auto;max-height:252px;object-fit:contain}}
 .frame svg{{display:block;width:100%;height:auto;max-height:252px}}
 .stage{{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:16px}}
 .stagewrap{{border-radius:20px;padding:22px 18px;
   box-shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px -10px rgba(16,24,40,.2)}}
 .stagewrap.l{{background:#fff}} .stagewrap.d{{background:var(--dark)}}
 .stagewrap h3{{margin:0 0 14px;font-size:12.5px;font-weight:600;color:#6b7280;letter-spacing:.4px}}
 .stagewrap.d h3{{color:#8b9099}}
 .slots{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}
 .slot{{background:#fafafa;border-radius:14px;aspect-ratio:1/1;display:flex;align-items:center;
       justify-content:center;padding:10px}}
 .slot.dark{{background:#26282d}}
 .slot svg{{width:100%;height:auto;max-height:100%}}
</style>
<h1>小猫复刻 · 验收</h1>
<div class="sub">左＝你给的图；中＝按原图逐像素描摹出的 SVG；右＝同一份 SVG 在深色主题下自动换色。
几何、笔触抖动、配色全部取自原图 —— 这一步只做矢量化，没有重画。</div>
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
  if(p.getAttribute('data-role')==='base') return '#26282d';
  const [r,g,b]=hex2rgb(p.getAttribute('data-c'));const [h,s,l]=rgb2hsl(r,g,b);
  return toHex(...hsl2rgb(h, Math.min(1,s*1.02), .16+(1-l)*.72));
}}
document.querySelectorAll('.frame.dark svg path, .slot.dark svg path')
  .forEach(p=>p.setAttribute('fill', toDark(p)));
</script>
"""
    open(out, "w").write(html)
    print(f"{out}  ({len(html) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
