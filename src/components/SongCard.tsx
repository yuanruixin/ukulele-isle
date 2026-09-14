import { Link } from "react-router-dom";
import type { SongMeta } from "../types/song";

export default function SongCard({ song }: { song: SongMeta }) {
  return (
    <Link to={`/song/${song.id}`} className="card block p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight">
            {song.title}
          </h3>
          <p className="text-secondary mt-0.5 text-sm">{song.artist}</p>
          {song.description && (
            <p className="text-secondary mt-3 line-clamp-2 text-sm leading-relaxed">
              {song.description}
            </p>
          )}
        </div>
        <span
          className="mt-1 shrink-0 text-xl"
          style={{ color: "var(--accent)" }}
          aria-hidden
        >
          ›
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
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
    </Link>
  );
}
