import { create } from "zustand";
import { siteConfig } from "../config/site.config";

/** 外观模式：只有亮 / 暗两态（首次进入按系统推断，之后记住用户的选择） */
export type ThemeMode = "light" | "dark";

/** 浏览器地址栏 / 状态栏配色（写入 <meta name="theme-color">） */
const THEME_COLORS: Record<ThemeMode, string> = {
  light: "#f5f5f7",
  dark: "#000000",
};

const STORAGE_KEY = siteConfig.theme.storageKey;

function systemMode(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** 读用户上次的选择；没选过返回 null（表示「跟随系统」） */
function readSaved(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/**
 * 把外观写到 <html data-theme> 上——所有主题 CSS 变量都挂在这个属性上（见 styles/globals.css）。
 * ⚠️ index.html 里还有一段首帧脚本做同样的事（避免刷新时闪一下相反底色），
 *    改动这里的判定逻辑或键名时，那段脚本要同步改。
 */
export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[mode]);
}

const saved = readSaved();
const initial: ThemeMode =
  saved ??
  (siteConfig.theme.defaultMode === "system"
    ? systemMode()
    : siteConfig.theme.defaultMode);
applyTheme(initial);

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initial,
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* 隐私模式下写不进去，不影响本次会话的切换 */
    }
    applyTheme(mode);
    set({ mode });
  },
  toggle: () => get().setMode(get().mode === "dark" ? "light" : "dark"),
}));

// 用户还没手动选过时，跟随系统外观的实时变化（选过之后就固定为用户的选择）
if (!saved) {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      const mode: ThemeMode = e.matches ? "dark" : "light";
      applyTheme(mode);
      useThemeStore.setState({ mode });
    });
}
