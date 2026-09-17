import { Link } from "react-router-dom";
import { songs } from "../songs";
import { siteConfig } from "../config/site.config";
import CatMotion from "../components/cats/CatMotion";

/**
 * 首页：叙事区（站点名 + 副标题 + 一排小猫）+ 曲谱库 / 工具 入口卡片。
 *
 * 小猫是纯装饰（把鼠标放上去会抬身歪头，点一下朝你点的地方跳一步）；
 * 要在首页去掉它，把 siteConfig.cats.enabled 改成 false 即可，这里一行都不用动。
 */
export default function HomePage() {
  const { enabled: catsOn } = siteConfig.cats;
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24">
      <section className="py-14 text-center sm:py-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {siteConfig.siteName}
        </h1>
        <p className="text-secondary mt-3 text-lg">{siteConfig.tagline}</p>
        {catsOn && <CatMotion className="mt-9 sm:mt-12" />}
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
                调音器、和弦库、虚拟尤克里里
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
