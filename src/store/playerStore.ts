import { create } from "zustand";
import { siteConfig } from "../config/site.config";

/** 播放器全局状态：播放中、速度、循环、高亮 */
interface PlayerState {
  isPlaying: boolean;
  playerReady: boolean;
  speed: number;
  loop: boolean;
  beatHighlight: boolean;
  setPlaying: (v: boolean) => void;
  setPlayerReady: (v: boolean) => void;
  setSpeed: (v: number) => void;
  toggleLoop: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  playerReady: false,
  speed: siteConfig.player.defaultSpeed,
  loop: siteConfig.player.loop,
  beatHighlight: siteConfig.player.beatHighlight,
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlayerReady: (playerReady) => set({ playerReady }),
  setSpeed: (speed) => set({ speed }),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
}));
