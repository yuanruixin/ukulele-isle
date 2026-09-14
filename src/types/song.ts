/** Song（歌曲）元数据 —— 对应每首歌曲文件夹中的 meta.json */
export interface SongMeta {
  /** 唯一标识，与歌曲文件夹名一致，用于路由 /song/:id */
  id: string;
  /** 歌曲标题 */
  title: string;
  /** 艺术家 */
  artist: string;
  /** 标签（搜索维度之一） */
  tags: string[];
  /** 一句话描述，展示在卡片上 */
  description?: string;
}

/** Song = 元数据 + Score（alphaTex 文本） */
export interface Song extends SongMeta {
  scoreTex: string;
}
