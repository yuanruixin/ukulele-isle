#!/usr/bin/env bash
# 批量描摹模板：把一个目录里的参考图逐张转成 SVG。
#
# 抄一份改成自己的（.example 只是提醒它是模板，改完可以去掉）：
#     cp trace-batch.example.sh trace-batch.sh && chmod +x trace-batch.sh
#
# 每行一个任务：
#     run <输出名> <输入文件名> <调色板> <放大倍数>
#
# 调色板必须是**从原图量出来的真实色**（方法见 SKILL.md 坑 1 / 坑 2），不要猜：
# 猜出来的灰往往恰好是黑白的中间调，会把抗锯齿过渡带描成一堆碎环。
# scale 是处理前放大倍数 —— 细笔画（几道平行细纹、1-2px 的缝）在原尺寸会糊成一团，
# 放大才分得开；放大后判「局部平坦」的窗口要 = 3*scale，trace-image.py 内部已自动换算。
#
# 用法: bash scripts/trace-batch.example.sh [参考图目录] [输出目录]
#       默认 ./in → ./out；两个都可以在命令行覆盖。
set -euo pipefail

SRC=${1:-./in}
OUT=${2:-./out}
PY=${PY:-python3}
HERE=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$OUT"

run () { # name file palette scale
  "$PY" "$HERE/trace-image.py" "$SRC/$2" "$OUT/$1.svg" \
    --palette "$3" --tol 1.8 --scale "$4" --crop
}

# ---- 下面四行是示例，换成你自己的图 ------------------------------------
# 纯双色线稿：**不要**多给色号，多出来那一层就是抗锯齿过渡带
run sample-line   sample-line.png   "#ffffff,#080808"                        2
# 三级灰线稿：中灰 = 主体线条，浅灰 = 浅色装饰（两级的判据见 references/measured-palettes.md）
run sample-gray   sample-gray.png   "#ffffff,#060606,#8d8d8d,#c3c3c3"        2
# 填充色块风：底色 + 深色描边 + 两种点缀色
run sample-fill   sample-fill.png   "#f8f0e5,#452018,#e6a098,#b0a0a0,#585848" 2
# 有细密平行纹的图：放大 3 倍才分得开
run sample-fine   sample-fine.png   "#ffffff,#0a0a0a,#909090,#6796e2,#f4b5cf" 3
# ------------------------------------------------------------------------

echo
echo "验收页： $PY $HERE/build-replica-page.py --in $SRC --traced $OUT -o $OUT/replica.html"
