#!/usr/bin/env python3
"""
复刻：把用户的手绘（白底）位图**逐像素矢量化**成 SVG —— 不是重画，是描摹。

为什么不用手搓的边界串环：真实手绘里笔画交叉会造出大量岔口，
贪心串环在岔口容易走错；marching squares（scikit-image）没有这个问题。

流程：
  1. 合成到白底 → 可选的轻度高斯模糊（喂给量化器，削弱抗锯齿过渡带）
  2. 墨迹阈值 + 从画面四边泛洪 → 得到「背景」，其余为「内容」（= 画的像素）
  3. 调色板量化（自动 median-cut，或 --palette 指定）→ 每个内容像素落到一个颜色
  4. 每个颜色层：marching squares 取轮廓 → Douglas-Peucker 抽稀 → Catmull-Rom 转三次贝塞尔
  5. 各层按面积从大到小输出；层与层之间用 evenodd 各自成环，天然支持「孔」

用法:
  python3 scripts/trace-image.py <src.png> <out.svg> [--colors 6] [--tol 1.0]
                                 [--palette "#111,#fff,#e8e2d6"] [--crop] [--bg-thr 240]

依赖: pillow, numpy, scikit-image
"""

import argparse
import json
import sys
from collections import deque

import numpy as np
from PIL import Image
from skimage import measure
from skimage.filters import gaussian


# ---------------------------------------------------------------- 读图 / 预处理

def load_rgb(path, blur, scale=1):
    """返回 (rgb float32 HxWx3, 工作宽, 工作高)。带 alpha 的先压到白底。

    scale>1 会先用 LANCZOS 放大再处理：细笔画（几道平行细纹、1-2px 的缝隙）
    在原尺寸下播种时凑不出"内部"，会糊成一整块；放大后缝隙有 4-6px，能正常分开。
    坐标在导出时再除回去，所以精度只赚不亏。blur 按原始像素给，随 scale 一起放大。"""
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        flat = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(flat, im)
    im = im.convert("RGB")
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    rgb = np.asarray(im).astype(np.float32)
    if blur > 0:
        rgb = gaussian(rgb, sigma=(blur * scale, blur * scale, 0),
                       channel_axis=2, preserve_range=True)
    return np.clip(rgb, 0, 255), im.width, im.height


def content_mask(rgb, bg_thr):
    """从四边泛洪找背景，返回 content = ~background。

    bg_thr 越低，越少像素被判为背景（线条更"胖"）。"""
    near_white = rgb.min(axis=2) >= bg_thr          # 三通道都够亮才算背景候选
    h, w = near_white.shape
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near_white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return ~bg


# ---------------------------------------------------------------- 配色

def quantize(rgb, content, colors, flat_tol=5.0, win=3):
    """只在**内容像素**上聚类，且只用「平坦区」像素定调色板。

    为什么要挑平坦区：手绘图的笔画边缘全是抗锯齿过渡带，直接把所有像素丢给
    k-means，聚类中心会被过渡带拖走 —— 结果每个灰度台阶都自成一"层"，
    描出来是一堆 1px 宽的碎环（路径体积爆炸且难看）。
    只拿局部方差小的像素（= 色块内部）算中心，过渡带像素最后按最近色吸附，
    边界就干净了。

    返回 (label 图 int32，调色板 list[(r,g,b)]，按亮度升序)；背景像素 label = -1。"""
    from scipy.cluster.vq import kmeans2
    from scipy.ndimage import uniform_filter

    lum = rgb.mean(axis=2)
    win = max(3, int(win))
    mu = uniform_filter(lum, win)
    mu2 = uniform_filter(lum * lum, win)
    std = np.sqrt(np.clip(mu2 - mu * mu, 0, None))
    flat = std < flat_tol

    sel = content & flat
    if int(sel.sum()) < colors * 40:
        sel = content
    px = rgb[sel].astype(np.float32)

    n = max(1, min(colors, len(px)))
    cents, _ = kmeans2(px.astype(np.float64), n, minit="++", seed=7)
    order = np.argsort(cents.mean(axis=1))
    cents = cents[order].astype(np.float32)

    d = ((rgb.reshape(-1, 1, 3) - cents.reshape(1, -1, 3)) ** 2).sum(axis=2)
    lab = np.where(content, d.argmin(axis=1).reshape(rgb.shape[:2]), -1).astype(np.int32)
    return lab, [tuple(int(round(v)) for v in np.clip(c, 0, 255)) for c in cents]


def parse_palette(hexes):
    return [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in hexes]


def segment_direct(rgb, content, pal):
    """朴素法：每个像素取 RGB 距离最近的调色板色。

    对纯色块图够用；对手绘线稿会**给每条黑线镶一圈灰边**——
    黑↔白的抗锯齿渐变中段刚好落在灰色附近，就被吸成了灰。"""
    P = np.asarray(pal, np.float32)
    d = ((rgb.reshape(-1, 1, 3) - P.reshape(1, -1, 3)) ** 2).sum(2)
    lab = np.where(content, d.argmin(1).reshape(rgb.shape[:2]), -1)
    return lab.astype(np.int32)


def segment_by_cores(rgb, content, pal, flat_tol=8.0, margin=34.0, min_seed=60, win=3):
    """两段式分割：**几何定归属、颜色定边界**。

    第一步（播种）：只把「确信的色块内部」当种子 ——
    条件 = 局部平坦 AND 颜色对第二名有明显优势。
    抗锯齿过渡带两个条件都不满足，绝不播种。

    第二步（归属）：对每个像素算出最近的**两个**竞争区域 A 与 B
    （各自到"该类种子"的距离），再用**颜色**在 A/B 之间裁决。

    为什么不能只用几何最近：黑线两侧的抗锯齿像素，几何上离黑种子更近，
    会全被判给黑 ⇒ 每条线凭空胖 2px；细缺口（窄白缝）连白色种子都长不出来，
    会被两侧的黑直接填死。让颜色来裁决，边界就落在真正的颜色中点上。

    为什么不能只用颜色最近：黑↔白的过渡带中段灰，恰好落在灰笔颜色附近 ⇒
    每条黑线都镶一圈灰边。限制成"只在最近的两个区域之间选"，灰层就跨不过黑线了。

    某个颜色若一个种子都凑不出（细笔画），就放宽给它追加 min_seed 个"最贴色"的种子。

    win 必须随放大倍数一起放大：为了判断"这是不是色块内部"，观察窗口在原图上
    得够大（>=3px 原始像素）。窗口不跟着放大时，放大后的抗锯齿带内部反而变平滑，
    会被误判成色块内部 —— 这是实测踩过的坑。"""
    from scipy.ndimage import distance_transform_edt, uniform_filter

    P = np.asarray(pal, np.float32)
    lum = rgb.mean(axis=2)
    win = max(3, int(win))
    mu = uniform_filter(lum, win)
    mu2 = uniform_filter(lum * lum, win)
    std = np.sqrt(np.clip(mu2 - mu * mu, 0, None))

    dd = ((rgb.reshape(-1, 1, 3) - P.reshape(1, -1, 3)) ** 2).sum(2)
    dd = dd.reshape(rgb.shape[0], rgb.shape[1], -1)
    order = np.argsort(dd, axis=2)
    best = order[:, :, 0]
    near = np.sqrt(np.take_along_axis(dd, order[:, :, :1], axis=2)[:, :, 0])
    second = np.sqrt(np.take_along_axis(dd, order[:, :, 1:2], axis=2)[:, :, 0])

    ok = content & (std < flat_tol) & ((second - near) > margin)
    seed = np.full(rgb.shape[:2], -1, np.int32)
    seed[ok] = best[ok]

    for i in range(len(P)):
        if int((seed == i).sum()) >= min_seed:
            continue
        cand = content & (best == i)
        if not cand.any():
            continue
        ys, xs = np.nonzero(cand)
        vals = near[ys, xs]
        k = min(min_seed, len(ys))
        pick = np.argpartition(vals, k - 1)[:k]        # 离该色最近的 k 个
        seed[ys[pick], xs[pick]] = i

    # 每个像素到各类种子的距离（自己那类为 0）
    D = np.empty((len(P),) + rgb.shape[:2], np.float32)
    for k in range(len(P)):
        D[k] = distance_transform_edt(seed != k)
    A = D.argmin(axis=0)
    np.put_along_axis(D, A[None], np.inf, axis=0)       # 抹掉最近的一类
    B = D.argmin(axis=0)

    da = ((rgb - P[A]) ** 2).sum(2)
    db = ((rgb - P[B]) ** 2).sum(2)
    lab = np.where(da <= db, A, B).astype(np.int32)
    lab = np.where(seed >= 0, seed, lab)                # 种子本身不参与裁决
    lab[~content] = -1
    return lab


# ---------------------------------------------------------------- 轮廓 → 路径

def num(v, prec=1):
    s = f"{v:.{prec}f}"
    return s[:-2] if s.endswith(".0") else s


def poly_to_path(pts, prec=1):
    """闭合点列（无重复尾点）→ Catmull-Rom 转三次贝塞尔 → 'M…C…Z'"""
    n = len(pts)
    if n < 3:
        return ""
    d = [f"M{num(pts[0][0], prec)} {num(pts[0][1], prec)}"]
    for i in range(n):
        p0, p1 = pts[(i - 1) % n], pts[i]
        p2, p3 = pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d.append(
            f"C{num(c1[0], prec)} {num(c1[1], prec)} "
            f"{num(c2[0], prec)} {num(c2[1], prec)} "
            f"{num(p2[0], prec)} {num(p2[1], prec)}"
        )
    d.append("Z")
    return "".join(d)


def trace_mask(mask, tol, prec, ox, oy, scale=1.0):
    """一张布尔掩膜 → 路径串（外轮廓 + 孔，交给 evenodd）。坐标已除回原始尺寸。"""
    m = np.pad(mask.astype(np.float32), 1)          # 补 0 边，保证轮廓闭合
    out = []
    for c in measure.find_contours(m, 0.5, fully_connected="high"):
        if len(c) < 8:
            continue
        c = measure.approximate_polygon(c, tolerance=tol)
        pts = [((float(col) - 1.0 - ox) / scale, (float(row) - 1.0 - oy) / scale)
               for row, col in c]
        while len(pts) > 1 and pts[0] == pts[-1]:
            pts.pop()
        if len(pts) < 3:
            continue
        # 去掉相邻重复点（抽稀后可能出现）
        clean = [pts[0]]
        for p in pts[1:]:
            if abs(p[0] - clean[-1][0]) > 1e-6 or abs(p[1] - clean[-1][1]) > 1e-6:
                clean.append(p)
        if len(clean) < 3:
            continue
        out.append(poly_to_path(clean, prec))
    return "".join(out)


# ---------------------------------------------------------------- 去噪

def mode_clean(lab, content, size=3, rounds=1):
    """保边界的众数滤波：清掉 1px 孤立像素与凸起，但不抹掉细笔画。

    对每个类别（含"背景"）算 3x3 占比，取占比最大者。
    这一步专治「轮廓上原图没有的小疙瘩」——
    抗锯齿像素被误分到别的层，会在边界上顶出一个 1px 的包。"""
    from scipy.ndimage import uniform_filter

    K = int(lab.max()) + 1
    for _ in range(rounds):
        stack = [uniform_filter((lab == k).astype(np.float32), size) for k in range(K)]
        stack.append(uniform_filter((~content).astype(np.float32), size))
        pick = np.argmax(np.stack(stack, 0), axis=0)
        lab = np.where(pick == K, -1, pick).astype(np.int32)
        content = pick != K
    return lab, content


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--colors", type=int, default=6, help="自动调色板的颜色数")
    ap.add_argument("--palette", default="", help="强制调色板，逗号分隔的 #rrggbb")
    ap.add_argument("--mode", default="cores", choices=("cores", "direct"),
                    help="cores = 从确信色块生长(默认，抗锯齿不上灰边)；direct = 逐像素最近色")
    ap.add_argument("--flat-tol", type=float, default=8.0, help="播种要求的局部标准差上限")
    ap.add_argument("--margin", type=float, default=34.0, help="播种要求的颜色优势(0-255 RGB 距离)")
    ap.add_argument("--tol", type=float, default=1.0, help="RDP 抽稀容差(px)，越大越简")
    ap.add_argument("--blur", type=float, default=0.6, help="量化前高斯模糊 sigma")
    ap.add_argument("--bg-thr", type=float, default=240, help="背景判定：三通道都 >= 此值")
    ap.add_argument("--min-area", type=int, default=40, help="小于此像素数的层丢弃")
    ap.add_argument("--smooth", type=int, default=1, help="众数清理轮数，0 = 关")
    ap.add_argument("--grow", type=float, default=0.0,
                    help="同色描边回补(px)：分水岭已补回线宽，一般留 0")
    ap.add_argument("--scale", type=int, default=1,
                    help="处理前放大倍数：细笔画/细缝隙在原尺寸会糊成一团，放大到 2-3 倍即可分开")
    ap.add_argument("--crop", action="store_true", help="裁到内容包围盒（含 --pad 边距）")
    ap.add_argument("--pad", type=float, default=6.0)
    ap.add_argument("--prec", type=int, default=1, help="坐标小数位")
    ap.add_argument("--info", default="", help="把分层统计写成 json 的路径")
    a = ap.parse_args()

    sc = max(1, a.scale)
    rgb, w, h = load_rgb(a.src, a.blur, sc)
    content = content_mask(rgb, a.bg_thr)

    if a.palette:
        pal = parse_palette([s.strip() for s in a.palette.split(",") if s.strip()])
        lab = (
            segment_by_cores(rgb, content, pal, a.flat_tol, a.margin, win=3 * sc)
            if a.mode == "cores"
            else segment_direct(rgb, content, pal)
        )
    else:
        lab, pal = quantize(rgb, content, a.colors, win=3 * sc)

    if a.smooth > 0:
        lab, content = mode_clean(lab, content, 2 * sc + 1, a.smooth)

    ys, xs = np.nonzero(content)
    if len(ys) == 0:
        print("！！没有找到任何内容像素，检查 --bg-thr 是否过高", file=sys.stderr)
        return 1
    pad = a.pad * sc
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    if a.crop:
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(w - 1, x1 + pad)
        y1 = min(h - 1, y1 + pad)
    else:
        x0, y0, x1, y1 = 0, 0, w - 1, h - 1
    # 导出坐标要除回原始尺寸
    vw = int(round((x1 - x0 + 1) / sc))
    vh = int(round((y1 - y0 + 1) / sc))
    min_area = a.min_area * sc * sc

    layers = []
    for k, col in enumerate(pal):
        mask = lab == k
        n = int(mask.sum())
        if n < min_area:
            continue
        layers.append({"k": k, "rgb": col, "hex": "#%02x%02x%02x" % col, "n": n, "mask": mask,
                       "lum": float(np.mean(col))})
    # 亮色在下、深色在上：深色线稿压在浅色填充之上，回补描边时才不会互相啃
    layers.sort(key=lambda L: (-L["lum"], -L["n"]))

    body = []
    stats = []
    for L in layers:
        d = trace_mask(L["mask"], a.tol * sc, a.prec, x0, y0, sc)
        if not d:
            continue
        grow = f' stroke="{L["hex"]}" stroke-width="{a.grow}" stroke-linejoin="round"' if a.grow > 0 else ""
        # data-c  : 原始色号，站点侧可用 CSS 按色号重映射（例如深色主题自动换色）
        # data-role: base = 最亮那层（身体/纸），深色主题要把它当"底"而不是普通色
        role = "base" if L is layers[0] else "ink"
        body.append(f'  <path fill="{L["hex"]}" data-c="{L["hex"]}" data-role="{role}"{grow} d="{d}"/>')
        stats.append({"hex": L["hex"], "px": L["n"], "bytes": len(d)})

    svg = "\n".join(
        [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" '
         f'width="{vw}" height="{vh}" fill-rule="evenodd">']
        + body
        + ["</svg>"]
    )
    with open(a.out, "w") as f:
        f.write(svg + "\n")

    print(f"{w // sc}x{h // sc} → {vw}x{vh}  {a.out}  ({len(svg) / 1024:.1f} KB)"
          + (f"  [处理于 {sc}x]" if sc > 1 else ""))
    for s in stats:
        print(f"  {s['hex']}  像素 {s['px']:>7}  路径 {s['bytes'] / 1024:>6.1f} KB")
    if a.info:
        with open(a.info, "w") as f:
            json.dump(stats, f, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
