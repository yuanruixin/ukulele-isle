import { siteConfig } from "../config/site.config";
import HomeScene from "../components/scene/HomeScene";

/**
 * 首页：**一幕猫咖，占满全屏**（src/components/scene/HomeScene.tsx）。
 *
 * 原先这里有「站点名 + 副标题 + 一排小猫 + 两张入口卡片」，四样都已撤掉 / 合并：
 *   · 站名与副标题 → 撤掉。首页不做"信息罗列"，只做"一个地方"；
 *     站名在导航栏左上角一直挂着，副标题也在那儿（见 NavBar）；
 *   · 那排猫交给了 flex 等分父容器宽度 ⇒ 同宽、等距、同一条底线，像尺子量出来的；
 *   · 卡片是"贴在场景边上的按钮"，和场景本身没有关系 —— 现在入口就是场景里
 *     挂在屋顶的两块吊牌，长在场景上。
 *
 * ★ 为什么首页要**全屏**：场景是首页唯一的内容，留一圈页面留白 + 圆角边框，
 *   它就退回成"页面里的一块插图"了。所以：不要 max-w、不要内边距、不要圆角，
 *   高度直接取「视口减导航栏」（见 globals.css 的 .home-stage）。
 *
 * ⚠️ 场景是首页唯一的入口，但**关掉它也不会走投无路** —— 曲谱 / 工具在导航栏里
 *   本来就各有一个入口（见 siteConfig.nav）。真要临时拿掉场景，
 *   把 siteConfig.scene.enabled 改成 false 即可，本文件会自动退回"只有站名"的那一版。
 */
export default function HomePage() {
  if (!siteConfig.scene.enabled) {
    return (
      <main className="mx-auto max-w-5xl px-5 pb-24">
        <section className="pt-10 text-center sm:pt-14">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {siteConfig.siteName}
          </h1>
          <p className="text-secondary mt-2.5 text-base sm:text-lg">{siteConfig.tagline}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="home-stage">
      <HomeScene />
    </main>
  );
}
