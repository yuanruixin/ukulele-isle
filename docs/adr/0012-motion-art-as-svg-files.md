# ADR 0012: 骨架几何外置成 SVG 文件，数据模块只留元数据

## 状态

已接受 (2026-09-17)

## 背景

ADR 0011 之后，站点消费的生成物是**一份** `src/data/cats.ts`：四个姿态的整段 `<svg>…</svg>`
被 `json.dumps` 成一个字符串塞进 `markup` 字段，整个文件 112 KB、正文挤成一行。

于是：

- **读不了、diff 不了、手改不了**。想微调某只猫的一笔，得在 11 万字符里找；git diff 出来是一整行。
- **同一件事存了两份**。`parts` 里带 `px/py/cx/cy/w/h/bbox`，而 `data-px`/`data-py` 又写在
  SVG 自己的属性上 —— 引擎实际读的是 SVG 那份，数据里那份从来没被读过。两份会各自漂移。
- 额外冗余：`cx/cy/w/h/bbox/norm` 引擎一次都没读过。

几何本身没有错，只是**放错了地方**：它是「一张图」，却被当成了「一条数据」。

## 决策

**1. 骨架落成 SVG 文件 —— 一个姿态一个。**

```
src/assets/cats/<id>.svg     归一化到统一舞台坐标系的骨架，几何一字未动
```

可读、可 diff、可直接用浏览器打开；`data-p` / `data-part` / `data-px` / `data-py` 都在里面。

**2. 数据模块只留元数据。**

`src/data/cats.ts` 现在只有：`order` / `vbStage` / `vbThumb` / `targetBodyH`，
加每个姿态的 `label` / `bodyH` / `bodyW` / `scale` / `parts`。
其中 `parts` 从「带 8 个数字的对象数组」瘦成 **`Record<string, string[]>`（语义名 → `data-p` 列表）**
（数组顺序仍有意义：循环类部件按序号错开相位）。
删掉的东西：`markup`、`cx/cy/w/h/bbox/norm`、以及与 SVG 属性重复的 `px/py`。
**枢轴只写在 SVG 的 `data-px` / `data-py` 上 —— 一处真相。**

**3. 「几何从哪来」由宿主决定，引擎不再假设几何在数据里。**

- 新增手写的 `src/data/catArt.ts`：`CAT_ART: Record<CatPoseId, string>`，用 Vite 的 `?raw`
  **同步**导入那四个文件。它不是生成物 —— 生成器管几何，投递方式是宿主的事。
- 引擎 `buildPose` 改成 `div.innerHTML = art(pose)`；`art` 默认取 `<catArt>`，可被 `opts.art` 覆盖。
- 顺带补上**失败要吵**：缺姿态时抛错并列出可选值。以前取不到就是 `innerHTML = "undefined"`，
  猫静默消失、控制台一声不吭。

**4. 生成器换输出模式。**

- 新增 `--svg <目录>`（rig 里配 `"svg"`）：骨架 SVG 的落地目录。
- 新增 `--migrate <旧数据模块>`：把**旧格式**（SVG 内嵌成字符串）的生成物换成新布局，
  不依赖描摹稿。它让「描摹稿已删」的存量工程也能升级。
- `--js`（`window.CHARACTERS` 那个经典脚本）**由默认产出改成选配** —— 它的唯一用途是
  `file://` 直开的验收页，而验收页已经删了。
- 数据正文改用缩进展开（这份文件也是给人看的，一个部件增删该是一行干净的 diff）。

**5. 为什么是 `?raw` 而不是 `public/` + fetch。**

`?raw` 同步、零异步，引擎的挂载路径（`makeInstance` / `buildPose` / 指针绑定全是同步的）
一行都不用改；骨架本来就是进主 chunk 的，体积没有变差。
代价是骨架仍在 JS 包里；想改成运行时取，只动 `catArt.ts` + 给引擎传 `art`，
**引擎与生成器都不用碰**（见「后果」）。

## 后果

- 加一只猫：位图 → `trace-image.py` → 在 `docs/cats-rig.json` 的 `parts` 里加一条 → 重跑
  ```
  python3 .agents/skills/bitmap-to-svg-replica/scripts/build-motion-data.py --rig docs/cats-rig.json
  ```
  `CatPoseId` 会自己长出新枚举值；但**必须记得在 `src/data/catArt.ts` 补一行导入** ——
  忘了会明确报错（这条是刻意的，比静默画空白强）。
- 改动道几何：改描摹稿后重跑生成器，**不要手改生成物**（两个都是生成物）。
- 骨架进主 chunk 这件事没变；真要减，见 `svg-character-motion` 技能「交付」一节的三条路。
- `docs/preview/` 里的中间稿仍是「跑起来才出现、已被 gitignore」的状态。

## 验证（2026-09-17）

- **迁移无损**：四个 SVG 与旧 `markup` **逐字节一致**（sha256 两两相同）；
  `order/vbStage/vbThumb/targetBodyH/bodyH/bodyW/scale/parts` 全部一字未改。
- **两条路等价**：从四个 SVG **反推出描摹稿**，再跑一遍生成器的正常模式 ——
  产出的四个 SVG 与数据正文与站点在用的**逐字节一致**。这既证明迁移产物不是手搓的，
  也证明重写后的正常路径没坏（`vbStage` 一致是因为它在舞台版里会覆盖掉输入的 viewBox）。
- **浏览器结构签名不变**：改造前后取同一份 DOM 签名（4 只猫 / 123 条 `.rig path` /
  路径数据 94927 字符 / data-* 与 d 的 FNV 哈希）—— 两边都是 `d002a191`。
- **暗色换色仍生效**：`data-col` 保留原色号，`fill` 由 `#ffffff → #000000` 等重映射。
- `tsc -b --force` 干净；`pnpm build` 通过，`index-*.js` 362.61 kB / gzip 127.19 kB
  （原 366.24 kB / 128.13 kB —— 去掉转义后反而略小）。
