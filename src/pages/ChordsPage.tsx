import { useMemo } from "react";
import { siteConfig } from "../config/site.config";
import { strumTiming } from "../lib/chord";
import { useChordPlayer } from "../hooks/useChordPlayer";
import ChordCard from "../components/chords/ChordCard";

/**
 * 和弦库：网格卡片，点一下试听。
 * 移动端 2×2、PC 一行四个 —— 与 siteConfig.chords.items 的数组顺序一致（C 调 I–IV–vi–V）。
 *
 * 页面本身不导入 alphaTab（它由 useChordPlayer 动态 import），
 * 所以首屏只有指法图，4MB 左右的音色是在后台空闲时才去取的。
 */
export default function ChordsPage() {
  const { items, volume, strumSpreadMs, ringSeconds, tuning } =
    siteConfig.chords;

  const { status, error, activeName, play } = useChordPlayer({
    chords: items,
    tuning,
    strumSpreadMs,
    ringSeconds,
    volume,
  });

  /** 图上的点亮节奏 = 实际扫弦每根弦的间隔，两边用同一组数字 */
  const stepMs = useMemo(
    () => strumTiming(items[0]?.frets.length ?? 4, { strumSpreadMs, ringSeconds }).stepMs,
    [items, strumSpreadMs, ringSeconds],
  );

  const caption =
    status === "error"
      ? null
      : status === "preparing"
        ? "正在准备音色…（现在点也行，就绪后会自动响）"
        : activeName
          ? `${activeName} · 从 4 弦扫到 1 弦`
          : "点一下和弦，听它响一次";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-5 pb-16 md:max-w-lg lg:max-w-3xl">
      <header className="py-8 text-center sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          和弦库
        </h1>
        <p className="text-secondary mt-1 text-xs sm:text-sm">
          {siteConfig.tuner.instrument} · 标准调弦 GCEA
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {items.map((chord) => (
          <ChordCard
            key={chord.name}
            chord={chord}
            active={activeName === chord.name}
            revealStepMs={stepMs}
            onPlay={play}
          />
        ))}
      </section>

      {error ? (
        <p
          className="mt-4 text-center text-xs leading-relaxed"
          style={{ color: "#ff3b30" }}
        >
          {error}
        </p>
      ) : (
        <p className="text-secondary mt-4 text-center text-xs">{caption}</p>
      )}
    </main>
  );
}
