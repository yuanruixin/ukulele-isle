import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 录制 / 回放（「标记」那一项需求）。
 *
 * 记的是「点了哪根弦的哪一品、距离开录多久」，回放时按原节奏把这些点击
 * **重新走一遍同一个 pluck 通路** —— 于是回放时弦照样晃、读数照样跳，
 * 听到的和看到的天然一致（不存在「谱面在播、画面不动」的割裂）。
 *
 * 两处刻意的选择：
 * 1. 再按一次录制 = 从头录新的，不叠加（叠加要处理的时长对齐问题不值当）。
 * 2. 回放时把第一个音之前那段空白掐掉（偏移以第一个音为 0），
 *    否则「录的时候顿了 3 秒」会在回放时再顿一次。
 * 3. 回放期间的手动点击**不写进录音**，避免自己录自己滚起来。
 */

export interface RecordedNote {
  /** 弦下标（0 = 1 弦 A，高音弦在前） */
  stringIndex: number;
  fret: number;
  /** 相对录制开始的毫秒偏移 */
  at: number;
}

interface Options {
  /** 录制上限（个音），到顶自动停 */
  maxNotes: number;
  /** 回放一个音（与手动点击同一条通路） */
  onPlay: (note: RecordedNote) => void;
  /** 最后一个音响完再等多久收尾（毫秒） */
  tailMs: number;
}

export function useUkuleleRecording({ maxNotes, onPlay, tailMs }: Options) {
  const [recording, setRecording] = useState(false);
  const [notes, setNotes] = useState<RecordedNote[]>([]);
  const [playing, setPlaying] = useState(false);
  /** 回放中正在响的是第几个（用于高亮序列条） */
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const playingRef = useRef(false);
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const stopPlayback = useCallback(() => {
    clearTimers();
    playingRef.current = false;
    setPlaying(false);
    setPlayingIndex(null);
  }, [clearTimers]);

  const stopRecording = useCallback(() => {
    startedAtRef.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    stopPlayback();
    startedAtRef.current = performance.now();
    setNotes([]);
    setRecording(true);
  }, [stopPlayback]);

  /** 记一个音（不在录制中 / 正在回放时静默忽略） */
  const record = useCallback(
    (stringIndex: number, fret: number) => {
      const startedAt = startedAtRef.current;
      if (startedAt === null || playingRef.current) return;
      setNotes((prev) => {
        if (prev.length >= maxNotes) return prev;
        const next = [
          ...prev,
          { stringIndex, fret, at: Math.round(performance.now() - startedAt) },
        ];
        // 录满自动收工，不然用户会一直点下去却不知道已经录不进去了
        if (next.length >= maxNotes) {
          startedAtRef.current = null;
          setRecording(false);
        }
        return next;
      });
    },
    [maxNotes],
  );

  const play = useCallback(() => {
    if (playingRef.current) {
      stopPlayback();
      return;
    }
    if (notes.length === 0) return;

    // 回放和录制互斥：正在回放时停止录制
    startedAtRef.current = null;
    setRecording(false);

    const base = notes[0].at;
    playingRef.current = true;
    setPlaying(true);

    notes.forEach((note, i) => {
      const delay = note.at - base;
      timersRef.current.push(
        window.setTimeout(() => {
          if (!playingRef.current) return;
          setPlayingIndex(i);
          onPlayRef.current(note);
        }, delay),
      );
    });

    const total = notes[notes.length - 1].at - base + tailMs;
    timersRef.current.push(
      window.setTimeout(() => stopPlayback(), total),
    );
  }, [notes, stopPlayback, tailMs]);

  const clear = useCallback(() => {
    stopPlayback();
    stopRecording();
    setNotes([]);
  }, [stopPlayback, stopRecording]);

  useEffect(() => clearTimers, [clearTimers]);

  const durationMs =
    notes.length > 1 ? notes[notes.length - 1].at - notes[0].at : 0;

  return {
    recording,
    notes,
    durationMs,
    playing,
    playingIndex,
    isFull: notes.length >= maxNotes,
    startRecording,
    stopRecording,
    record,
    play,
    stopPlayback,
    clear,
  };
}
