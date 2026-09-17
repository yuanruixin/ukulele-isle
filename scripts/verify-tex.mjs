#!/usr/bin/env node
/**
 * score.tex 校验器（屿琴项目）
 *
 * 为什么需要它
 * ------------
 * `score.tex` 是手写/生成出来的**纯文本**，写错了 alphaTab 不一定当场炸：
 *   · 弦号写反了 → 谱面看着正常，声音全错
 *   · 时值写错 → 小节拍数对不上，但 alphaTab 会自动补/截，界面看不出来
 *   · `:8(0.1 …)` 忘了空格 → 解析出来的音完全是另一个意思
 * 所以在把一份谱面放进 `songs/<id>/` 之前，用**真正的 alphaTab** 解析一遍、
 * 再把「定弦 + 品 + 弦 → 实音」这条恒等式逐音核一遍，是最省事的保险。
 *
 * 用法
 * ----
 *   pnpm tex:verify                                          # 不加参数 = 扫 songs/<id>/score.tex 全跑一遍
 *   node scripts/verify-tex.mjs songs/senbonzakura/score.tex
 *   node scripts/verify-tex.mjs a.tex --against b.tex          # 两份 tex 逐拍比对
 *   node scripts/verify-tex.mjs a.tex --against-xml in.musicxml # tex 与 MusicXML 逐拍比对
 *   node scripts/verify-tex.mjs songs/senbonzakura/score.tex songs/qingtian-intro/score.tex
 *
 * 退出码：0 = 全部通过；1 = 有错误（解析失败 / 恒等式不成立 / 小节拍数不对 / 比对不一致）
 */

import * as alphaTab from '@coderline/alphatab';
import fs from 'node:fs';
import path from 'node:path';

// alphaTab 的 BrushType 枚举值（在 1.8.4 上实测：1=BrushUp 2=BrushDown 3=ArpeggioUp 4=ArpeggioDown）
const BRUSH_NAME = { 1: 'bu', 2: 'bd', 3: 'au', 4: 'ad' };

const TICKS_PER_QUARTER = 960;

const settings = new alphaTab.Settings();

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

function parseTex(file) {
  const tex = fs.readFileSync(file, 'utf8');
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString(tex, settings);

  const diagnostics = [];
  const collect = (bag, prefix) => {
    if (!bag) return;
    for (const d of bag.items) {
      diagnostics.push({
        code: `${prefix}${d.code}`,
        severity: d.severity, // 0=Hint 1=Warning 2=Error
        message: d.message,
      });
    }
  };
  collect(importer.lexerDiagnostics, 'lexer/');
  collect(importer.parserDiagnostics, 'parser/');
  collect(importer.semanticDiagnostics, 'semantic/');

  let score = null;
  let fatal = null;
  try {
    score = importer.readScore();
  } catch (e) {
    fatal = e.message;
  }
  return { tex, score, diagnostics, fatal };
}

/** 把一份 score 拍平成「小节 → 拍 → 音」的纯数据，方便比对 */
function flatten(score) {
  const staff = score.tracks[0].staves[0];
  // staff.tuning 是裸 MIDI 音高（index 0 = 第 1 弦 = 最高音弦），
  // 这里同时留一份给肉眼看的文本形式
  const tuning = staff.tuning.slice();
  const tuningText = tuning.map((t) => alphaTab.model.Tuning.getTextForTuning(t, true));
  const bars = [];
  for (const bar of staff.bars) {
    const beats = [];
    for (const voice of bar.voices) {
      for (const b of voice.beats) {
        beats.push({
          ticks: b.playbackDuration,
          rest: b.isEmpty,
          brush: b.brushType || 0,
          notes: b.notes.map((n) => ({
            string: n.string,
            // 换算回 alphaTex 的 `品.弦` 编号，方便和 MusicXML / 手写谱面直接对
            texString: tuning.length - n.string + 1,
            fret: n.fret,
            real: n.realValue,
            // ⚠️ 关键：alphaTab 内部的 Note.string 与 alphaTex 的 `品.弦` 是**反向**编号
            //    （alphaTex 弦 1 = 最高音弦 A，Note.string 1 = 最低音弦 G）。
            //    n.stringTuning 是已经换算好的「这根弦的空弦音」，用它算实音才不会翻车。
            openPitch: n.stringTuning,
            dead: n.isDead,
            hammer: n.isHammerPullOrigin,
            tie: n.isTieDestination,
            letRing: n.isLetRing,
            staccato: n.isStaccato,
            palmMute: n.isPalmMute,
            ghost: n.isGhost,
            accentuated: n.accentuated || 0,
            harmonic: n.harmonicType || 0,
          })),
        });
      }
    }
    bars.push({
      beats,
      numerator: bar.masterBar.timeSignatureNumerator,
      denominator: bar.masterBar.timeSignatureDenominator,
    });
  }
  return {
    tuning,
    tuningText,
    program: score.tracks[0].playbackInfo.program,
    tempo: score.tempo,
    title: score.title,
    bars,
  };
}

function noteKey(n) {
  return (n.dead ? 'x' : n.fret) + '.' + (n.texString ?? n.string);
}

function beatKey(beat, opts = {}) {
  const body = beat.rest ? 'r' : beat.notes.map(noteKey).join('+');
  if (opts.ignoreBrush) return body;
  return body + (beat.brush ? '{' + (BRUSH_NAME[beat.brush] || beat.brush) + '}' : '');
}

// ---------------------------------------------------------------------------
// 检查
// ---------------------------------------------------------------------------

function check(file, flat) {
  const errors = [];
  const notes = flat.bars.flatMap((b) => b.beats).flatMap((b) => b.notes);

  // 1) 逐音校验「空弦音 + 品 = 实音」——弦号写反、定弦写错的唯一可靠探针
  if (flat.tuningText.length !== 4) {
    errors.push(`定弦不是 4 根（${flat.tuningText.join(' ')}），尤克里里谱面这不是正常情况`);
  }
  let mismatched = 0;
  for (let bi = 0; bi < flat.bars.length; bi++) {
    for (const beat of flat.bars[bi].beats) {
      for (const n of beat.notes) {
        if (n.dead) continue;
        const expectedMidi = n.openPitch + n.fret;
        if (expectedMidi !== n.real) {
          mismatched++;
          if (mismatched <= 5) {
            const openNum = alphaTab.model.Tuning.getTextForTuning(n.openPitch, true);
            errors.push(
              `第 ${bi + 1} 小节：弦 ${n.string}（空弦 ${openNum}）+ 品 ${n.fret} ` +
                `应为 MIDI ${expectedMidi}，解析出来是 ${n.real}`
            );
          }
        }
      }
    }
  }
  if (mismatched > 5) errors.push(`……共 ${mismatched} 个音的实音对不上（弦号/定弦有问题）`);

  // 2) 小节时值必须与拍号吻合
  const barDurations = [];
  for (let i = 0; i < flat.bars.length; i++) {
    const bar = flat.bars[i];
    const actual = bar.beats.reduce((s, b) => s + b.ticks, 0);
    const expected = bar.numerator * (4 / bar.denominator) * TICKS_PER_QUARTER;
    barDurations.push({ actual, expected });
    if (actual !== expected) {
      errors.push(
        `第 ${i + 1} 小节时值 ${actual} tick，拍号 ${bar.numerator}/${bar.denominator} 要求 ${expected} tick`
      );
    }
  }

  return { errors, notes, barDurations };
}

// ---------------------------------------------------------------------------
// 比对
// ---------------------------------------------------------------------------

function compare(labelA, A, labelB, B, opts = {}) {
  const problems = [];
  if (A.bars.length !== B.bars.length) {
    problems.push(`小节数不同：${labelA} ${A.bars.length} vs ${labelB} ${B.bars.length}`);
  }
  const n = Math.max(A.bars.length, B.bars.length);
  let diffBars = 0;
  for (let i = 0; i < n; i++) {
    const a = (A.bars[i]?.beats || []).map((b) => beatKey(b, opts));
    const b = (B.bars[i]?.beats || []).map((b) => beatKey(b, opts));
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diffBars++;
      if (diffBars <= 4) {
        problems.push(`第 ${i + 1} 小节不同：\n      ${labelA}: ${a.join(' ')}\n      ${labelB}: ${b.join(' ')}`);
      }
    }
  }
  if (diffBars > 4) problems.push(`……共 ${diffBars} 个小节不同`);
  return problems;
}

/** 从 MusicXML 里抽同样形状的数据（不经过 alphaTab，避免它自带的定弦方向问题） */
function flattenXml(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const barBlocks = xml.match(/<measure[\s\S]*?<\/measure>/g) || [];
  const bars = barBlocks.map((block) => {
    const beats = [];
    let cluster = null;
    for (const nm of block.match(/<note>[\s\S]*?<\/note>/g) || []) {
      const ticks = Number((nm.match(/<duration>(\d+)<\/duration>/) || [0, 0])[1]);
      const isChord = /<chord\s*\/>/.test(nm);
      const isRest = /<rest\s*\/?>/.test(nm);
      const isDead = /<notehead>x<\/notehead>/.test(nm) || /<unpitched>/.test(nm);
      const stringNo = Number((nm.match(/<string>(\d+)<\/string>/) || [0, 0])[1]);
      const fret = Number((nm.match(/<fret>(-?\d+)<\/fret>/) || [0, 0])[1]);
      const brush = /<arpeggiate[^>]*direction="down"/.test(nm)
        ? 'ad'
        : /<arpeggiate[^>]*direction="up"/.test(nm)
          ? 'au'
          : '';
      if (isChord && cluster) {
        cluster.notes.push({ string: stringNo, fret, dead: isDead });
        continue;
      }
      cluster = { ticks, rest: isRest, brush, notes: [] };
      if (!isRest) cluster.notes.push({ string: stringNo, fret, dead: isDead });
      beats.push(cluster);
    }
    return { beats };
  });
  return { bars };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  let against = null;
  let againstXml = null;
  let ignoreBrush = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--against') against = argv[++i];
    else if (argv[i] === '--against-xml') againstXml = argv[++i];
    else if (argv[i] === '--ignore-brush') ignoreBrush = true;
    else files.push(argv[i]);
  }
  if (files.length === 0) {
    // 不加参数就扫 songs/<id>/score.tex —— 这样「改完谱面 → pnpm tex:verify」
    // 是一条真的能一口气跑完的命令，而不是还要手打三个路径。
    const songsDir = path.resolve(process.cwd(), 'songs');
    let ids = [];
    try {
      ids = fs
        .readdirSync(songsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      ids = [];
    }
    for (const id of ids) {
      const f = path.join(songsDir, id, 'score.tex');
      if (fs.existsSync(f)) files.push(path.relative(process.cwd(), f));
    }
    if (files.length === 0) {
      console.error(
        '用法: node scripts/verify-tex.mjs <score.tex> [--against other.tex] [--against-xml in.musicxml] [--ignore-brush]\n' +
          '      （不加参数时自动扫 songs/<id>/score.tex，当前没扫到）'
      );
      process.exit(2);
    }
    console.log(`（未指定文件，自动扫到 ${files.length} 份谱面）`);
  }
  const opts = { ignoreBrush };

  let failed = false;

  for (const file of files) {
    const label = path.isAbsolute(file) ? file : path.relative(process.cwd(), file);
    console.log(`\n=== ${label} ===`);

    const { score, diagnostics, fatal } = parseTex(file);
    const errors = diagnostics.filter((d) => d.severity === 2);
    const warns = diagnostics.filter((d) => d.severity === 1);

    for (const w of warns) console.log(`  · ${w.code} ${w.message}`);
    for (const e of errors) console.log(`  ✗ ${e.code} ${e.message}`);
    if (fatal) {
      console.log(`  ✗ 解析失败：${fatal}`);
      failed = true;
      continue;
    }

    const flat = flatten(score);
    console.log(
      `  小节 ${flat.bars.length} · 拍 ${flat.bars.reduce((s, b) => s + b.beats.length, 0)} · ` +
        `音 ${flat.bars.flatMap((b) => b.beats).flatMap((b) => b.notes).length} · ` +
        `定弦 ${flat.tuningText.join(' ')} · tempo ${flat.tempo} · program ${flat.program}`
    );

    const { errors: checkErrors } = check(file, flat);
    for (const e of checkErrors) {
      console.log(`  ✗ ${e}`);
      failed = true;
    }
    if (errors.length === 0 && checkErrors.length === 0) {
      console.log('  ✓ 解析无错、逐音恒等式成立、每小节时值与拍号吻合');
    }

    if (against) {
      const { score: other, fatal: otherFatal } = parseTex(against);
      if (otherFatal) {
        console.log(`  ✗ --against ${against} 解析失败：${otherFatal}`);
        failed = true;
      } else {
        const problems = compare(label, flat, path.basename(against), flatten(other), opts);
        if (problems.length === 0) console.log(`  ✓ 与 ${path.basename(against)} 逐拍一致`);
        else {
          for (const p of problems) console.log(`  ✗ ${p}`);
          failed = true;
        }
      }
    }

    if (againstXml) {
      const problems = compare(label, flat, path.basename(againstXml), flattenXml(againstXml), opts);
      if (problems.length === 0) {
        console.log(
          `  ✓ 与 ${path.basename(againstXml)} 逐拍一致（品/弦/时值${ignoreBrush ? '' : '/刷弦'}）`
        );
      } else {
        for (const p of problems) console.log(`  ✗ ${p}`);
        failed = true;
      }
    }
  }

  console.log('');
  if (failed) {
    console.log('结果：有问题，先修再放进 songs/。');
    process.exit(1);
  }
  console.log('结果：全部通过。');
}

main();
