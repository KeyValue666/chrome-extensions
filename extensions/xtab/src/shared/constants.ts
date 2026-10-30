import type { GroupIconId, SearchEngine, Settings, WallpaperPreset } from './types';

/** chrome.storage.local 的单一 key：整份状态一次读写，避免多处并发写坏 */
export const STORAGE_KEY = 'xtab:state:v1';

export const STATE_VERSION = 1 as const;

/** 单条快捷方式标题/网址长度上限，防止误粘贴超长内容撑爆 UI */
export const LIMITS = {
  shortcutTitle: 40,
  groupName: 16,
  folderName: 16,
  todoText: 120,
  noteLength: 20000,
  wallpaperBytes: 20 * 1024 * 1024,
  wallpaperMaxWidth: 2560,
  searchQuery: 80,
  countdownName: 24,
} as const;

/** 搜索历史条数上限 */
export const MAX_SEARCH_HISTORY = 12;
/** 倒数日条数上限 */
export const MAX_COUNTDOWNS = 50;

/**
 * 强调色预设：dark/light 各给一档，保证两个主题下都有足够对比度。
 * JS 只把对应值写进 --accent，派生色（accent-soft）由 CSS color-mix 生成。
 */
export const ACCENT_PRESETS: { id: string; name: string; dark: string; light: string }[] = [
  { id: 'azure', name: '晴空', dark: '#6ea8ff', light: '#2f6fed' },
  { id: 'violet', name: '鸢尾', dark: '#a78bfa', light: '#7c5cf0' },
  { id: 'mint', name: '薄荷', dark: '#4fd1a5', light: '#0e9f6e' },
  { id: 'sunset', name: '霞光', dark: '#ff9e6b', light: '#e8590c' },
  { id: 'rose', name: '蔷薇', dark: '#f472b6', light: '#d6336c' },
  { id: 'amber', name: '琥珀', dark: '#fbbf24', light: '#d97706' },
];

export const DEFAULT_ACCENT_ID = 'azure';

export function findAccent(id: string): { id: string; name: string; dark: string; light: string } {
  return ACCENT_PRESETS.find((accent) => accent.id === id) ?? ACCENT_PRESETS[0]!;
}

/** 番茄钟时长边界（分钟） */
export const POMODORO_LIMITS = {
  focus: { min: 5, max: 120, step: 5, default: 25 },
  break: { min: 1, max: 30, step: 1, default: 5 },
} as const;

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', searchUrl: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', searchUrl: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', searchUrl: 'https://www.baidu.com/s?wd=%s' },
  { id: 'zhihu', name: '知乎', searchUrl: 'https://www.zhihu.com/search?type=content&q=%s' },
  { id: 'bilibili', name: 'B 站', searchUrl: 'https://search.bilibili.com/all?keyword=%s' },
  { id: 'github', name: 'GitHub', searchUrl: 'https://github.com/search?q=%s' },
  { id: 'sogou', name: '搜狗', searchUrl: 'https://www.sogou.com/web?query=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', searchUrl: 'https://duckduckgo.com/?q=%s' },
];

export const DEFAULT_ENGINE_ID = 'google';

/**
 * 分组可选图标。全部是内置线性 SVG（见 lib/icons.ts），
 * 不引入 iconfont 的字体文件：那需要登录下载、体积大、且授权默认只覆盖个人使用场景。
 */
export const GROUP_ICONS: { id: GroupIconId; label: string }[] = [
  { id: 'grid', label: '网格' },
  { id: 'star', label: '星标' },
  { id: 'briefcase', label: '工作' },
  { id: 'code', label: '开发' },
  { id: 'terminal', label: '终端' },
  { id: 'book', label: '阅读' },
  { id: 'film', label: '影视' },
  { id: 'music', label: '音乐' },
  { id: 'game', label: '游戏' },
  { id: 'shopping', label: '购物' },
  { id: 'heart', label: '收藏' },
  { id: 'home', label: '居家' },
  { id: 'flask', label: '实验' },
  { id: 'palette', label: '设计' },
  { id: 'camera', label: '摄影' },
  { id: 'globe', label: '网站' },
  { id: 'coffee', label: '生活' },
  { id: 'plane', label: '出行' },
  { id: 'wallet', label: '财务' },
  { id: 'chat', label: '社交' },
];

export const DEFAULT_GROUP_ICON: GroupIconId = 'grid';

export function isGroupIconId(value: string): value is GroupIconId {
  return GROUP_ICONS.some((icon) => icon.id === value);
}

/**
 * 内置壁纸：多层径向渐变叠加，比单条线性渐变更像「光」，不会灰蒙蒙一片。
 * 全部是纯 CSS，零网络请求、零体积。
 */
export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'aether',
    name: '星夜',
    css: 'radial-gradient(90% 70% at 18% 12%, #3b4a8f 0%, rgba(59, 74, 143, 0) 58%), radial-gradient(80% 70% at 82% 18%, #7b4a86 0%, rgba(123, 74, 134, 0) 60%), radial-gradient(70% 60% at 60% 88%, #1f6f8b 0%, rgba(31, 111, 139, 0) 62%), linear-gradient(160deg, #0a0e1c 0%, #10162b 52%, #070a14 100%)',
  },
  {
    id: 'aurora',
    name: '极光',
    css: 'radial-gradient(75% 60% at 22% 22%, #1f8f7a 0%, rgba(31, 143, 122, 0) 60%), radial-gradient(80% 65% at 78% 30%, #2f5fd0 0%, rgba(47, 95, 208, 0) 62%), radial-gradient(70% 60% at 55% 92%, #6f3fa0 0%, rgba(111, 63, 160, 0) 60%), linear-gradient(165deg, #06121a 0%, #0a2029 55%, #061018 100%)',
  },
  {
    id: 'ember',
    name: '落日',
    css: 'radial-gradient(85% 70% at 78% 18%, #f08a4c 0%, rgba(240, 138, 76, 0) 58%), radial-gradient(80% 70% at 20% 30%, #b8410c 0%, rgba(184, 65, 12, 0) 62%), radial-gradient(90% 70% at 50% 100%, #6f1d3a 0%, rgba(111, 29, 58, 0) 65%), linear-gradient(160deg, #1a0c10 0%, #2a1118 50%, #12070b 100%)',
  },
  {
    id: 'ocean',
    name: '深海',
    css: 'radial-gradient(90% 70% at 25% 15%, #1d6fa5 0%, rgba(29, 111, 165, 0) 60%), radial-gradient(80% 70% at 80% 35%, #134e7a 0%, rgba(19, 78, 122, 0) 62%), radial-gradient(80% 70% at 55% 95%, #0b3550 0%, rgba(11, 53, 80, 0) 65%), linear-gradient(165deg, #061621 0%, #0a2536 55%, #04101a 100%)',
  },
  {
    id: 'sakura',
    name: '樱雾',
    css: 'radial-gradient(80% 70% at 75% 20%, #d98fb0 0%, rgba(217, 143, 176, 0) 60%), radial-gradient(85% 70% at 20% 30%, #9d5f96 0%, rgba(157, 95, 150, 0) 62%), radial-gradient(80% 70% at 50% 95%, #4a2b57 0%, rgba(74, 43, 87, 0) 65%), linear-gradient(160deg, #1a0f1a 0%, #2a1628 50%, #140a14 100%)',
  },
  {
    id: 'forest',
    name: '苔原',
    css: 'radial-gradient(80% 70% at 20% 20%, #2f7a52 0%, rgba(47, 122, 82, 0) 60%), radial-gradient(80% 70% at 80% 25%, #4f7a2f 0%, rgba(79, 122, 47, 0) 62%), radial-gradient(90% 70% at 50% 95%, #16301f 0%, rgba(22, 48, 31, 0) 65%), linear-gradient(160deg, #08130c 0%, #0f2018 55%, #060d09 100%)',
  },
  {
    id: 'graphite',
    name: '石墨',
    css: 'radial-gradient(70% 60% at 25% 10%, #2a2f3a 0%, rgba(42, 47, 58, 0) 60%), radial-gradient(80% 60% at 80% 20%, #1d2430 0%, rgba(29, 36, 48, 0) 62%), radial-gradient(90% 80% at 50% 100%, #10141b 0%, rgba(16, 20, 27, 0) 70%), linear-gradient(170deg, #0d1016 0%, #141922 55%, #080a0e 100%)',
  },
  {
    id: 'dusk',
    name: '暮光',
    css: 'radial-gradient(80% 70% at 70% 15%, #8a5cc7 0%, rgba(138, 92, 199, 0) 60%), radial-gradient(85% 70% at 25% 25%, #c7648a 0%, rgba(199, 100, 138, 0) 62%), radial-gradient(80% 70% at 55% 95%, #3b2a63 0%, rgba(59, 42, 99, 0) 65%), linear-gradient(160deg, #120d1e 0%, #1d1330 55%, #0b0714 100%)',
  },
  {
    id: 'glacier',
    name: '冰川',
    css: 'radial-gradient(85% 70% at 20% 10%, #9fd4e8 0%, rgba(159, 212, 232, 0) 55%), radial-gradient(80% 70% at 80% 30%, #6c9fd6 0%, rgba(108, 159, 214, 0) 60%), radial-gradient(90% 80% at 50% 100%, #24476b 0%, rgba(36, 71, 107, 0) 65%), linear-gradient(165deg, #0a1a26 0%, #14314a 55%, #071019 100%)',
  },
  {
    id: 'mocha',
    name: '摩卡',
    css: 'radial-gradient(80% 70% at 25% 18%, #a9744f 0%, rgba(169, 116, 79, 0) 60%), radial-gradient(80% 70% at 80% 25%, #7a4f3f 0%, rgba(122, 79, 63, 0) 62%), radial-gradient(90% 80% at 50% 100%, #3a2620 0%, rgba(58, 38, 32, 0) 65%), linear-gradient(160deg, #16100d 0%, #241813 55%, #0e0908 100%)',
  },
  {
    id: 'mist',
    name: '晨雾',
    css: 'radial-gradient(80% 70% at 20% 15%, #cfe0f2 0%, rgba(207, 224, 242, 0) 60%), radial-gradient(85% 70% at 80% 25%, #f3d7e2 0%, rgba(243, 215, 226, 0) 62%), radial-gradient(90% 80% at 55% 95%, #dfe9f5 0%, rgba(223, 233, 245, 0) 65%), linear-gradient(160deg, #e8eef7 0%, #f5f7fb 55%, #dfe6f0 100%)',
  },
  {
    id: 'paper',
    name: '素纸',
    css: 'radial-gradient(70% 60% at 25% 20%, #f7f2e8 0%, rgba(247, 242, 232, 0) 60%), radial-gradient(75% 65% at 80% 25%, #efe4d2 0%, rgba(239, 228, 210, 0) 62%), linear-gradient(160deg, #f6f1e7 0%, #ece3d3 100%)',
  },
];

export const DEFAULT_PRESET_ID = 'aether';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  accentId: DEFAULT_ACCENT_ID,
  wallpaperKind: 'preset',
  presetId: DEFAULT_PRESET_ID,
  blur: false,
  dim: 10,
  clockSeconds: false,
  hour24: true,
  minimal: false,
  sidebarCollapsed: false,
  searchEngine: DEFAULT_ENGINE_ID,
  lunarEnabled: true,
  searchHistoryEnabled: true,
  pomodoroFocus: POMODORO_LIMITS.focus.default,
  pomodoroBreak: POMODORO_LIMITS.break.default,
};

export function findEngine(id: string): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? SEARCH_ENGINES[0]!;
}

export function findPreset(id: string): WallpaperPreset {
  return WALLPAPER_PRESETS.find((preset) => preset.id === id) ?? WALLPAPER_PRESETS[0]!;
}
