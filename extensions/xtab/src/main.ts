import './styles/base.css';
import './styles/dock.css';
import './styles/widgets.css';
import './styles/settings.css';

import { debounce, el } from './lib/dom';
import { initialFilter } from './shared/state';
import { loadState, saveState } from './shared/storage';
import type { AppContext } from './shared/context';
import type { AppState } from './shared/types';
import { createSettings, type SettingsHandle } from './ui/settings';
import { createPanels } from './ui/panels';
import { initSidebar, type SidebarHandle } from './ui/sidebar';
import { initMinimalHint, initToolbar, type ToolbarHandle } from './ui/toolbar';
import { applyAppearance } from './ui/wallpaper';
import { initClock, type ClockHandle } from './widgets/clock';
import { initSearch, type SearchHandle } from './widgets/search';
import { initShortcuts, type ShortcutsHandle } from './widgets/shortcuts';

interface Widgets {
  clock?: ClockHandle;
  search?: SearchHandle;
  shortcuts?: ShortcutsHandle;
}

function requireElement(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 #${id} 容器`);
  return node;
}

/** 单例 toast：连续操作只保留最后一条，不堆叠打扰 */
function createNotifier(): (message: string) => void {
  const host = el('div', { class: 'toast-root', attrs: { role: 'status', 'aria-live': 'polite' } });
  document.body.append(host);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: HTMLElement | null = null;

  return (message: string) => {
    current?.remove();
    const node = el('div', { class: 'toast', text: message });
    host.append(node);
    current = node;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      node.remove();
      if (current === node) current = null;
    }, 2400);
  };
}

function bindGlobalKeys(state: AppState, ctx: AppContext, widgets: Widgets): void {
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const typing = target?.closest('input, textarea, select, [contenteditable="true"]');

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      widgets.search?.focus();
      return;
    }

    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      widgets.search?.focus();
      return;
    }

    // 数字键 1-9 直接打开网格里对应的快捷方式（仅正常视图、非输入状态）
    if (
      /^[1-9]$/.test(event.key) &&
      !typing &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !state.settings.minimal &&
      !document.querySelector('.dialog-backdrop') &&
      !document.querySelector('.shortcut-grid.is-editing')
    ) {
      if (widgets.shortcuts?.quickOpen(Number(event.key) - 1)) return;
    }

    if (event.key === 'Escape') {
      // 弹窗自己处理 Esc；仅在没有弹窗时退出极简模式
      if (document.querySelector('.dialog-backdrop')) return;
      if (state.settings.minimal) {
        state.settings.minimal = false;
        void ctx.applyAppearance();
      }
    }
  });
}

async function bootstrap(): Promise<void> {
  const state = await loadState();
  const notify = createNotifier();
  const widgets: Widgets = {};
  let settings: SettingsHandle | null = null;
  let sidebar: SidebarHandle | null = null;
  let toolbar: ToolbarHandle | null = null;

  // 有未落盘的本地改动时，别用外部数据覆盖内存里的状态
  let dirty = false;

  const persist = debounce(() => {
    void saveState(state)
      .then(() => {
        dirty = false;
      })
      .catch((error: unknown) => {
        console.error('[xtab] 保存失败', error);
        notify('保存失败，请检查浏览器存储空间');
      });
  }, 300);

  const ctx: AppContext = {
    getState: () => state,
    update: (mutator) => {
      mutator(state);
      dirty = true;
      persist();
    },
    applyAppearance: () => applyAppearance(state),
    refreshAll: () => {
      widgets.clock?.render();
      widgets.search?.render();
      widgets.shortcuts?.render();
      sidebar?.render();
      toolbar?.render();
    },
    openSettings: (section) => settings?.open(section),
    notify,
  };

  /**
   * 扩展图标面板会把当前网页直接写进同一份存储。
   * 回到本页（切标签页、从弹窗回来）时比对一次，有外部改动就整页刷新数据，
   * 否则会看到旧列表，以为没存上。
   */
  const syncExternalWrites = async (): Promise<void> => {
    if (dirty) return;
    if (document.querySelector('.dialog-backdrop, .drawer-backdrop')) return;
    const active = document.activeElement;
    if (active?.closest('input, textarea, [contenteditable="true"]')) return;

    try {
      const fresh = await loadState();
      if (JSON.stringify(fresh) === JSON.stringify(state)) return;
      Object.assign(state, fresh);
      await applyAppearance(state);
      ctx.refreshAll();
    } catch (error) {
      console.warn('[xtab] 同步外部改动失败', error);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncExternalWrites();
  });

  // 先铺背景与主题，避免首屏出现纯色闪白
  await applyAppearance(state);

  const panels = createPanels(ctx);

  widgets.clock = initClock(ctx);
  widgets.search = initSearch(ctx);
  const firstFilter = initialFilter(state);
  widgets.shortcuts = initShortcuts(
    requireElement('shortcuts'),
    ctx,
    {
      openTodo: () => panels.openTodo(),
      openNote: () => panels.openNote(),
      openPomodoro: () => panels.openPomodoro(),
      openCountdown: () => panels.openCountdown(),
      countdownBadge: () => panels.countdown.nextDays(),
    },
    { initialFilter: firstFilter },
  );
  sidebar = initSidebar(requireElement('sidebar'), ctx, {
    initialFilter: firstFilter,
    onChange: (filter, direction) => widgets.shortcuts?.setFilter(filter, direction),
  });
  toolbar = initToolbar(requireElement('toolbar'), ctx);
  settings = createSettings(ctx);
  initMinimalHint(ctx);

  bindGlobalKeys(state, ctx, widgets);

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (state.settings.theme === 'auto') void ctx.applyAppearance();
  });

  // 关闭标签页前补一次落盘，防止 300ms 防抖窗口内的改动丢失
  window.addEventListener('pagehide', () => {
    void saveState(state);
  });
}

// 开发构建专用：构建完成后自动刷新页面。
// 用 MODE 而不是 import.meta.env.DEV —— vite build 期间 NODE_ENV 恒为 production，
// DEV 在构建产物里永远是 false，只有 MODE 能反映 `--mode development`。
// 再加一道 chrome.runtime.id 判断：只有真扩展页面才需要它，
// vite dev server（已有 HMR）和静态预览页不会去请求不存在的 hub。
// 生产构建里这两个条件都被静态折叠成 false，整个分支（含动态 import 的 chunk）都会被移除。
if (
  import.meta.env.MODE === 'development' &&
  typeof chrome !== 'undefined' &&
  Boolean(chrome.runtime?.id)
) {
  void import('./dev/reload-client').then(({ startReloadWatcher }) => startReloadWatcher());
}

bootstrap().catch((error: unknown) => {
  console.error('[xtab] 启动失败', error);
  const message = error instanceof Error ? error.message : '未知错误';
  document.body.append(
    el('div', {
      class: 'toast',
      text: `XTab 启动失败：${message}`,
      attrs: { style: 'position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:99' },
    }),
  );
});
