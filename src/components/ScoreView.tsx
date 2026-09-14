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
  const { setPlaying, setPlayerReady, speed, loop } = usePlayerStore();

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
        resources,
      },
      player: {
        enablePlayer: true,
        soundFont: "/soundfont/sonivox.sf2",
        enableCursor: siteConfig.player.beatHighlight,
        enableAnimatedBeatCursor: siteConfig.player.beatHighlight,
        enableUserInteraction: true, // 点击谱面跳转播放位置
      },
    } as alphaTab.json.SettingsJson);
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

  // 速度 / 循环同步到播放器
  useEffect(() => {
    if (apiRef.current) apiRef.current.playbackSpeed = speed;
  }, [speed, apiRef]);
  useEffect(() => {
    if (apiRef.current) apiRef.current.isLooping = loop;
  }, [loop, apiRef]);

  return (
    <div className="card overflow-x-auto p-4 sm:p-6">
      <div ref={containerRef} />
    </div>
  );
}
