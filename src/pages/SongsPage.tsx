import { useMemo, useState } from "react";
import { searchSongs } from "../songs";
import { siteConfig } from "../config/site.config";
import SongCard from "../components/SongCard";

/** 曲谱库页：搜索框 + 歌曲卡片列表（自原首页迁入） */
export default function SongsPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchSongs(query), [query]);

  return (
    <main className="mx-auto max-w-4xl px-5 pb-24">
      <section className="py-12 text-center sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">曲谱库</h1>
        <p className="text-secondary mt-2 text-[15px]">
          挑一首喜欢的歌，开始练习
        </p>
      </section>

      <div className="mx-auto max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={siteConfig.search.placeholder}
          className="card w-full px-5 py-3.5 text-[15px] outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as string]: "var(--accent)" }}
        />
      </div>

      <section className="mx-auto mt-10 grid max-w-2xl gap-4">
        {results.length > 0 ? (
          results.map((s) => <SongCard key={s.id} song={s} />)
        ) : (
          <p className="text-secondary py-16 text-center text-sm">
            没有找到「{query}」相关的歌曲
          </p>
        )}
      </section>
    </main>
  );
}
