# ADR 0006: 和弦库自绘 SVG 指法图 + 复用 alphaTab 试听

## 状态

已接受 (2026-09-16)

## 背景

要新增「和弦库」工具：速查常用和弦指法，并且点一下能听到这个和弦。

两处需要定型：

1. **指法图怎么来**。候选：
   - 自绘 SVG 组件（数据只有「哪根弦第几品、用哪根手指」）；
   - 引入第三方库 ChordKit（`chordkit` / `@chordkit/react` / `@chordkit/dictionary`，1.0.8 / MIT / 零依赖 / gzip 约 6KB，内置 ukulele 乐器预设）；
   - 做成图片素材。
2. **试听的声音从哪来**。候选：
   - 复用 alphaTab 内置 SoundFont 播放器（歌曲页已在用）；
   - Web Audio 实时合成拨弦；
   - 预制音频采样。

## 决策

- **指法图自绘 SVG**（`src/components/chords/ChordDiagram.tsx`），不引入 ChordKit。
- **试听复用 alphaTab SoundFont**，与歌曲页同音色；页面上不渲染任何谱面——给 alphaTab 一个**屏幕外、有真实尺寸**的容器，只当合成器用。
- 和弦数据**只存一份**（`siteConfig.chords.items`），由它同时派生指法图与 alphaTex（`src/lib/chord.ts`）。
- alphaTab 用**动态 import**，落到独立 chunk；页面挂载后在 `requestIdleCallback` 里**静默预加载**，不跟首屏抢带宽。

## 理由

- ChordKit 四个包都核实过确实存在、MIT、零依赖，但**极度小众**（GitHub 6 星、周下载约 17、单一维护者、首发仅数月），且其尤克里里预置词典只有大三 / 小三和弦、**没有七和弦**（弹唱高频的 G7 / D7 用不了）。指法数据总共只有「品位 + 手指」两个数组，自绘 SVG 的边际成本很低，换来的是完全可控的主题与交互，以及零依赖风险。
- 复用 alphaTab 的代价是体积（worker + worklet + 主包约 3.3MB，音色库 954KB），但换来与歌曲页**完全一致的音色**，且**扫弦能用原生琶音表达**（alphaTex 的 beat 级 `{bd N}`），不必自己写合成器的包络与拨弦模型。
- 动态 import + 空闲预加载是两者的折中：主包只增加约 11KB（`ChordsPage` + 指法图 + 派生逻辑），用户点下去时音色已经就绪。副作用是 **`SongPage` 的 chunk 从 1.1MB 瘦到 7KB**（alphaTab 变成共享的独立 chunk），曲谱页与和弦页共用同一份。
- 单一数据源消除了「图上画的」和「耳朵听到的」对不上的可能。

## 后果

- 进入和弦库页会下载约 4.3MB（alphaTab + 音色库）——这一页不再轻量，**接受**：试听的音色一致性优先。不点试听的用户也会付出这份流量。
- **点击到发声约有 150–200ms 延迟**：alphaTab 换谱要重新生成 MIDI（走 worker 往返），期间 `play()` 返回 false。当前实现是**重试到播放器就绪**（25ms 一次）。若日后要抹掉这段延迟，可考虑「一份谱面放四个小节 + `playbackRange` 定位」——`playbackRange` 与 `tickPosition` 在 Api 上实测存在，但**不在公开类型声明里**，属于未文档化接口，需自行权衡升级风险。
- 播完一个和弦会在谱面结束时停止（余音时长 = 配置的全音符长度，实测与 `ringSeconds` 一致）。
- 指法数据顺序遵循 alphaTab 约定（**高音弦在前**），与和弦表上通常写的「4弦→1弦」相反；图上横向方向也按行业习惯（最左 4 弦）另算一次。这是本项目最容易录反的地方，新增和弦时务必对照 `ChordConfig.frets` 的注释。
- 后续扩到 18 个和弦只需往 `siteConfig.chords.items` 里加数据，版式与派生逻辑都不用改。
