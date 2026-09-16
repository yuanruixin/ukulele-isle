import { Link } from "react-router-dom";
import { songs } from "../songs";
import { siteConfig } from "../config/site.config";

/** 首页：叙事区（站点名 + 副标题）+ 曲谱库 / 工具 入口卡片 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24">
      <section className="py-14 text-center sm:py-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {siteConfig.siteName}
        </h1>
        <p className="text-secondary mt-3 text-lg">{siteConfig.tagline}</p>
      </section>

      <section className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
        <Link to="/songs" className="card block p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold tracking-tight">曲谱库</h3>
              <p className="text-secondary mt-1 text-sm leading-relaxed">
                {songs.length} 首谱子，搜索即达
              </p>
            </div>
            <span
              className="mt-1 shrink-0 text-xl"
              style={{ color: "var(--accent)" }}
              aria-hidden
            >
              ›
            </span>
          </div>
        </Link>

        <Link to="/tools" className="card block p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold tracking-tight">工具</h3>
              <p className="text-secondary mt-1 text-sm leading-relaxed">
                调音器、节拍器、和弦库
              </p>
            </div>
            <span
              className="mt-1 shrink-0 text-xl"
              style={{ color: "var(--accent)" }}
              aria-hidden
            >
              ›
            </span>
          </div>
        </Link>
      </section>
    </main>
  );
}
