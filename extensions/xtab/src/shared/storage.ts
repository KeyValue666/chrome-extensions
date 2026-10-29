import { STORAGE_KEY } from './constants';
import { createDefaultState, normalizeState } from './state';
import type { AppState } from './types';

const hasExtensionStorage = (): boolean =>
  typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined' && !!chrome.storage.local;

/**
 * chrome.storage.local 是唯一持久化位置（不联网、不同步，隐私面最小）。
 * 无扩展 API 时回退 localStorage，仅用于本地预览构建产物。
 */
export async function loadState(): Promise<AppState> {
  try {
    if (hasExtensionStorage()) {
      const result = (await chrome.storage.local.get(STORAGE_KEY)) as Record<string, unknown>;
      const raw = result[STORAGE_KEY];
      return raw === undefined ? createDefaultState() : normalizeState(raw);
    }

    const text = localStorage.getItem(STORAGE_KEY);
    return text ? normalizeState(JSON.parse(text)) : createDefaultState();
  } catch (error) {
    console.warn('[xtab] 读取本地数据失败，已回退默认配置', error);
    return createDefaultState();
  }
}

export async function saveState(state: AppState): Promise<void> {
  try {
    if (hasExtensionStorage()) {
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[xtab] 保存失败', error);
    throw error instanceof Error ? error : new Error('保存失败');
  }
}

export async function clearState(): Promise<void> {
  if (hasExtensionStorage()) {
    await chrome.storage.local.remove(STORAGE_KEY);
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}
