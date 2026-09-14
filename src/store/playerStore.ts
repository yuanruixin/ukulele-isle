import { create } from "zustand";
import { siteConfig } from "../config/site.config";

/** 播放器全局状态：播放中、速度、静音、高亮 */
interface PlayerState {
  isPlaying: boolean;
  playerReady: boolean;
  speed: number;
  muted: boolean;
  beatHighlight: boolean;
  setPlaying: (v: boolean) => void;
  setPlayerReady: (v: boolean) => void;
  setSpeed: (v: number) => void;
  toggleMute: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  playerReady: false,
  speed: siteConfig.player.defaultSpeed,
  muted: false,
  beatHighlight: siteConfig.player.beatHighlight,
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlayerReady: (playerReady) => set({ playerReady }),
  setSpeed: (speed) => set({ speed }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
}));
