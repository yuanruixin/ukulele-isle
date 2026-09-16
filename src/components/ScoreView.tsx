import { useEffect, useRef } from "react";
import * as alphaTab from "@coderline/alphatab";
import { siteConfig } from "../config/site.config";
import { usePlayerStore } from "../store/playerStore";
import type { Song } from "../types/song";

interface Props {
  song: Song;
  apiRef: React.MutableRefObject<alphaTab.AlphaTabApi | null>;
}

/** 谱面视图：alphaTab 渲染 TAB 四线谱 + 播放光标/节拍高亮 */
export default function ScoreView({ song, apiRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setPlaying, setPlayerReady, speed, muted } = usePlayerStore();
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  // 初始化 alphaTab（每首歌一次）
  useEffect(() => {
    if (!containerRef.current) return;

    // 深色模式下谱面使用浅色系
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resources = dark
      ? {
          staffLineColor: "#98989d",
          barSeparatorColor: "#636366",
          mainGlyphColor: "#f5f5f7",
          secondaryGlyphColor: "#98989d",
          scoreInfoColor: "#f5f5f7",
          barNumberColor: "#98989d",
        }
      : {};

    // 官方推荐的 JSON 配置方式初始化
    const api = new alphaTab.AlphaTabApi(containerRef.current, {
      core: {
        fontDirectory: "/font/",
        tex: true,
      },
      display: {
        scale: siteConfig.player.scale,
        // Parchment 布局：按 score 模型中的排版信息（行节数 / 节宽比例）渲染，
        // 配合下方 scoreLoaded 中的 systemsLayout + displayScale 实现行内小节等宽。
        // 注意：Parchment 模式下 barsPerRow 设置不生效，行节数由 score.systemsLayout 决定。
        layoutMode: siteConfig.player.equalBarWidth ? "parchment" : "page",
        // Page 布局下固定每行小节数（Parchment 模式忽略此项）
        barsPerRow: siteConfig.player.barsPerRow,
        resources,
      },
      notation: {
        elements: {
          // 页面头部已展示标题/艺术家，隐藏谱面内置信息块避免重复与挤压
          scoreTitle: false,
          scoreSubtitle: false,
          scoreArtist: false,
          scoreAlbum: false,
          scoreWords: false,
          scoreMusic: false,
          scoreWordsAndMusic: false,
        },
      },
      player: {
        enablePlayer: true,
        soundFont: "/soundfont/sonivox.sf3", // sf3 比 sf2 小 ~28%，音质相当
        enableCursor: siteConfig.player.beatHighlight,
        enableAnimatedBeatCursor: siteConfig.player.beatHighlight,
        enableUserInteraction: true, // 点击谱面跳转播放位置
      },
    } as unknown as alphaTab.json.SettingsJson);
    apiRef.current = api;

    api.playerReady.on(() => setPlayerReady(true));
    api.playerStateChanged.on(({ state }) =>
      setPlaying(state === alphaTab.synth.PlayerState.Playing)
    );
    api.error.on((e) => console.error("[alphaTab]", e));
    // 仅显示 TAB 四线谱（隐藏五线谱）
    api.scoreLoaded.on((score) => {
      for (const track of score.tracks) {
        for (const staff of track.staves) {
          staff.showStandardNotation = false;
          staff.showTablature = true;
        }
      }
      if (siteConfig.player.equalBarWidth) {
        // Parchment 布局的排版信息来自模型。注意：单轨渲染时行节数读的是
        // 【track 级】systemsLayout/defaultSystemsLayout（score 级仅多轨时生效），
        // 且 systemsLayout 数组优先于 defaultSystemsLayout，两者都要设。
        // 窄屏（手机）自动降为每行 1 节，避免音符挤在一起
        const perRow = window.matchMedia("(max-width: 639px)").matches
          ? siteConfig.player.barsPerRowMobile
          : siteConfig.player.barsPerRow;
        const rows = Array.from(
          { length: Math.ceil(score.masterBars.length / perRow) },
          () => perRow
        );
        for (const track of score.tracks) {
          track.defaultSystemsLayout = perRow;
          track.systemsLayout = rows;
        }
        // 行内等宽：各节宽度权重相同（默认即为 1，显式设置以防谱面自带值）
        for (const mb of score.masterBars) mb.displayScale = 1;
      }
      api.render();
    });

    api.tex(song.scoreTex);

    return () => {
      api.destroy();
      apiRef.current = null;
      setPlaying(false);
      setPlayerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, song.scoreTex]); // scoreTex 入依赖：HMR 热更新谱面内容时也能重渲染

  // 速度 / 静音同步到播放器
  useEffect(() => {
    if (apiRef.current) apiRef.current.playbackSpeed = speed;
  }, [speed, apiRef]);
  useEffect(() => {
    if (apiRef.current) apiRef.current.masterVolume = muted ? 0 : 1;
  }, [muted, apiRef]);

  return (
    // playing 类控制光标/高亮显隐（见 globals.css）；移动端减小内边距给谱面让出宽度
    <div
      className={`card score-view overflow-x-auto p-2 sm:p-6${isPlaying ? " playing" : ""}`}
    >
      <div ref={containerRef} />
    </div>
  );
}
