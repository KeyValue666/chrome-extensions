import { LIMITS } from '../shared/constants';
import { hostnameOf, normalizeUrl } from '../lib/url';
import type { AppState, Shortcut } from '../shared/types';

/** 弹出面板要用的当前页信息 */
export interface TabInfo {
  /** 已归一化的 http/https 地址 */
  url: string;
  /** 标签页标题，为空时回退到主机名 */
  title: string;
}

export interface GroupTarget {
  /** null = 未分组 */
  id: string | null;
  name: string;
}

/** 只有 http/https 页面能收藏：chrome://、扩展页、文件页都不该进网格 */
export function canCollect(rawUrl: string | null | undefined): boolean {
  return normalizeUrl(rawUrl ?? '') !== null;
}

/** 把 chrome.tabs 返回的标签页整理成可提交的数据；不可收藏时返回 null */
export function toTabInfo(
  tab: { url?: string; title?: string } | null | undefined,
): TabInfo | null {
  const url = normalizeUrl(tab?.url ?? '');
  if (!url) return null;
  const title = (tab?.title ?? '').trim().slice(0, LIMITS.shortcutTitle) || hostnameOf(url) || url;
  return { url, title };
}

/**
 * 判重用的地址指纹：去掉 hash 与末尾斜杠后再比，
 * 这样 example.com/a#top 与 example.com/a/ 视为同一条。
 */
export function urlKey(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl) ?? rawUrl.trim();
  try {
    const parsed = new URL(normalized);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return normalized;
  }
}

/** 网格里是否已有同一网址（文件夹内的也算） */
export function findDuplicate(state: AppState, rawUrl: string): Shortcut | null {
  const key = urlKey(rawUrl);
  return state.shortcuts.find((item) => urlKey(item.url) === key) ?? null;
}

/** 分组下拉的候选：未分组在最前，随后是未隐藏的分组（保持侧边栏顺序） */
export function groupTargets(state: AppState): GroupTarget[] {
  return [
    { id: null, name: '未分组' },
    ...state.groups
      .filter((group) => !group.hidden)
      .map((group) => ({
        id: group.id,
        name: group.name,
      })),
  ];
}

/** 分组 id → 展示名，找不到时按未分组处理 */
export function groupNameOf(state: AppState, groupId: string | null): string {
  if (!groupId) return '未分组';
  return state.groups.find((group) => group.id === groupId)?.name ?? '未分组';
}

/** 标题为空时用主机名兜底，同时裁到上限 */
export function resolveTitle(rawTitle: string, rawUrl: string): string {
  const url = normalizeUrl(rawUrl) ?? rawUrl.trim();
  const title = rawTitle.trim().slice(0, LIMITS.shortcutTitle);
  return title || hostnameOf(url) || url;
}
