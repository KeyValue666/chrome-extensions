/** 主题模式：auto 跟随系统 */
export type ThemeMode = 'auto' | 'light' | 'dark';

/** 壁纸来源：preset 内置渐变，custom 用户本地上传（存 IndexedDB） */
export type WallpaperKind = 'preset' | 'custom';

/** 分组图标 id，见 GROUP_ICONS；全部是内置 SVG，不加载任何外部图标字体 */
export type GroupIconId =
  | 'grid'
  | 'star'
  | 'briefcase'
  | 'code'
  | 'book'
  | 'film'
  | 'music'
  | 'game'
  | 'shopping'
  | 'heart'
  | 'home'
  | 'flask'
  | 'palette'
  | 'globe'
  | 'coffee'
  | 'plane'
  | 'camera'
  | 'wallet'
  | 'terminal'
  | 'chat';

export interface Settings {
  theme: ThemeMode;
  /** 强调色 id，见 ACCENT_PRESETS */
  accentId: string;
  wallpaperKind: WallpaperKind;
  /** 内置壁纸 id，见 WALLPAPER_PRESETS */
  presetId: string;
  /** 壁纸毛玻璃 */
  blur: boolean;
  /** 壁纸压暗程度，0-80（百分比） */
  dim: number;
  clockSeconds: boolean;
  /** 24 小时制；false 为 12 小时制 */
  hour24: boolean;
  /** 极简模式：只保留时钟与搜索 */
  minimal: boolean;
  /** 侧边栏收起为纯图标条 */
  sidebarCollapsed: boolean;
  /** 当前搜索引擎 id，见 SEARCH_ENGINES */
  searchEngine: string;
  /** 日期行显示农历与节日 */
  lunarEnabled: boolean;
  /** 搜索框下拉显示最近搜索 */
  searchHistoryEnabled: boolean;
  /** 番茄钟专注时长（分钟） */
  pomodoroFocus: number;
  /** 番茄钟休息时长（分钟） */
  pomodoroBreak: number;
}

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  /** null 表示未分组 */
  groupId: string | null;
  /** null 表示直接躺在网格里；否则属于某个文件夹（iOS 式拖拽合并而来） */
  folderId: string | null;
}

/** 网格里的文件夹：两个快捷方式拖拽重叠时生成，成员通过 Shortcut.folderId 关联 */
export interface Folder {
  id: string;
  name: string;
}

export interface ShortcutGroup {
  id: string;
  name: string;
  icon: GroupIconId;
  /** 隐藏后不在侧边栏出现，但仍可从「隐藏的分组」里恢复 */
  hidden: boolean;
}

/** 侧边栏 -> 快捷方式区的筛选条件 */
export interface ShortcutFilter {
  kind: 'ungrouped' | 'group';
  groupId: string | null;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

/**
 * 倒数日：date 是 YYYY-MM-DD。
 * anniversary 为 true 时按「每年这一天」循环（生日、纪念日），
 * 为 false 时是单向倒计时（截止日期、出发日）。
 */
export interface CountdownItem {
  id: string;
  name: string;
  date: string;
  anniversary: boolean;
}

export interface AppState {
  version: 1;
  settings: Settings;
  groups: ShortcutGroup[];
  shortcuts: Shortcut[];
  folders: Folder[];
  /**
   * 网格顶层顺序：松散的快捷方式存 id 本身，文件夹存 `f:<id>` 前缀 token。
   * 被收进文件夹的快捷方式不在 grid 里出现。
   */
  grid: string[];
  todos: TodoItem[];
  note: string;
  /** 最近搜索词，新的在前，上限 MAX_SEARCH_HISTORY */
  searchHistory: string[];
  countdowns: CountdownItem[];
}

export interface SearchEngine {
  id: string;
  name: string;
  /** %s 为查询占位符 */
  searchUrl: string;
}

export interface WallpaperPreset {
  id: string;
  name: string;
  /** 直接可用的 CSS background-image 值 */
  css: string;
}
