import type { Song, SongMeta } from "../types/song";

/**
 * Song Index —— 构建时扫描 songs/ 下所有 Song Folder 生成。
 * 添加歌曲：在 songs/ 下新建文件夹，放入 meta.json 与 score.tex 即可。
 */
const metaModules = import.meta.glob<{ default: Omit<SongMeta, "id"> }>(
  "/songs/*/meta.json",
  { eager: true }
);
const texModules = import.meta.glob<string>("/songs/*/score.tex", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const songs: Song[] = Object.entries(metaModules).map(
  ([path, mod]) => {
    const id = path.split("/")[2];
    const texPath = `/songs/${id}/score.tex`;
    return {
      ...mod.default,
      id,
      scoreTex: texModules[texPath] ?? "",
    };
  }
);

export function getSong(id: string): Song | undefined {
  return songs.find((s) => s.id === id);
}

/** 本地实时搜索：标题 + 艺术家 + 标签 */
export function searchSongs(query: string): Song[] {
  const q = query.trim().toLowerCase();
  if (!q) return songs;
  return songs.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
  );
}
