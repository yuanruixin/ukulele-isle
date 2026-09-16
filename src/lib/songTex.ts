/**
 * 谱面（alphaTex）加载前的加工。
 *
 * 目前只有一件事：**补一行 `\instrument`**。
 *
 * 为什么需要它：alphaTab 在谱面不写 `\instrument` 时默认用 **GM 25 = 钢弦吉他**，
 * 而本站全是尤克里里指弹（尼龙弦）——用钢弦音色播会明显偏「尖、金属」。
 * 与其指望每首谱子都记得写这一行，不如在喂给 alphaTab 之前统一补上；
 * **作者自己写了就以作者为准**（这时本函数原样放行）。
 *
 * 注意它只是在内存里改字符串，**不写回 `songs/<id>/score.tex`**——
 * 谱面文件始终是「作者写的样子」，这也符合文件驱动的那条约定（见 ADR 0002）。
 */

/** alphaTab 的 `\instrument` 指令（注意是反斜杠开头，别写成正斜杠） */
const INSTRUMENT_DIRECTIVE = /\\instrument\b/;

export function withDefaultInstrument(tex: string, program: number): string {
  if (INSTRUMENT_DIRECTIVE.test(tex)) return tex;

  const lines = tex.split("\n");
  // ⚠️ `\instrument` 有位置要求：必须落在 `.`（元数据段结束）之后、`\tuning` 之前才生效。
  //    实测放在 `\tempo` 之前、或放在小节之间都不起作用。
  const dot = lines.findIndex((l) => l.trim() === ".");
  // 连 `.` 都没有说明这本来就不是一份完整谱面，原样返回，不硬塞一行进去
  if (dot < 0) return tex;

  lines.splice(dot + 1, 0, `\\instrument ${program}`);
  return lines.join("\n");
}
