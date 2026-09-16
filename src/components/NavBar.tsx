import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { siteConfig } from "../config/site.config";
import ThemeSwitch from "./ThemeSwitch";

/** 曲谱入口在歌曲详情页（/song/:id）下也算激活态 */
function useActive(to: string): boolean {
  const { pathname } = useLocation();
  if (to === "/songs") return pathname === "/songs" || pathname.startsWith("/song/");
  return pathname === to || pathname.startsWith(to + "/");
}

function NavItem({
  to,
  label,
  stacked,
  last,
}: {
  to: string;
  label: string;
  stacked?: boolean;
  /** 移动端菜单里的最后一项：不画下分隔线 */
  last?: boolean;
}) {
  const active = useActive(to);
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={
        stacked
          ? `mobile-nav-item block px-2 py-4 text-lg font-medium${last ? " is-last" : ""}`
          : "rounded-full px-3.5 py-1.5 text-sm transition-colors"
      }
      style={{
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </Link>
  );
}

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // 路由变化时自动收起移动端菜单
  useEffect(() => setOpen(false), [pathname]);

  // 全屏菜单打开时锁定背景滚动
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="glass sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
          <Link to="/" className="brand-lockup flex items-center gap-2" aria-label={siteConfig.siteName}>
            <img src="/icons/music-cat-32.png" alt="" className="brand-mark" />
            <span className="text-lg font-semibold tracking-tight">
              {siteConfig.siteName}
            </span>
            <span className="text-secondary hidden text-xs sm:inline">
              {siteConfig.tagline}
            </span>
          </Link>

          {/* 桌面端：入口平铺在右侧，末尾是外观开关（竖线分隔导航与开关） */}
          <nav className="hidden items-center gap-1 sm:flex">
            {siteConfig.nav.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} />
            ))}
            <span
              className="mx-2 h-4 w-px"
              style={{ background: "var(--tick)" }}
              aria-hidden="true"
            />
            <ThemeSwitch />
          </nav>

          {/* 移动端：右上角汉堡按钮，点击后三条横线变为叉号 */}
          <button
            type="button"
            className={`menu-btn flex flex-col items-center justify-center sm:hidden ${open ? "open" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "关闭菜单" : "打开菜单"}
            aria-expanded={open}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      {/* 移动端全屏菜单：纯色浮层覆盖整个窗口（导航栏在更高层保留叉号），选项从上到下依次排列。
          注意：必须渲染在 header 之外——header 的 backdrop-filter 会成为 fixed 后代的包含块，
          放在 header 里面 fixed inset-0 只会盖住导航栏一条 */}
      {open && (
        <nav
          className="mobile-menu fixed inset-0 z-40 sm:hidden"
          style={{ background: "var(--bg)" }}
        >
          {/* pt-14 避开吸顶导航栏，选项从导航栏下方开始排列 */}
          <div className="mx-auto flex max-w-4xl flex-col px-5 pt-14">
            {siteConfig.nav.map((item, i) => (
              <div
                key={item.to}
                className="mobile-menu-item"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <NavItem
                  to={item.to}
                  label={item.label}
                  stacked
                  last={i === siteConfig.nav.length - 1}
                />
              </div>
            ))}

            {/* 外观：与上方导航入口不同的独立区块——卡片里一行「外观 + 开关」，
                不跳转任何页面，所以做成卡片而不是列表项 */}
            <div
              className="mobile-theme-card mt-8 flex items-center justify-between px-4 py-3.5"
              style={{ animationDelay: `${siteConfig.nav.length * 60}ms` }}
            >
              <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
                外观
              </span>
              <ThemeSwitch label="切换外观" />
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
