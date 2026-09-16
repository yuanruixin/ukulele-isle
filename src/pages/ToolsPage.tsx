import { siteConfig } from "../config/site.config";

/** 工具页：占位展示规划中的练琴工具，后续逐个实现 */
export default function ToolsPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24">
      <section className="py-12 text-center sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">工具</h1>
        <p className="text-secondary mt-2 text-[15px]">练琴路上的小帮手</p>
      </section>

      <section className="mx-auto grid max-w-2xl gap-4">
        {siteConfig.tools.items.map((tool) => (
          <div key={tool.name} className="card p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                {/* 首字徽标 */}
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                  aria-hidden
                >
                  {tool.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {tool.name}
                  </h3>
                  <p className="text-secondary mt-0.5 text-sm">
                    {tool.description}
                  </p>
                </div>
              </div>
              {tool.badge && (
                <span
                  className="text-secondary shrink-0 rounded-full px-2.5 py-1 text-xs"
                  style={{ background: "var(--border)" }}
                >
                  {tool.badge}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
