import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  DEFAULT_GROUP_ICON,
  DEFAULT_SETTINGS,
  LIMITS,
  MAX_COUNTDOWNS,
  MAX_SEARCH_HISTORY,
  POMODORO_LIMITS,
  SEARCH_ENGINES,
  STATE_VERSION,
  WALLPAPER_PRESETS,
  isGroupIconId,
} from './constants';
import { normalizeText } from '../lib/list';
import { normalizeUrl } from '../lib/url';
import { parseDateKey } from '../lib/time';
import { uid } from '../lib/dom';
import type {
  AppState,
  CountdownItem,
  Folder,
  GroupIconId,
  Settings,
  Shortcut,
  ShortcutFilter,
  ShortcutGroup,
  TodoItem,
  ThemeMode,
} from './types';

const THEMES: ThemeMode[] = ['auto', 'light', 'dark'];

/** 快捷方式总条数上限（含文件夹内的）：弹出面板新增时也要守这条线 */
export const MAX_SHORTCUTS = 300;
const MAX_GROUPS = 30;
const MAX_FOLDERS = 50;
const MAX_TODOS = 500;

/** 文件夹在 grid 里的 token 形如 `f:<id>`，与快捷方式 id 区分 */
export const folderToken = (id: string): string => `f:${id}`;
export const isFolderToken = (token: string): boolean => token.startsWith('f:');
export const folderTokenId = (token: string): string => token.slice(2);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asInt = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
};

/** 首次打开的示例数据：真实可用的站点，用户可直接删除 */
/**
 * 首屏落在哪个分类：优先「未分组」首页（它承载内置应用与文件夹）；
 * 首页空着时退到第一个有内容的分组，避免一进来看到空网格。
 */
export function initialFilter(state: AppState): ShortcutFilter {
  const homeHasContent =
    state.folders.length > 0 ||
    state.shortcuts.some((item) => !item.folderId && item.groupId === null);
  if (homeHasContent) return { kind: 'ungrouped', groupId: null };

  const group = state.groups.find(
    (item) => !item.hidden && state.shortcuts.some((shortcut) => shortcut.groupId === item.id),
  );
  return group ? { kind: 'group', groupId: group.id } : { kind: 'ungrouped', groupId: null };
}

export function createDefaultState(): AppState {
  const groups: ShortcutGroup[] = [
    { id: 'g-common', name: '常用', icon: 'star', hidden: false },
    { id: 'g-dev', name: '开发', icon: 'code', hidden: false },
    { id: 'g-fun', name: '娱乐', icon: 'film', hidden: false },
  ];
  const samples: { title: string; url: string; groupId: string }[] = [
    { title: 'Google', url: 'https://www.google.com/', groupId: 'g-common' },
    { title: '知乎', url: 'https://www.zhihu.com/', groupId: 'g-common' },
    { title: 'GitHub', url: 'https://github.com/', groupId: 'g-dev' },
    { title: '哔哩哔哩', url: 'https://www.bilibili.com/', groupId: 'g-fun' },
  ];

  const shortcuts = samples.map((sample) => ({
    id: uid(),
    title: sample.title,
    url: sample.url,
    groupId: sample.groupId,
    folderId: null,
  }));

  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    groups,
    shortcuts,
    folders: [],
    grid: shortcuts.map((shortcut) => shortcut.id),
    todos: [],
    note: '',
    searchHistory: [],
    countdowns: [],
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const theme = asString(source.theme) as ThemeMode;
  const presetId = asString(source.presetId, DEFAULT_SETTINGS.presetId);
  const engineId = asString(source.searchEngine, DEFAULT_SETTINGS.searchEngine);

  return {
    theme: THEMES.includes(theme) ? theme : DEFAULT_SETTINGS.theme,
    accentId: ACCENT_PRESETS.some((accent) => accent.id === source.accentId)
      ? asString(source.accentId)
      : DEFAULT_ACCENT_ID,
    wallpaperKind: source.wallpaperKind === 'custom' ? 'custom' : 'preset',
    presetId: WALLPAPER_PRESETS.some((preset) => preset.id === presetId)
      ? presetId
      : DEFAULT_SETTINGS.presetId,
    blur: asBoolean(source.blur, DEFAULT_SETTINGS.blur),
    dim: asInt(source.dim, DEFAULT_SETTINGS.dim, 0, 80),
    clockSeconds: asBoolean(source.clockSeconds, DEFAULT_SETTINGS.clockSeconds),
    hour24: asBoolean(source.hour24, DEFAULT_SETTINGS.hour24),
    minimal: asBoolean(source.minimal, DEFAULT_SETTINGS.minimal),
    sidebarCollapsed: asBoolean(source.sidebarCollapsed, DEFAULT_SETTINGS.sidebarCollapsed),
    searchEngine: SEARCH_ENGINES.some((engine) => engine.id === engineId)
      ? engineId
      : DEFAULT_SETTINGS.searchEngine,
    lunarEnabled: asBoolean(source.lunarEnabled, DEFAULT_SETTINGS.lunarEnabled),
    searchHistoryEnabled: asBoolean(
      source.searchHistoryEnabled,
      DEFAULT_SETTINGS.searchHistoryEnabled,
    ),
    pomodoroFocus: asInt(
      source.pomodoroFocus,
      POMODORO_LIMITS.focus.default,
      POMODORO_LIMITS.focus.min,
      POMODORO_LIMITS.focus.max,
    ),
    pomodoroBreak: asInt(
      source.pomodoroBreak,
      POMODORO_LIMITS.break.default,
      POMODORO_LIMITS.break.min,
      POMODORO_LIMITS.break.max,
    ),
  };
}

export function normalizeGroup(raw: unknown): ShortcutGroup | null {
  if (!isRecord(raw)) return null;
  const name = normalizeText(asString(raw.name)).slice(0, LIMITS.groupName);
  if (!name) return null;
  const id = asString(raw.id) || uid();
  const rawIcon = asString(raw.icon);
  const icon: GroupIconId = isGroupIconId(rawIcon) ? rawIcon : DEFAULT_GROUP_ICON;
  return { id, name, icon, hidden: asBoolean(raw.hidden, false) };
}

export function normalizeShortcut(raw: unknown): Shortcut | null {
  if (!isRecord(raw)) return null;
  const url = normalizeUrl(asString(raw.url));
  if (!url) return null;

  const fallbackTitle = new URL(url).hostname.replace(/^www\./i, '');
  const title = normalizeText(asString(raw.title)) || fallbackTitle;
  const groupId = typeof raw.groupId === 'string' && raw.groupId ? raw.groupId : null;
  const folderId = typeof raw.folderId === 'string' && raw.folderId ? raw.folderId : null;

  return {
    id: asString(raw.id) || uid(),
    title: title.slice(0, LIMITS.shortcutTitle),
    url,
    groupId,
    folderId,
  };
}

export function normalizeFolder(raw: unknown): Folder | null {
  if (!isRecord(raw)) return null;
  const name = normalizeText(asString(raw.name)).slice(0, LIMITS.folderName);
  if (!name) return null;
  return { id: asString(raw.id) || uid(), name };
}

export function normalizeTodo(raw: unknown): TodoItem | null {
  if (!isRecord(raw)) return null;
  const text = normalizeText(asString(raw.text)).slice(0, LIMITS.todoText);
  if (!text) return null;
  return {
    id: asString(raw.id) || uid(),
    text,
    done: asBoolean(raw.done, false),
    createdAt: asInt(raw.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  };
}

export function normalizeCountdown(raw: unknown): CountdownItem | null {
  if (!isRecord(raw)) return null;
  const name = normalizeText(asString(raw.name)).slice(0, LIMITS.countdownName);
  const date = asString(raw.date);
  if (!name || !parseDateKey(date)) return null;
  return {
    id: asString(raw.id) || uid(),
    name,
    date,
    anniversary: asBoolean(raw.anniversary, false),
  };
}

/**
 * 把任意输入（storage 里的旧数据、导入的 JSON、被手改坏的配置）
 * 收敛成合法的 AppState：字段逐个校验，非法项丢弃而不是整份重置。
 */
export function normalizeState(raw: unknown): AppState {
  const source = isRecord(raw) ? raw : {};

  const groups: ShortcutGroup[] = [];
  const seenGroupIds = new Set<string>();
  for (const item of Array.isArray(source.groups) ? source.groups : []) {
    const group = normalizeGroup(item);
    if (!group || seenGroupIds.has(group.id)) continue;
    groups.push(group);
    seenGroupIds.add(group.id);
    if (groups.length >= MAX_GROUPS) break;
  }

  // 先收文件夹，再去校验快捷方式的 folderId 是否指向它
  const folders: Folder[] = [];
  const seenFolderIds = new Set<string>();
  for (const item of Array.isArray(source.folders) ? source.folders : []) {
    const folder = normalizeFolder(item);
    if (!folder || seenFolderIds.has(folder.id)) continue;
    folders.push(folder);
    seenFolderIds.add(folder.id);
    if (folders.length >= MAX_FOLDERS) break;
  }

  const shortcuts: Shortcut[] = [];
  const seenShortcutIds = new Set<string>();
  for (const item of Array.isArray(source.shortcuts) ? source.shortcuts : []) {
    const shortcut = normalizeShortcut(item);
    if (!shortcut || seenShortcutIds.has(shortcut.id)) continue;
    if (shortcut.groupId && !seenGroupIds.has(shortcut.groupId)) shortcut.groupId = null;
    if (shortcut.folderId && !seenFolderIds.has(shortcut.folderId)) shortcut.folderId = null;
    shortcuts.push(shortcut);
    seenShortcutIds.add(shortcut.id);
    if (shortcuts.length >= MAX_SHORTCUTS) break;
  }

  // 成员不足 2 个的文件夹不成立：成员退回松散状态，文件夹删除
  const memberCount = new Map<string, number>();
  for (const shortcut of shortcuts) {
    if (shortcut.folderId) {
      memberCount.set(shortcut.folderId, (memberCount.get(shortcut.folderId) ?? 0) + 1);
    }
  }
  const keptFolders = folders.filter((folder) => (memberCount.get(folder.id) ?? 0) >= 2);
  const keptFolderIds = new Set(keptFolders.map((folder) => folder.id));
  for (const shortcut of shortcuts) {
    if (shortcut.folderId && !keptFolderIds.has(shortcut.folderId)) shortcut.folderId = null;
  }

  // grid：合法 token（松散快捷方式 id 或存在的文件夹 token）按原顺序保留，去重，缺失补尾
  const validTokens = new Set<string>([
    ...shortcuts.filter((shortcut) => !shortcut.folderId).map((shortcut) => shortcut.id),
    ...keptFolders.map((folder) => folderToken(folder.id)),
  ]);
  const grid: string[] = [];
  const seenTokens = new Set<string>();
  for (const token of Array.isArray(source.grid) ? source.grid : []) {
    if (typeof token !== 'string' || seenTokens.has(token) || !validTokens.has(token)) continue;
    grid.push(token);
    seenTokens.add(token);
  }
  for (const shortcut of shortcuts) {
    if (!shortcut.folderId && !seenTokens.has(shortcut.id)) {
      grid.push(shortcut.id);
      seenTokens.add(shortcut.id);
    }
  }
  for (const folder of keptFolders) {
    const token = folderToken(folder.id);
    if (!seenTokens.has(token)) {
      grid.push(token);
      seenTokens.add(token);
    }
  }

  const todos: TodoItem[] = [];
  const seenTodoIds = new Set<string>();
  for (const item of Array.isArray(source.todos) ? source.todos : []) {
    const todo = normalizeTodo(item);
    if (!todo || seenTodoIds.has(todo.id)) continue;
    todos.push(todo);
    seenTodoIds.add(todo.id);
    if (todos.length >= MAX_TODOS) break;
  }

  const searchHistory: string[] = [];
  const seenQueries = new Set<string>();
  for (const item of Array.isArray(source.searchHistory) ? source.searchHistory : []) {
    const query = normalizeText(asString(item)).slice(0, LIMITS.searchQuery);
    if (!query || seenQueries.has(query)) continue;
    searchHistory.push(query);
    seenQueries.add(query);
    if (searchHistory.length >= MAX_SEARCH_HISTORY) break;
  }

  const countdowns: CountdownItem[] = [];
  const seenCountdownIds = new Set<string>();
  for (const item of Array.isArray(source.countdowns) ? source.countdowns : []) {
    const countdown = normalizeCountdown(item);
    if (!countdown || seenCountdownIds.has(countdown.id)) continue;
    countdowns.push(countdown);
    seenCountdownIds.add(countdown.id);
    if (countdowns.length >= MAX_COUNTDOWNS) break;
  }

  return {
    version: STATE_VERSION,
    settings: normalizeSettings(source.settings),
    groups,
    shortcuts,
    folders: keptFolders,
    grid,
    todos,
    note: asString(source.note).slice(0, LIMITS.noteLength),
    searchHistory,
    countdowns,
  };
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** 导入失败必须抛错：调用方据此提示用户文件不合法，而不是静默清空数据 */
export function parseStateJson(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (!isRecord(parsed)) throw new Error('JSON 顶层必须是对象');
  if (!isRecord(parsed.settings) && !Array.isArray(parsed.shortcuts)) {
    throw new Error('不是 XTab 的备份文件');
  }
  return normalizeState(parsed);
}

/* ---------- 以下为状态变更助手：直接在 mutator 内调用，保持逻辑集中 ---------- */

export function addShortcut(
  state: AppState,
  input: { title: string; url: string; groupId: string | null },
): Shortcut | null {
  const shortcut = normalizeShortcut({ ...input, id: uid() });
  if (!shortcut) return null;
  state.shortcuts.push(shortcut);
  // 新增的快捷方式落到网格末尾，与现有 token 不冲突
  state.grid.push(shortcut.id);
  return shortcut;
}

export function updateShortcut(
  state: AppState,
  id: string,
  patch: { title: string; url: string; groupId: string | null },
): boolean {
  const index = state.shortcuts.findIndex((item) => item.id === id);
  const current = state.shortcuts[index];
  if (index < 0 || !current) return false;

  const next = normalizeShortcut({ ...current, ...patch });
  if (!next) return false;
  state.shortcuts[index] = next;
  return true;
}

export function removeShortcut(state: AppState, id: string): void {
  const target = state.shortcuts.find((item) => item.id === id);
  state.shortcuts = state.shortcuts.filter((item) => item.id !== id);
  state.grid = state.grid.filter((token) => token !== id);
  // 删掉成员后文件夹可能不足 2 个，统一交给 dissolveFolder 收尾
  if (target?.folderId) {
    const remaining = state.shortcuts.filter((item) => item.folderId === target.folderId);
    if (remaining.length < 2) dissolveFolder(state, target.folderId);
  }
}

/**
 * 批量删除编辑模式下选中的网格项。
 * tokens 既可以是快捷方式 id，也可以是文件夹 token（`f:<id>`）：文件夹按「解散」处理，
 * 里面的成员回到网格而不是被删掉；成员被删到只剩 1 个的文件夹同样自动解散。
 */
export function removeTokens(state: AppState, tokens: readonly string[]): void {
  const ids = new Set<string>();
  const folderIds = new Set<string>();
  for (const token of tokens) {
    if (isFolderToken(token)) folderIds.add(folderTokenId(token));
    else ids.add(token);
  }
  const touchedFolders = new Set<string>();
  for (const id of ids) {
    const folderId = state.shortcuts.find((item) => item.id === id)?.folderId;
    if (folderId) touchedFolders.add(folderId);
  }

  state.shortcuts = state.shortcuts.filter((item) => !ids.has(item.id));
  state.grid = state.grid.filter((token) => !ids.has(token));

  for (const folderId of folderIds) dissolveFolder(state, folderId);
  for (const folderId of touchedFolders) {
    if (!state.folders.some((folder) => folder.id === folderId)) continue;
    if (state.shortcuts.filter((item) => item.folderId === folderId).length < 2) {
      dissolveFolder(state, folderId);
    }
  }
}

/**
 * 把两个松散快捷方式合并成文件夹。命名：若两者同属一个分组，沿用分组名；
 * 否则用「文件夹」。返回新建的文件夹（失败返回 null）。
 * target 保留在原网格位置，dragged 移出网格，位置由文件夹 token 占据。
 */
export function createFolder(state: AppState, targetId: string, draggedId: string): Folder | null {
  if (targetId === draggedId) return null;
  const target = state.shortcuts.find((item) => item.id === targetId);
  const dragged = state.shortcuts.find((item) => item.id === draggedId);
  if (!target || !dragged || target.folderId || dragged.folderId) return null;

  const sharedGroup =
    target.groupId && target.groupId === dragged.groupId
      ? state.groups.find((group) => group.id === target.groupId)?.name
      : undefined;
  const folder = normalizeFolder({ id: uid(), name: sharedGroup ?? '文件夹' });
  if (!folder) return null;

  state.folders.push(folder);
  target.folderId = folder.id;
  dragged.folderId = folder.id;

  const targetIndex = state.grid.indexOf(targetId);
  state.grid = state.grid.filter((token) => token !== draggedId && token !== targetId);
  const insertAt = targetIndex >= 0 ? Math.min(targetIndex, state.grid.length) : state.grid.length;
  state.grid.splice(insertAt, 0, folderToken(folder.id));
  return folder;
}

/** 把一个松散快捷方式并入已有文件夹 */
export function addToFolder(state: AppState, folderId: string, shortcutId: string): boolean {
  const folder = state.folders.find((item) => item.id === folderId);
  const shortcut = state.shortcuts.find((item) => item.id === shortcutId);
  if (!folder || !shortcut || shortcut.folderId) return false;
  shortcut.folderId = folderId;
  state.grid = state.grid.filter((token) => token !== shortcutId);
  return true;
}

/** 把快捷方式从文件夹里移出，回到文件夹所在网格位置；成员不足 2 个时自动解散 */
export function removeFromFolder(state: AppState, shortcutId: string): void {
  const shortcut = state.shortcuts.find((item) => item.id === shortcutId);
  if (!shortcut?.folderId) return;
  const folderId = shortcut.folderId;
  shortcut.folderId = null;

  const token = folderToken(folderId);
  const folderIndex = state.grid.indexOf(token);
  if (folderIndex >= 0) state.grid.splice(folderIndex + 1, 0, shortcut.id);
  else state.grid.push(shortcut.id);

  const remaining = state.shortcuts.filter((item) => item.folderId === folderId);
  if (remaining.length < 2) dissolveFolder(state, folderId);
}

export function renameFolder(state: AppState, id: string, name: string): boolean {
  const folder = state.folders.find((item) => item.id === id);
  if (!folder) return false;
  const next = normalizeText(name).slice(0, LIMITS.folderName);
  if (!next) return false;
  folder.name = next;
  return true;
}

/** 解散文件夹：成员 folderId 清空并回到文件夹在网格的位置，文件夹与 token 删除 */
export function dissolveFolder(state: AppState, id: string): void {
  const members = state.shortcuts.filter((item) => item.folderId === id);
  const token = folderToken(id);
  const folderIndex = state.grid.indexOf(token);
  state.grid = state.grid.filter((item) => item !== token);
  const insertAt = folderIndex >= 0 ? Math.min(folderIndex, state.grid.length) : state.grid.length;
  state.grid.splice(insertAt, 0, ...members.map((member) => member.id));
  for (const member of members) member.folderId = null;
  state.folders = state.folders.filter((folder) => folder.id !== id);
}

/** 仅重排可见 token 子集，其余 token 原下标不动（拖拽排序过滤视图用） */
export function reorderGrid(state: AppState, visibleTokens: readonly string[]): void {
  const inSubset = new Set(visibleTokens);
  const next: string[] = [];
  let cursor = 0;
  for (const token of state.grid) {
    if (!inSubset.has(token)) {
      next.push(token);
      continue;
    }
    next.push(visibleTokens[cursor] ?? token);
    cursor += 1;
  }
  state.grid = next;
}

export function addGroup(
  state: AppState,
  name: string,
  icon: GroupIconId = DEFAULT_GROUP_ICON,
): ShortcutGroup | null {
  const group = normalizeGroup({ id: uid(), name, icon });
  if (!group) return null;
  state.groups.push(group);
  return group;
}

/** 重命名 / 换图标 / 隐藏分组：字段逐个校验，非法值保持原样 */
export function updateGroup(
  state: AppState,
  id: string,
  patch: { name?: string; icon?: GroupIconId; hidden?: boolean },
): boolean {
  const group = state.groups.find((item) => item.id === id);
  if (!group) return false;

  if (patch.name !== undefined) {
    const name = normalizeText(patch.name).slice(0, LIMITS.groupName);
    if (!name) return false;
    group.name = name;
  }
  if (patch.icon !== undefined) group.icon = patch.icon;
  if (patch.hidden !== undefined) group.hidden = patch.hidden;
  return true;
}

/** 删除分组时把其下快捷方式移回「未分组」，不连带删除用户数据 */
export function removeGroup(state: AppState, id: string): void {
  state.groups = state.groups.filter((group) => group.id !== id);
  for (const shortcut of state.shortcuts) {
    if (shortcut.groupId === id) shortcut.groupId = null;
  }
}

export function addTodo(state: AppState, text: string): TodoItem | null {
  const todo = normalizeTodo({ id: uid(), text, done: false, createdAt: Date.now() });
  if (!todo) return null;
  state.todos.unshift(todo);
  return todo;
}

export function toggleTodo(state: AppState, id: string): void {
  const todo = state.todos.find((item) => item.id === id);
  if (todo) todo.done = !todo.done;
}

export function removeTodo(state: AppState, id: string): void {
  state.todos = state.todos.filter((item) => item.id !== id);
}

export function clearDoneTodos(state: AppState): void {
  state.todos = state.todos.filter((item) => !item.done);
}

/* ---------- 搜索历史 ---------- */

export function pushSearchHistory(state: AppState, query: string): void {
  const text = normalizeText(query).slice(0, LIMITS.searchQuery);
  if (!text) return;
  state.searchHistory = [text, ...state.searchHistory.filter((item) => item !== text)].slice(
    0,
    MAX_SEARCH_HISTORY,
  );
}

export function removeSearchHistory(state: AppState, query: string): void {
  state.searchHistory = state.searchHistory.filter((item) => item !== query);
}

export function clearSearchHistory(state: AppState): void {
  state.searchHistory = [];
}

/* ---------- 倒数日 ---------- */

export function addCountdown(
  state: AppState,
  input: { name: string; date: string; anniversary: boolean },
): CountdownItem | null {
  const countdown = normalizeCountdown({ ...input, id: uid() });
  if (!countdown) return null;
  if (state.countdowns.length >= MAX_COUNTDOWNS) return null;
  state.countdowns.push(countdown);
  return countdown;
}

export function removeCountdown(state: AppState, id: string): void {
  state.countdowns = state.countdowns.filter((item) => item.id !== id);
}
