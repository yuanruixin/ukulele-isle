import * as alphaTab from "@coderline/alphatab";
import { siteConfig } from "../config/site.config";
import { usePlayerStore } from "../store/playerStore";

interface Props {
  apiRef: React.MutableRefObject<alphaTab.AlphaTabApi | null>;
}

/** 底部播放控制条：播放/暂停、速度、循环练习 */
export default function PlayerBar({ apiRef }: Props) {
  const { isPlaying, playerReady, speed, loop, setSpeed, toggleLoop } =
    usePlayerStore();

  return (
    <div className="glass fixed inset-x-0 bottom-0 z-50 border-b-0 border-t">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-5">
        <button
          onClick={() => apiRef.current?.playPause()}
          disabled={!playerReady}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40"
          style={{ background: "var(--accent)" }}
          aria-label={isPlaying ? "暂停" : "播放"}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="4" height="12" rx="1" />
              <rect x="9" y="1" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 1.5v11c0 .8.9 1.3 1.6.9l8-5.5c.6-.4.6-1.4 0-1.8l-8-5.5C3.9.2 3 .7 3 1.5z" />
            </svg>
          )}
        </button>

        <div className="segmented" role="group" aria-label="播放速度">
          {siteConfig.player.speedOptions.map((s) => (
            <button
              key={s}
              className={s === speed ? "active" : ""}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>

        <button
          onClick={toggleLoop}
          className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
          style={{
            background: loop ? "var(--accent)" : "var(--border)",
            color: loop ? "#fff" : "var(--text-secondary)",
          }}
        >
          循环练习
        </button>
      </div>
    </div>
  );
}
