import { useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";
import { siteConfig } from "../config/site.config";
import { usePlayerStore } from "../store/playerStore";

interface Props {
  apiRef: React.MutableRefObject<alphaTab.AlphaTabApi | null>;
}

/** 底部播放控制条：声音开关(左) / 播放暂停(居中) / 速度弹出选项(右) */
export default function PlayerBar({ apiRef }: Props) {
  const { isPlaying, playerReady, speed, muted, setSpeed, toggleMute } =
    usePlayerStore();
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);

  // 点击弹出层外部时关闭速度选项
  useEffect(() => {
    if (!speedOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setSpeedOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [speedOpen]);

  return (
    <div className="glass fixed inset-x-0 bottom-0 z-50 border-b-0 border-t">
      {/* 三列网格：左右等宽，保证播放按钮始终水平居中且不被挤压 */}
      <div className="mx-auto grid h-16 max-w-4xl grid-cols-[1fr_auto_1fr] items-center px-5">
        {/* 左：声音开关 */}
        <div className="flex justify-start">
          <button
            onClick={toggleMute}
            disabled={!playerReady}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            style={{ color: muted ? "var(--text-secondary)" : "var(--text)" }}
            aria-label={muted ? "开启声音" : "关闭声音"}
          >
            {muted ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
                <line x1="16" y1="9" x2="22" y2="15" />
                <line x1="22" y1="9" x2="16" y2="15" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            )}
          </button>
        </div>

        {/* 中：播放 / 暂停（shrink-0 防止小屏被挤变形） */}
        <button
          onClick={() => apiRef.current?.playPause()}
          disabled={!playerReady}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40"
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

        {/* 右：速度（弹出选项卡） */}
        <div className="flex justify-end">
          <div ref={speedRef} className="relative">
            <button
              onClick={() => setSpeedOpen((v) => !v)}
              disabled={!playerReady}
              className="flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors disabled:opacity-40"
              style={{
                background: speedOpen ? "var(--border)" : "transparent",
                color: "var(--text)",
              }}
              aria-label="播放速度"
              aria-expanded={speedOpen}
            >
              {speed}×
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="currentColor"
                style={{
                  transform: speedOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                }}
              >
                <path d="M1 3.5 5 7.5 9 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {speedOpen && (
              <div
                className="card absolute bottom-full right-0 mb-2 min-w-[96px] overflow-hidden p-1"
                role="menu"
                aria-label="选择播放速度"
              >
                {siteConfig.player.speedOptions.map((s) => (
                  <button
                    key={s}
                    role="menuitem"
                    onClick={() => {
                      setSpeed(s);
                      setSpeedOpen(false);
                    }}
                    className="block w-full rounded-lg px-3 py-1.5 text-left text-[13px] font-medium transition-colors"
                    style={{
                      background:
                        s === speed ? "var(--border)" : "transparent",
                      color:
                        s === speed ? "var(--text)" : "var(--text-secondary)",
                    }}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
