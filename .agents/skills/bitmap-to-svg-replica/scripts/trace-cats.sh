#!/usr/bin/env bash
# 把四张手绘参考图复刻成 SVG（逐像素描摹，不重画）。
#
# 每行的调色板是**从原图量出来的真实色**，不是猜的：
#   listen  #ffffff 身 / #060606 线 / #8d8d8d 音符灰 / #c3c3c3 额纹+蝴蝶结浅灰
#   sing    #f8f0e5 米色身 / #452018 深棕描边 / #e6a098 内耳粉 / #b0a0a0 麦头灰 / #585848 网纹
#   curl    #ffffff 身 / #080808 线
#   sleep   #ffffff 身 / #0a0a0a 线 / #909090 额纹灰 / #6796e2 蓝色 Z / #f4b5cf 腮红粉
#
# scale 是处理前放大倍数：细笔画（sleep 的四道额纹）在原尺寸会糊成一团，放大才分得开。
# tol 是抽稀容差(原始像素)：1.8 是实测的体积/保真平衡点（1.0 更准但大 60%）。
#
# 用法: bash scripts/trace-cats.sh [参考图目录] [输出目录]
# 参考图目录默认 ~/.workbuddy/clipboard-images；输出目录默认 docs/preview/traced（相对当前目录）。
# 描摹器就找自己旁边那个 —— 这样脚本被软链到 scripts/ 下也照常工作，不依赖调用方在哪。
set -euo pipefail

SRC=${1:-"$HOME/.workbuddy/clipboard-images"}
OUT=${2:-docs/preview/traced}
PY=${PY:-/Users/ewan/.workbuddy/binaries/python/envs/default/bin/python}
HERE=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$OUT"

run () { # name file palette scale
  "$PY" "$HERE/trace-image.py" "$SRC/$2" "$OUT/$1.svg" \
    --palette "$3" --tol 1.8 --scale "$4" --crop
}

run listen clipboard-2026-09-17T09-56-16-462Z-eb4191e6.png \
    "#ffffff,#060606,#8d8d8d,#c3c3c3" 2
run sing   clipboard-2026-09-17T09-56-16-463Z-9e70c176.png \
    "#f8f0e5,#452018,#e6a098,#b0a0a0,#585848" 2
run curl   clipboard-2026-09-17T09-56-16-464Z-55729246.png \
    "#ffffff,#080808" 2
run sleep  clipboard-2026-09-17T09-56-16-464Z-fb82b06b.png \
    "#ffffff,#0a0a0a,#909090,#6796e2,#f4b5cf" 3

echo
echo "验收页： $PY scripts/build-replica-page.py"
