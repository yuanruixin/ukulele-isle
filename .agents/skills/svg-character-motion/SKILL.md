---
name: svg-character-motion
description: 给已经画好/描摹好的 SVG 角色（尤其是多色层描摹稿、扁平插画、线稿）加**确定性程序化动画与交互**——呼吸、跟指针、点击跳跃、换姿态、次级动作拖尾，并能暂停/慢放/逐帧定格检视。当用户说「给这个 SVG 加动画」「让它动起来」「加点交互动画」「按迪士尼准则做动作」，或要求动画能定格复算、不靠逐帧状态累加时使用。
agent_created: true
---

# SVG 角色 · 确定性程序化动画引擎

把一张**静态矢量角色**变成会动、能交互的东西。前置是
`bitmap-to-svg-replica`（位图 → 描摹 SVG）—— 那份产物天生是「一叠按颜色分层的
`<path>`」，正好可以当骨架用；不是描摹稿的普通 SVG 同样适用。

设计准则来自 `disney-animation-rule-skill`：**本技能是它的工程实现层**，
准则管「该夸张哪个通道」，本技能管「怎么写成一段可以定格复算的代码」。

## 一句话原则

> **状态 = f(t, inputs, params)**

每一帧都能独立算出来，不读上一帧、不依赖渲染顺序。
这样才有：暂停、慢放、把任意时刻定格出来逐帧比对、以及「同一输入必然同一帧」。

推论：任何「累积量」都不能在 render 里 `+=`。要么把它写成 t 的解析式，
要么只在**语义事件时刻**（落地、交接）一次性结算成静态值（下面「归位点」就是第二种）。

## 三段管线

```
① 描摹（另一个技能 bitmap-to-svg-replica）    traced/<id>.svg       每色层一个 <path fill-rule="evenodd">
② 拆件 + 归一化（几何，也在那个技能里）        rig-parts.py         色层 → 可独立变换的部件（孔洞跟随父件）
                                            build-motion-data.py  语义标注 + 所有角色统一到同一坐标系
                                            产物 <svg 目录>/<id>.svg  ★ 骨架本体：一个姿态一个文件，可读可 diff
                                            产物 数据模块（可选）      只留元数据：舞台画幅 + 各部件的 data-p 列表
③ 引擎（本技能）                            几何来自 SVG 文件、元数据来自数据模块；引擎不推导几何
```

**② 产出的是 SVG 文件，不是塞进数据的一个字符串。** 别把骨架内嵌进数据模块：那样读不了、
diff 不了、手改不了；而且部件枢轴会两处各存一份（数据里一份、SVG 的 `data-px` 一份），
迟早对不上。骨架归 SVG 文件，枢轴就写在它的 `data-px` / `data-py` 属性上 —— 一处真相。

② 的两个脚本随 `bitmap-to-svg-replica` 一起装（**只有一份真身，别复制到自己的工程里**）：

```bash
PY="${PY:-python3}"        # 需 pillow numpy scipy scikit-image
$PY <bitmap-to-svg-replica>/scripts/rig-parts.py traced/<id>.svg out/rig.svg   # 冒烟：打印部件清单
$PY <bitmap-to-svg-replica>/scripts/build-motion-data.py --rig rig.json --traced traced --out out --svg out/svg
```

`rig.json` 是**每套角色一份**的语义部件表，由使用者放在自己的工程里
（格式见那个技能的 `scripts/rig.example.json`）—— 它必然跟具体的画绑定，所以不进技能。

下面只写引擎侧的工程约定与坑。示例 API 名写作 `createMotion`、路径写作 `<...>`，
**都是占位**，落地时按自己的工程命名。

### 落地成模块（推荐）

引擎与页面胶水**必须分开**：引擎不认识 React、不注入样式、不读 DOM 尺寸，
只认「宿主元素 + 一组姿态」；样式与读数都是壳的事。这样同一个引擎能同时活在
组件里和验收页里，改一处两边都跟着变。

```js
const h = createMotion(hostEl, {
  layout: 'row',            // 'row'：一个姿态一个实例横排；'single'：一个实例装下全部、靠 morph 换
  poses: ['idle','wave'],   // 要哪几个姿态、顺序即排列顺序
  frame: 'thumb',           // 'stage' 有跳跃用的头顶余量；'thumb' 更矮
  interactive: true,        // 悬停/点击；false = 纯装饰（缩略图就该是 false）
  theme: 'light', colors: {…}, config: { bpm: 96 }, onFrame: (info) => {…},
});
h.setTheme('dark'); h.setBpm(96); h.setSpeed(0.25); h.setPlaying(false);
h.setReview({act:'jump', p:0.43, pose:'idle'});     // 定格检视
h.setPose('wave'); h.trigger('jump', 'idle');       // 换姿态 / 让某一个跳一下
h.refresh(); h.destroy();
```

**DOM 契约**（引擎建节点、壳给样式，契约写在引擎文件头）：

```
.cat          每个角色的盒子（指针事件挂它身上；可交互时引擎挂 data-clickable 供 CSS 出手型光标）
.cat .pose    一张姿态画面，只有一个带 .on（引擎切的是 .pose 上的 .on）
.cat svg      撑满盒子；宽高由壳定
.fx .shadow / .fx .dust / .fx .poof   点缀（--fx / --fx2 由引擎写在 .fx 上；透明度逐帧写行内 style）
```

**一条 rAF + 每实例自己的时钟**：一排角色共用一条 `requestAnimationFrame`，但各自推进自己的 `t`
⇒ 不会 N 个循环抢帧，又能每块单独暂停/慢放；新挂上来的实例把 `t` 对齐到「已经过去多久」，
所以一排角色的拍子在同一个拍子上。

**布局用「高度定死 + 每个盒子等分」**（`flex:1 1 0; min-width:0` + `svg{height:100%;width:auto;max-width:100%}`）：
归一化之后所有角色身体高相同，给一个高度它们就是齐的；等分 + `min-width:0` 保证窄屏不横溢出，
被压缩时每个盒子压得一样多 ⇒ **脚下的地面线始终齐平**（影子、扬尘都在这条线上）。
只想占自然宽度就换成 `flex:0 1 auto` + 外层 `w-fit mx-auto`。

## 引擎的七条工程约定

### 1. 动作 = 语义阶段表，不是一条缓动

```js
const JUMP_T = () => ({ settle:.10, anticipation:.20, launch:.06, air:.56, impact:.07, recover:.34 });
function phaseAt(u, table) {                    // 给 u 秒，返回 {name, p, t0, dur}
  let acc = 0;
  for (const k of Object.keys(table)) {
    const d = table[k];
    if (u < acc + d) return { name: k, p: (u - acc) / d, t0: acc, dur: d };
    acc += d;
  }
  return { name: 'done', p: 1, t0: acc, dur: 0 };
}
```

阶段名直接对准则（settle/anticipation/launch/air/impact/recover），
**时长是能读的表**，不是藏在某个贝塞尔参数里。想调「预备多久」就直接改表。

### 2. 形变由主运动的速度**派生**，不是每条通道各配一条曲线

```js
const dp = 1/180;
const v = (airY(p + dp) - airY(p - dp)) / (2*dp) / 4;      // 从纯轨迹解析采样，不用上一帧
o.s = 1 + stretchK * clamp(Math.abs(v), 0, 1.15) * (v < 0 ? 1 : .85);   // 上冲比下落拉得更长
// 体积守恒：纵向动 → 横向反向补偿
o.sy = o.s; o.sx = 1 - (o.s - 1) * volumeGain;
```

好处：改了轨迹（比如顶点滞留）**冲击强度会自动跟着变**，永远不会对不上。

### 3. 弧线与顶点滞留都写成闭式

```js
const hangRemap = p => p + (hangK * Math.sin(2*Math.PI*p)) / (2*Math.PI);  // 顶点停得久一点
const airY = p => -4 * hangRemap(clamp(p,0,1)) * (1 - hangRemap(clamp(p,0,1)));  // -1=顶点 0=地面
```

衰减振荡也**不要**做弹簧模拟，用闭式：`settle(p, freq, decay) = exp(-decay*p) * cos(2π*freq*p)`。
回弹、余韵、惊醒后的收敛全用它 —— 天然满足 `f(t)`，随便定格。

### 4. 次级动作 = 对主运动做**延迟采样**

```js
const lagOf = d => { const b = bodyMotion(inst, t - d, id, null, off);
                     return { dx: b.dx - body.dx, dy: b.dy - body.dy, s: b.s - body.s }; };
```

**必须传同一个 `off`**（见约定 5）：否则归位点会被算进拖尾，
「站着不动」的角色会因为它曾经跳过一次而永久拖着一截。四个坑：
- `lag.dx/dy` 是**舞台单位**，而部件变换写在归一化组**里面**、用的是**原始单位**
  ⇒ 拖尾量要 `÷ 角色缩放比` 才能换算回去（否则身宽不同的角色拖尾幅度差好几倍）。
- `lag.s` 是无量纲比值，不用换算。
- 只让「飘得起来的部件」（音符、Zzz、头发、披风）吃位移拖尾；麦克风、手这类
  刚性部件只吃旋转/形变，否则会从身上撕下来。
- 冲击（落地、惊醒）另配一个按事件时刻派生的 burst，不要混进 lag。

### 5. 归位点：位移在**落地那一刻**结算，位移才连续

角色跳走之后要「留在那儿」，但不能每帧累加。做法是把水平位移拆成两截：

```js
/* 每帧只算一次，body 与部件的延迟采样共用 */
function homeOffset(inst, act, t) {
  if (!act) return inst.off;
  const u = t - act.t0;
  if (act.kind === 'jump') return inst.off + (u >= EVT.jumpImpact() ? act.travel : 0);
  if (act.kind === 'morph') return morphState(u).swapped ? 0 : inst.off;   // 换姿态顺手回正
  return inst.off;
}
const settleHome = inst => { inst.off = clampOff(homeOffset(inst, inst.action, CLOCK.t)); };
```

滞空阶段的 `dx = travel * hangRemap(p)` 在 `p=1` 时**正好等于 travel**，
而归位点也在这一刻从 `off` 变成 `off + travel` ⇒ 两者相抵，**合位移完全连续**，不会弹回。
`settleHome` 在「动作演完卸下」和「被新点击顶掉」两处各调一次（幂等，可重复调）。

### 6. 变换分两层：静态归位 vs 动态形变

```
<svg viewBox="统一舞台坐标">
  <g class="home" transform="translate(off 0)">     ← 站哪儿（静态，影子和身体一起搬）
    <g class="rig"  transform="translate(dx-off dy) rotate() scale()">  ← 动作（绕脚下）
      <g class="norm" transform="translate() scale()">  ← 原始坐标 → 舞台坐标，几何一字不动
        <g data-layer="0"> <path …/> </g> …
      </g>
    </g>
    <g class="fx"> 投影 / 扬尘 / poof 环 </g>
  </g>
</svg>
```

**为什么必须分层**：形变要绕**地面接触点**做。如果把静态归位也塞进同一个
`transform`，站到画面边上时缩放就会绕着画面原点转 —— 脚会飘。拆开后
`sx/sy/rot` 永远作用在「自己脚下的那个原点」上。

**几何一律不改**：归一化用外面套一层 `<g transform>`（含 90° 也不动 `d`），
好处是描摹稿的原坐标、部件枢轴全部保持原样、逐字节可校验。

### 7. 点缀尺寸一律按「角色身高」的比例给

舞台单位在屏幕上可能只有零点几像素 —— 写死 `stroke-width:2.4` 必然**看不见**。
把所有 fx 尺寸放进 CONFIG 里当比例（`0.034 * bodyH` 之类），用属性写下去；
**别在 CSS 里写 `stroke-width`**，CSS 会盖掉属性。

```js
fx: { shadow:{rx:.42,ry:.055,op:.20,shrink:.34,fade:.55},
      dust:  {stroke:.034,spread:.30,lift:.030,grow:1.5,tilt:14,op:.75},
      poof:  {r:.058,r0:.10,r1:.62,op:.85} }
```

## 八个坑（实测）

### 1. 自动描摹的子路径是**嵌套**的，拆件会把孔洞填实

一个色层的 `d` 里既有外轮廓、也有内部孔洞和独立内件，靠 `fill-rule="evenodd"`
按嵌套奇偶生效。把子路径拆成独立 `<path>` ⇒ 孔洞被填成实心。

正解：**射线法算嵌套深度**，偶数深度 = 实体件，奇数深度 = 孔洞，
把孔洞挂到「包含它的、深度恰好小 1 的、面积最小的那个父件」上，
每个部件自己带 `fill-rule="evenodd"`。

验收口径：拆件前后的渲染像素差应当只有**沿边缘的抗锯齿缝**（实测 0.046%，
最大簇 29px、74.8% ≤4px）—— 有整块差异就是孔洞填实了，不是抗锯齿。

### 2. 换姿态要在挤压最深处交接，并顺手回正

每个姿态是一张关键画，之间不插值：先压扁（`squash .11`），在**最低点**换成新画面，
再弹出过冲，用一圈 poof 环盖住交接。各姿态身宽/身高不同，
换画那一刻把归位点归零（画面正被 poof 盖着）—— 否则换完姿态角色会歪在一边。

### 3. 点击方向要按**角色自己的半身宽**归一化，且减去它当前的站位

```js
const half = Math.max(data[pose].bodyW * 0.5, bodyH * 0.42);
const want = clamp((x - inst.off) / half, -1, 1) * jump.scale[pose];
const dest = clampOff(inst.off + want * jump.drift * bodyH);
const travel = dest - inst.off;
```

三个都要：
- 用 `bodyW/2` 而不是全局 `bodyH` —— 不同姿态身宽能差 1.7 倍，
  拿 bodyH 当基准会「窄的一碰就满、宽的怎么点都不满」；
- 减 `inst.off` —— 角色跳到别处之后再点**它本身**，应该还是原地跳；
- 目的地先 clamp 再反算 travel —— 落地即归位，且永远不会走出画面。

`bodyW` 要在数据生成阶段算好（`(bx1-bx0) * scale`，归一化把身体中线放在 x=0，
所以身体水平范围恒为 `±bodyW/2`）。

### 4. 屏幕坐标 → 舞台坐标：viewBox 原点**不是**要减掉的偏移

```js
const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
return pt.matrixTransform(svg.getScreenCTM().inverse());     // 就是舞台坐标，别再减
```

`viewBox` 本身就是舞台坐标系（`vbStage` 的 x/y 只是它的原点）。
再减一次等于给每个点击加一个常量偏移 —— 症状是「方向永远只朝一边」。
另外要取**当前可见**的那张 svg（`.pose.on > svg`）：换姿态后 CTM 也换了。

### 5. 滞空/换画面期间要拒绝新点击

滞空中被新点击顶掉时，`settleHome` 结算出的是**旧的**落点，
新跳跃会从旧地面点重新起跳 ⇒ 视觉上瞬间弹回去。
判定用语义时刻：`if (act.kind==='jump' && t - act.t0 < EVT.jumpImpact()) return;`
落地之后（impact/recover）可以接着点，起点就是当前落点，接得很顺。

### 6. 定格检视必须**真的**去掉跟拍

把 `CONFIG.review = {act, p, pose}` 非空当开关，`pure = !!act.review`：
呼吸、踩拍、抽动、悬停全部跳过，只留对主动作的滞后；
review 里的跳跃 `travel = 0`、归位点归 0 ⇒ 逐帧比对时只有竖直方向的变化，间距看得清。
不加这一条，定格出来的每一帧都还在呼吸，等于白做。

### 7. 缩略图 viewBox 的**顶部**要单独留余量

会往上飘的部件（音符、气泡、Zzz 之类，幅度约 `0.26×身高`），viewBox 不留余量就被 svg 边界切掉。
只加**上方**空白：横向比例由 `width:100%` 决定 ⇒ 角色的显示大小完全不变，
只是多出一段空白（各角色的落地基线仍然对齐）。
舞台侧则可以用 `overflow:visible` 放开（再让外层卡片裁圆角）。

### 8. ★ 主题换色不能拿 `svg.children` 当色层 —— 会**静默失效**

归一化之后骨架 SVG 的根是 `<g class="norm" transform="…">`（原始坐标 → 舞台坐标），
四个色层在它**底下**。于是：

```js
const layers = [...svg.children];        // ✗ 只拿到那一个 .norm 组
layers.forEach(g => g.setAttribute('fill', dark ? toDark(g.dataset.col) : g.dataset.col));
```

`g.dataset.col` 是 `undefined` ⇒ `fill` 被写在一个**没有 `data-col` 的组**上，
底下的色层各有自己的 `fill` 属性、照旧生效 ⇒ **换色完全没有效果，而且不报错**。
症状：深色下角色还是白身子，与「身体融进背景、只剩亮线」的设计正好相反
（实测：它能在代码里安静躺很久，直到有人真的去深色主题下看一眼 —— 浅色下一切正常）。

正解：**色层按 `data-layer` 找**，`svg.children` 只用来把画面整体搬进 `.rig`
（整组搬 ⇒ 归一化变换原样保留，几何不动）：

```js
const roots  = [...svg.children];                              // 画面根（.norm），搬进 .rig 用
const layers = [...svg.querySelectorAll('[data-layer]')];      // ★ 换色写在它们身上
```

同族的静默坑：颜色层 `fill` 若写成继承（不给子节点自己的 `fill`），
父组上写错就整片变色；给了 `fill` 属性则「写错的地方毫无反应」。
**两种都必须在深浅两个主题下各看一眼才算验过。**

顺带两条：
- 深色下 base 层换成**「角色背后的那个底色」**（不是固定色，站点深色下就是页面底色），
  这样身体才与背景融成一片；其余层保色相、翻明度（`L' = 0.16 + (1-L)*0.72`）。
- 顺手把 `svg` 的 `width/height` 属性改成 viewBox 的尺寸：原图自带尺寸与取景框比例不同时，
  «宽 100% + 高 auto» 会因为 intrinsic ratio 取属性值而里外差 2.6%（内容被 letterbox 一圈白边）。

## 交互清单（缺一个都显得半成品）

| 交互 | 准则 | 要点 |
|---|---|---|
| 呼吸 | 时间节奏 / 生命力 | 每个角色周期与幅度不同 = 性格 |
| 踩拍 | 预备 / 挤压与拉伸 | 脉冲取**环绕距离**，拍与拍之间连续不跳变 |
| 悬停抬身 | 慢入慢出 / 吸引力 | 先微沉（预备）再抬起，离开时过冲回落 |
| 跟指针偏头 | 跟随与重叠 | 同样按半身宽归一化 |
| 点击跳 | 弧线 / 预备 / 落地挤压 | 朝点击点跳，可连点挪动，见坑 3/5 |
| 换姿态 | 姿态对位 | 挤压最深处交接 + poof 遮蔽，见坑 2 |
| 性格化替代动作 | 吸引力 | 睡着的角色被点 → 「惊醒」而不是跳 |
| 定格检视 | （准则钦点的 review 工具） | 见坑 6 |

## 验收

**必须用真实点击**（`agent-browser click` / 合成 `MouseEvent` 派发到容器）取样，
不能只看静止截图。取样的正确姿势是**页面内 rAF 循环**把 transform 记进数组再一次性读回：

```js
st.dispatchEvent(new MouseEvent('click', {clientX: cx, clientY: cy, bubbles: true}));
(function step(){ rec.push(rig.getAttribute('transform'));
   performance.now() - t0 < 1500 ? requestAnimationFrame(step) : (window.__p.done = true); })();
```

⚠️ 每次 `agent-browser eval` 往返约 1 秒 —— 用「点一次读一次」的循环去采样，
拿到的全是动作结束后的呼吸帧，会得出「横向位移为 0」这种**假结论**。

逐项确认：
1. 合位移在落地时刻**连续**（`rig.dx → 0` 与 `home → travel` 同帧发生）；
2. 挤压的方向：预备向下、起跳向上、落地压扁、回弹收敛；
3. 旋转朝行进方向倾，朝指针偏；
4. 部件滞后只在「飘得起来」的部件上，幅度按各自缩放比换算后视觉一致；
5. 定格任意 p 值都能复算出同一帧（同一输入两次结果逐字符相同）；
6. 慢放 0.25× 看间距（采样点疏密 = 速度）；
7. 深浅两套主题都过一遍（base 层换舞台色、其余保色相翻明度）；
8. **窄屏**（约 390px）：`document.documentElement.scrollWidth === clientWidth`（不横溢出），
   每个盒子等宽等高、四条地面线仍然齐平；
9. **系统「减弱动态效果」**：重新加载后连续采 90 帧，`transform` 只有 **1 个**不同值
   （真的静止），且点击没反应；
10. 「开关关掉就完全不出现」也试一次（站点配置里那个开关置 false）。

⚠️ 页面内 rAF 采样器记得**清空**或提高上限：写死上限时，标记位在封顶后不再增长，
`slice(a,b)` 会拿到空数组 —— 症状是「采样 0 帧」，看起来像动作没发生。

### 改动**几何来源**时怎么验收：比「与时间无关的那部分 DOM」

换投递方式（骨架从数据字段挪到独立 SVG 文件、换 `?raw` / fetch、拆数据模块）之后，
**逐帧截图是没用的** —— 角色一直在动，两次截图相位不同，像素差说明不了任何事。
正确的口径是取一份**与时间无关的 DOM 签名**：

```js
const sig = [...document.querySelectorAll('.host .pose svg')].map(svg => [
  svg.getAttribute('viewBox'),
  [...svg.querySelectorAll('[data-layer]')].map(g => g.dataset.col).join(','),
  [...svg.querySelectorAll('.rig path')].map(n =>
    [n.dataset.p, n.dataset.part, n.dataset.px, n.dataset.py, n.getAttribute('d')].join('|')
  ).join('\n'),
].join('\n=====\n'));
```

只读 `data-*` 与 `d` —— **每帧被引擎写的 `transform` / `opacity` 一律不要进签名**。
改造前后各取一次，**哈希必须相同**（顺带记下角色数 / 路径数 / `d` 总长度，方便定位差异）。
这样验的是「引擎最终装配出来的几何与标注一字未改」，比截图强得多，而且不挑时间点。

配套两条：
- **几何文件本身做逐字节比对**：外置/迁移前后逐文件算 sha256，应当完全相同。
- **两条路要互相印证**：若同时存在「迁移存量产物」与「重跑生成器」两条路，
  就得让它们产出**逐字节一致**的结果 —— 只验其中一条，等于没验另一条有没有坏。

## 交付

一份**能自己玩的验收页**：舞台 + 播放/速度/节拍 + 定格滑块 + 主题切换 + 姿态缩略图，
外加一张「12 条准则 → 这个页面里的具体做法」对照表 —— 用户是在拿准则逐条比对，
对照表就是验收清单。这个页面要**直接 import 引擎与数据**（一份真身），别复制一份逻辑过去。

落地到页面时再包一层：引擎（纯模块，**不认识框架、不注入样式**）+ 组件（挂载 / 换主题 / 销毁）
+ 站点配置块（要不要、摆哪几个、多大、几拍、能不能点）。**工艺参数留在引擎里，站点配置只放开关**
—— 两边不互相搬参数，用户才找得到旋钮。三层各自的职责边界见上面「落地成模块」。

⚠️ 骨架进首屏是要花钱的：实测四个姿态的骨架 SVG 共约 105 KB，以 `?raw` 同步引入就是
整块进主 chunk（模块数从 3.7 KB 涨到 ~127 KB gzip 就是这么来的）。
首屏确实要它就接受这个代价；否则三选一：

- 组件懒加载（`React.lazy` 或等价物）；
- 骨架挪到 `public/` 运行时 fetch —— 代价是挂载从同步变异步（要加载态与失败态），
  且 `file://` 下 fetch 不通；
- 只加载首屏真正用到的那几个姿态（`?raw` 是按文件引入的，天然支持挑着引）。

换投递方式**不用碰引擎**：给 `createMotion` 传一个 `art: (pose) => svgText` 就行。
