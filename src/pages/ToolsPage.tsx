import { Link } from "react-router-dom";
import { siteConfig, type ToolItem } from "../config/site.config";
import { TOOL_ICONS } from "../components/icons";

/** 单张工具卡片：已实现的可以点击进入，规划中的置灰（当前三个都已实现） */
function ToolCard({ tool }: { tool: ToolItem }) {
  const Icon = TOOL_ICONS[tool.icon];
  const inner = (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {/* 图标徽标：图标描边取 currentColor，所以颜色由外面的 text-* 决定 */}
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: tool.to ? "var(--accent)" : "var(--text-secondary)" }}
          aria-hidden
        >
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">{tool.name}</h3>
          <p className="text-secondary mt-0.5 text-sm">{tool.description}</p>
        </div>
      </div>

      {tool.badge ? (
        <span
          className="text-secondary shrink-0 rounded-full px-2.5 py-1 text-xs"
          style={{ background: "var(--border)" }}
        >
          {tool.badge}
        </span>
      ) : (
        <span
          className="shrink-0 text-xl"
          style={{ color: "var(--accent)" }}
          aria-hidden
        >
          ›
        </span>
      )}
    </div>
  );

  if (!tool.to) {
    return (
      <div className="card p-6" style={{ opacity: 0.62 }}>
        {inner}
      </div>
    );
  }

  return (
    <Link to={tool.to} className="card block p-6">
      {inner}
    </Link>
  );
}

/** 工具页：练琴小工具入口（调音器 / 和弦库 / 虚拟尤克里里） */
export default function ToolsPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24">
      <section className="py-12 text-center sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">工具</h1>
        <p className="text-secondary mt-2 text-[15px]">练琴路上的小帮手</p>
      </section>

      <section className="mx-auto grid max-w-2xl gap-4">
        {siteConfig.tools.items.map((tool) => (
          <ToolCard key={tool.name} tool={tool} />
        ))}
      </section>
    </main>
  );
}
