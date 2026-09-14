import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import * as alphaTab from "@coderline/alphatab";
import { getSong } from "../songs";
import ScoreView from "../components/ScoreView";
import PlayerBar from "../components/PlayerBar";

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const song = id ? getSong(id) : undefined;
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  if (!song) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-24 text-center">
        <p className="text-secondary">没有找到这首歌曲。</p>
        <Link
          to="/"
          className="mt-4 inline-block text-sm font-medium"
          style={{ color: "var(--accent)" }}
        >
          返回首页
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 pb-28">
      <nav className="py-4">
        <Link
          to="/"
          className="text-sm font-medium"
          style={{ color: "var(--accent)" }}
        >
          ‹ 所有歌曲
        </Link>
      </nav>

      <header className="pb-6">
        <h1 className="text-3xl font-bold tracking-tight">{song.title}</h1>
        <p className="text-secondary mt-1">{song.artist}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {song.tags.map((t) => (
            <span
              key={t}
              className="text-secondary rounded-full px-2.5 py-0.5 text-xs"
              style={{ background: "var(--border)" }}
            >
              {t}
            </span>
          ))}
        </div>
      </header>

      <ScoreView song={song} apiRef={apiRef} />
      <PlayerBar apiRef={apiRef} />
    </main>
  );
}
