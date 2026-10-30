import type { AppContext } from '../shared/context';
import {
  addShortcut,
  addToFolder,
  createFolder,
  dissolveFolder,
  folderTokenId,
  isFolderToken,
  removeShortcut,
  removeTokens,
  removeFromFolder,
  renameFolder,
  reorderGrid,
  updateShortcut,
} from '../shared/state';
import { el, initialOf } from '../lib/dom';
import { createIcon, type IconName } from '../lib/icons';
import { faviconUrl } from '../lib/url';
import { confirmDialog, nameDialog, openModal, shortcutDialog } from '../ui/dialog';
import { bindLongPress } from '../ui/menu';
import type { Folder, Shortcut, ShortcutFilter } from '../shared/types';

export interface ShortcutsHandle {
  render(): void;
  /** direction：切换来源的方向，用于入场动画的方向感（1=下一个，-1=上一个） */
  setFilter(filter: ShortcutFilter, direction?: -1 | 0 | 1): void;
  getFilter(): ShortcutFilter;
  /** 打开当前筛选视图里第 n 个（0 起）快捷方式；用于数字键 1-9 快速打开 */
  quickOpen(index: number): boolean;
}

/** 待办 / 便签等「内置应用」，和网站图标排在同一个网格里，点击后以弹窗呈现 */
export interface ShortcutsActions {
  openTodo(): void;
  openNote(): void;
  openPomodoro(): void;
  openCountdown(): void;
  /** 最近一个倒数日的剩余天数，无条目返回 null（角标用） */
  countdownBadge(): number | null;
}

const HOME_FILTER: ShortcutFilter = { kind: 'ungrouped', groupId: null };

interface GridEntry {
  token: string;
  kind: 'shortcut' | 'folder';
  shortcut?: Shortcut;
  folder?: Folder;
  members?: Shortcut[];
}

/** 合并预览的悬停 dwell：进入中心区域后等多久才算「要建文件夹」 */
const MERGE_DWELL = 320;

/**
 * 快捷方式网格：右键进入 iOS 式抖动编辑（角标编辑/删除），
 * 拖拽悬停在另一个图标中心会合并成文件夹，并入/移出/自动解散与 iOS 一致。
 */
export function initShortcuts(
  root: HTMLElement,
  ctx: AppContext,
  actions: ShortcutsActions,
  options: { initialFilter?: ShortcutFilter } = {},
): ShortcutsHandle {
  let filter: ShortcutFilter = options.initialFilter ?? HOME_FILTER;
  let editing = false;
  /** 编辑模式下已选中的网格项（快捷方式 id 或文件夹 token） */
  const selected = new Set<string>();
  let lastKey = '';
  // 最近一次筛选切换的方向：-1 上一个 / 1 下一个 / 0 普通刷新
  let pendingDirection: -1 | 0 | 1 = 0;

  // 拖拽与合并状态
  let draggingToken: string | null = null;
  let draggingKind: 'shortcut' | 'folder' | null = null;
  let movedDuringDrag = false;
  let mergeToken: string | null = null;
  let mergeTimer: number | undefined;
  let mergeArmed = false;
  let currentGrid: HTMLElement | null = null;

  const visibleEntries = (): GridEntry[] => {
    const { shortcuts, folders, grid } = ctx.getState();
    const shortcutById = new Map(shortcuts.map((item) => [item.id, item]));
    const folderById = new Map(folders.map((item) => [item.id, item]));
    const membersOf = (folderId: string): Shortcut[] =>
      shortcuts.filter((item) => item.folderId === folderId);

    const entries: GridEntry[] = [];
    for (const token of grid) {
      if (isFolderToken(token)) {
        const folder = folderById.get(folderTokenId(token));
        if (folder) {
          entries.push({ token, kind: 'folder', folder, members: membersOf(folder.id) });
        }
      } else {
        const shortcut = shortcutById.get(token);
        if (shortcut && !shortcut.folderId) {
          entries.push({ token, kind: 'shortcut', shortcut });
        }
      }
    }

    // 首页（未分组）里文件夹和未分组快捷方式一起显示；分组视图只列组内快捷方式
    if (filter.kind === 'ungrouped') {
      return entries.filter((entry) =>
        entry.kind === 'folder' ? true : entry.shortcut?.groupId === null,
      );
    }
    return entries.filter((entry) => entry.shortcut?.groupId === filter.groupId);
  };

  const openCreate = (): void => {
    shortcutDialog({
      title: '添加快捷方式',
      groups: ctx.getState().groups,
      initial: {
        title: '',
        url: '',
        groupId: filter.kind === 'group' ? filter.groupId : null,
      },
      onSubmit: (value) => {
        ctx.update((draft) => {
          addShortcut(draft, value);
        });
        ctx.refreshAll();
        return null;
      },
    });
  };

  const openEdit = (shortcut: Shortcut): void => {
    shortcutDialog({
      title: '编辑快捷方式',
      groups: ctx.getState().groups,
      initial: { title: shortcut.title, url: shortcut.url, groupId: shortcut.groupId },
      onSubmit: (value) => {
        ctx.update((draft) => {
          updateShortcut(draft, shortcut.id, value);
        });
        ctx.refreshAll();
        return null;
      },
    });
  };

  const confirmDelete = (shortcut: Shortcut): void => {
    void (async () => {
      const ok = await confirmDialog({
        title: '删除快捷方式',
        message: `确定删除「${shortcut.title}」吗？`,
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      ctx.update((draft) => {
        removeShortcut(draft, shortcut.id);
      });
      ctx.refreshAll();
    })();
  };

  const confirmDissolve = (folder: Folder): void => {
    void (async () => {
      const ok = await confirmDialog({
        title: '解散文件夹',
        message: `「${folder.name}」里的快捷方式会回到网格，不会被删除。`,
        confirmText: '解散',
      });
      if (!ok) return;
      ctx.update((draft) => {
        dissolveFolder(draft, folder.id);
      });
      ctx.refreshAll();
    })();
  };

  const renameFolderDialog = (folder: Folder): void => {
    nameDialog({
      title: '重命名文件夹',
      initial: folder.name,
      placeholder: '例如 工作、设计',
      onSubmit: (name) => {
        ctx.update((draft) => {
          renameFolder(draft, folder.id, name);
        });
        ctx.refreshAll();
        return null;
      },
    });
  };

  /** 内置应用图标：点击开弹窗，不参与拖拽 */
  const buildAppTile = (
    label: string,
    icon: IconName,
    variant: 'todo' | 'note' | 'pomodoro' | 'countdown',
    badge: number,
    onOpen: () => void,
  ): HTMLElement => {
    const iconHost = el('span', { class: 'shortcut-icon app-icon' }, [createIcon(icon, 24, 1.8)]);

    if (badge > 0) {
      iconHost.append(
        el('span', {
          class: 'app-badge',
          text: badge > 99 ? '99+' : String(badge),
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }

    return el(
      'div',
      {
        class: `shortcut shortcut-app shortcut-app-${variant}`,
        attrs: {
          role: 'button',
          tabindex: '0',
          'aria-label': badge > 0 ? `${label}（${badge} 项未完成）` : label,
        },
        on: {
          click: onOpen,
          keydown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen();
            }
          },
        },
      },
      [iconHost, el('span', { class: 'shortcut-title', text: label })],
    );
  };

  /** 图标里的字母 + favicon 双层：favicon 加载完淡入盖住字母 */
  const faviconLayers = (shortcut: Shortcut): HTMLElement[] => {
    const letter = el('span', { class: 'shortcut-letter', text: initialOf(shortcut.title) });
    const iconSrc = faviconUrl(shortcut.url, 64);
    if (!iconSrc) return [letter];
    const image = el('img', {
      class: 'shortcut-favicon',
      attrs: { src: iconSrc, alt: '', width: 32, height: 32, loading: 'lazy' },
    });
    image.addEventListener('error', () => image.remove());
    image.addEventListener('load', () => letter.parentElement?.classList.add('is-loaded'));
    return [letter, image];
  };

  /** 编辑态角标：删除 + 编辑。点角标不触发图标本身的点击 */
  const editBadge = (
    icon: IconName,
    variant: 'del' | 'edit',
    label: string,
    onAction: () => void,
  ): HTMLElement =>
    el(
      'button',
      {
        class: `tile-badge is-${variant}`,
        title: label,
        attrs: { type: 'button', 'aria-label': label },
        on: {
          click: (event) => {
            event.stopPropagation();
            onAction();
          },
          pointerdown: (event) => event.stopPropagation(),
        },
      },
      [createIcon(icon, 12)],
    );

  const persistOrder = (): void => {
    if (!currentGrid?.isConnected) return;
    const tokens = [...currentGrid.querySelectorAll<HTMLElement>('.shortcut[data-token]')]
      .map((node) => node.dataset.token)
      .filter((token): token is string => Boolean(token));
    if (tokens.length === 0) return;
    ctx.update((draft) => {
      reorderGrid(draft, tokens);
    });
  };

  const armMergePreview = (tile: HTMLElement, token: string): void => {
    if (mergeToken === token) return;
    clearMergePreview();
    mergeToken = token;
    mergeTimer = window.setTimeout(() => {
      mergeArmed = true;
      tile.classList.add('is-merge');
    }, MERGE_DWELL);
  };

  const clearMergePreview = (): void => {
    if (mergeTimer !== undefined) {
      window.clearTimeout(mergeTimer);
      mergeTimer = undefined;
    }
    mergeArmed = false;
    mergeToken = null;
    currentGrid?.querySelectorAll('.shortcut.is-merge').forEach((node) => {
      node.classList.remove('is-merge');
    });
  };

  const mergeInto = (draggedToken: string, targetToken: string): void => {
    let openedFolderId: string | null = null;
    const draggedId = isFolderToken(draggedToken) ? null : draggedToken;
    ctx.update((draft) => {
      if (!draggedId) return;
      if (isFolderToken(targetToken)) {
        addToFolder(draft, folderTokenId(targetToken), draggedId);
        return;
      }
      const folder = createFolder(draft, targetToken, draggedId);
      openedFolderId = folder?.id ?? null;
    });
    ctx.refreshAll();
    if (openedFolderId) openFolder(openedFolderId);
  };

  const bindDragSource = (tile: HTMLElement, entry: GridEntry): void => {
    tile.addEventListener('dragstart', (event) => {
      draggingToken = entry.token;
      draggingKind = entry.kind;
      movedDuringDrag = false;
      tile.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', entry.token);
      }
    });

    tile.addEventListener('dragend', () => {
      tile.classList.remove('is-dragging');
      clearMergePreview();
      // 合并会触发 refreshAll 重建网格，此时 currentGrid 已是新的；拖拽源所在旧 grid 已脱离，
      // persistOrder 会因 currentGrid.isConnected 判断跳过对旧 DOM 的误持久化
      persistOrder();
      draggingToken = null;
      draggingKind = null;
      // 拖拽结束后浏览器仍会补发一次 click，延迟复位避免误触发
      setTimeout(() => {
        movedDuringDrag = false;
      }, 0);
    });
  };

  const buildShortcutTile = (entry: GridEntry): HTMLElement => {
    const shortcut = entry.shortcut!;
    const icon = el('span', { class: 'shortcut-icon' }, faviconLayers(shortcut));

    const tile = el(
      'div',
      {
        class: `shortcut${selected.has(entry.token) ? ' is-selected' : ''}`,
        dataset: { id: shortcut.id, token: entry.token },
        attrs: {
          role: 'link',
          tabindex: '0',
          draggable: 'true',
          'aria-label': shortcut.title,
          title: `${shortcut.title}\n${shortcut.url}`,
        },
      },
      [icon, el('span', { class: 'shortcut-title', text: shortcut.title })],
    );

    if (editing) {
      tile.append(
        editBadge('close', 'del', `删除 ${shortcut.title}`, () => confirmDelete(shortcut)),
        editBadge('edit', 'edit', `编辑 ${shortcut.title}`, () => openEdit(shortcut)),
      );
    }

    const go = (): void => {
      if (movedDuringDrag) return;
      // 编辑模式下点击是「选中 / 取消选中」，不跳转
      if (editing) {
        toggleSelect(entry.token);
        return;
      }
      window.location.assign(shortcut.url);
    };

    tile.addEventListener('click', go);
    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        go();
        return;
      }
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        enterEdit();
      }
    });
    tile.addEventListener('auxclick', (event) => {
      if (event.button === 1) go();
    });

    tile.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      enterEdit();
    });
    bindLongPress(tile, () => enterEdit());

    bindDragSource(tile, entry);
    return tile;
  };

  const buildFolderTile = (entry: GridEntry): HTMLElement => {
    const folder = entry.folder!;
    const members = entry.members ?? [];

    const minis = members.slice(0, 4).map((member) => {
      const mini = el('span', { class: 'folder-mini' }, [
        el('span', { class: 'folder-mini-letter', text: initialOf(member.title) }),
      ]);
      const iconSrc = faviconUrl(member.url, 32);
      if (iconSrc) {
        const image = el('img', {
          class: 'folder-mini-favicon',
          attrs: { src: iconSrc, alt: '', width: 14, height: 14, loading: 'lazy' },
        });
        image.addEventListener('error', () => image.remove());
        image.addEventListener('load', () => mini.classList.add('is-loaded'));
        mini.append(image);
      }
      return mini;
    });

    const icon = el('span', { class: 'shortcut-icon folder-icon' }, [
      el('span', { class: 'folder-minis' }, minis),
    ]);

    const tile = el(
      'div',
      {
        class: `shortcut shortcut-folder${selected.has(entry.token) ? ' is-selected' : ''}`,
        dataset: { token: entry.token },
        attrs: {
          role: 'button',
          tabindex: '0',
          draggable: 'true',
          'aria-label': `文件夹：${folder.name}（${members.length} 个）`,
        },
      },
      [icon, el('span', { class: 'shortcut-title', text: folder.name })],
    );

    if (editing) {
      tile.append(
        editBadge('close', 'del', `解散 ${folder.name}`, () => confirmDissolve(folder)),
        editBadge('edit', 'edit', `重命名 ${folder.name}`, () => renameFolderDialog(folder)),
      );
    }

    const open = (): void => {
      if (movedDuringDrag) return;
      if (editing) {
        toggleSelect(entry.token);
        return;
      }
      openFolder(folder.id);
    };

    tile.addEventListener('click', open);
    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    tile.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      enterEdit();
    });
    bindLongPress(tile, () => enterEdit());

    bindDragSource(tile, entry);
    return tile;
  };

  /** 文件夹内容弹窗：点成员打开网址；悬停出 × 把成员移出文件夹 */
  const openFolder = (folderId: string): void => {
    const body = el('div', { class: 'dialog-body folder-body' });
    const state0 = ctx.getState();
    const folder0 = state0.folders.find((item) => item.id === folderId);

    const close = openModal({
      title: folder0?.name ?? '文件夹',
      subtitle: '点图标打开，点右上角 × 移出文件夹',
      body,
    });

    const renderMembers = (): void => {
      const state = ctx.getState();
      const folder = state.folders.find((item) => item.id === folderId);
      if (!folder) {
        close();
        return;
      }
      const members = state.shortcuts.filter((item) => item.folderId === folderId);
      if (members.length === 0) {
        close();
        return;
      }

      body.replaceChildren(
        el(
          'div',
          { class: 'folder-grid' },
          members.map((member) => {
            const item = el(
              'div',
              {
                class: 'folder-item',
                attrs: { role: 'link', tabindex: '0', 'aria-label': member.title },
              },
              [
                el('span', { class: 'folder-item-icon' }, faviconLayers(member)),
                el('span', { class: 'shortcut-title', text: member.title }),
                el(
                  'button',
                  {
                    class: 'folder-pop',
                    title: '移出文件夹',
                    attrs: { type: 'button', 'aria-label': `移出 ${member.title}` },
                    on: {
                      click: (event) => {
                        event.stopPropagation();
                        ctx.update((draft) => {
                          removeFromFolder(draft, member.id);
                        });
                        ctx.refreshAll();
                        renderMembers();
                      },
                    },
                  },
                  [createIcon('close', 11)],
                ),
              ],
            );
            item.addEventListener('click', () => {
              if (movedDuringDrag) return;
              window.location.assign(member.url);
            });
            return item;
          }),
        ),
      );
    };

    renderMembers();
  };

  /* ---------- 编辑模式 ---------- */

  const enterEdit = (): void => {
    if (editing) return;
    editing = true;
    selected.clear();
    render();
  };

  const exitEdit = (): void => {
    if (!editing) return;
    editing = false;
    selected.clear();
    render();
  };

  const toggleSelect = (token: string): void => {
    if (selected.has(token)) selected.delete(token);
    else selected.add(token);
    renderEditBar();
    currentGrid
      ?.querySelector(`.shortcut[data-token="${CSS.escape(token)}"]`)
      ?.classList.toggle('is-selected', selected.has(token));
  };

  /** 当前视图里可选中的项（快捷方式 + 文件夹），全选与计数都以它为准 */
  const selectableTokens = (): string[] =>
    [...(currentGrid?.querySelectorAll<HTMLElement>('.shortcut[data-token]') ?? [])]
      .map((node) => node.dataset.token ?? '')
      .filter(Boolean);

  const selectAll = (): void => {
    const tokens = selectableTokens();
    const all = tokens.every((token) => selected.has(token));
    selected.clear();
    if (!all) for (const token of tokens) selected.add(token);
    render();
  };

  const deleteSelected = (): void => {
    const tokens = [...selected];
    if (tokens.length === 0) return;
    const folderCount = tokens.filter((token) => isFolderToken(token)).length;
    void (async () => {
      const ok = await confirmDialog({
        title: '删除所选',
        message:
          folderCount > 0
            ? `确定删除选中的 ${tokens.length} 项吗？其中的文件夹会被解散，成员回到网格。`
            : `确定删除选中的 ${tokens.length} 个快捷方式吗？`,
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      ctx.update((draft) => {
        removeTokens(draft, tokens);
      });
      ctx.refreshAll();
    })();
  };

  /** 编辑模式顶部的操作条：选中计数 + 全选 / 删除 / 完成 */
  let editBarCount: HTMLElement | null = null;
  let editBarDelete: HTMLButtonElement | null = null;
  let editBarSelectAll: HTMLButtonElement | null = null;

  const renderEditBar = (): void => {
    if (!editBarCount || !editBarDelete || !editBarSelectAll) return;
    const count = selected.size;
    editBarCount.textContent = count === 0 ? '点图标可多选，拖拽可排序' : `已选 ${count} 项`;
    editBarCount.classList.toggle('is-empty', count === 0);
    editBarDelete.disabled = count === 0;
    editBarDelete.textContent = count === 0 ? '删除' : `删除 ${count} 项`;
    const tokens = selectableTokens();
    editBarSelectAll.textContent =
      tokens.length > 0 && tokens.every((t) => selected.has(t)) ? '取消全选' : '全选';
  };

  const buildEditBar = (): HTMLElement => {
    editBarCount = el('span', { class: 'edit-bar-count' });
    editBarDelete = el('button', {
      class: 'button button-danger-ghost',
      text: '删除',
      attrs: { type: 'button' },
      on: { click: deleteSelected },
    }) as HTMLButtonElement;
    editBarSelectAll = el('button', {
      class: 'button button-ghost',
      text: '全选',
      attrs: { type: 'button' },
      on: { click: selectAll },
    }) as HTMLButtonElement;

    const bar = el('div', { class: 'edit-bar', attrs: { role: 'toolbar' } }, [
      editBarCount,
      el('div', { class: 'edit-bar-actions' }, [
        editBarSelectAll,
        editBarDelete,
        el('button', {
          class: 'button button-primary',
          text: '完成',
          attrs: { type: 'button' },
          on: { click: exitEdit },
        }),
      ]),
    ]);
    requestAnimationFrame(renderEditBar);
    return bar;
  };

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !editing) return;
      if (document.querySelector('.dialog-backdrop')) return;
      event.stopPropagation();
      // 先清空选中，再按一次才退出编辑
      if (selected.size > 0) {
        selected.clear();
        render();
        return;
      }
      exitEdit();
    },
    true,
  );

  // 编辑模式下 Delete / Backspace 删除所选，Ctrl/⌘+A 全选
  document.addEventListener(
    'keydown',
    (event) => {
      if (!editing) return;
      if (document.querySelector('.dialog-backdrop')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.size > 0) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll();
      }
    },
    true,
  );

  // 点网格空白或页面其它区域退出编辑；点图标 / 角标 / 操作条 / 弹窗不退出
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!editing) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('.shortcut') ||
        target.closest('.edit-bar') ||
        target.closest('.dialog-backdrop')
      ) {
        return;
      }
      exitEdit();
    },
    true,
  );

  /** 布局模式：一屏放得下 → 行优先（从左往右排），少图标不再拉成一条竖列；
      行优先纵向装不下 → 切回列优先做横向分页 */
  const syncGridMode = (grid: HTMLElement): void => {
    grid.classList.add('is-row-major');
    if (grid.scrollHeight > grid.clientHeight + 4) grid.classList.remove('is-row-major');
    grid.classList.toggle('has-overflow', grid.scrollWidth > grid.clientWidth + 4);
    grid.classList.toggle('is-at-start', grid.scrollLeft <= 2);
  };

  // 窗口尺寸变化后重新决定流向与溢出提示
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (currentGrid?.isConnected && !currentGrid.classList.contains('is-empty')) {
        syncGridMode(currentGrid);
      }
    });
  });

  function render(): void {
    const state = ctx.getState();
    if (filter.kind === 'group' && !state.groups.some((group) => group.id === filter.groupId)) {
      filter = HOME_FILTER;
    }

    const entries = visibleEntries();
    const empty = entries.length === 0;
    const grid = el('div', {
      class: `shortcut-grid${editing ? ' is-editing' : ''}${empty ? ' is-empty' : ''}`,
    });
    currentGrid = grid;

    // 内置应用（待办/便签/专注/倒数日）只放在「未分组」首页，分组视图保持纯粹
    if (filter.kind === 'ungrouped') {
      const remaining = state.todos.filter((todo) => !todo.done).length;
      const countdownBadge = actions.countdownBadge() ?? 0;
      grid.append(
        buildAppTile('待办', 'todo', 'todo', remaining, actions.openTodo),
        buildAppTile('便签', 'note', 'note', 0, actions.openNote),
        buildAppTile('专注', 'timer', 'pomodoro', 0, actions.openPomodoro),
        buildAppTile('倒数日', 'flag', 'countdown', countdownBadge, actions.openCountdown),
      );
    }

    entries.forEach((entry, index) => {
      const tile = entry.kind === 'shortcut' ? buildShortcutTile(entry) : buildFolderTile(entry);
      tile.style.setProperty('--i', String(Math.min(index + 2, 15)));
      grid.append(tile);
    });

    if (empty) {
      grid.append(
        el('div', { class: 'shortcuts-empty' }, [
          el('span', { class: 'shortcuts-empty-icon' }, [createIcon('plus', 20)]),
          el('p', { class: 'shortcuts-empty-text', text: '这里还空着，先加一个常用网站' }),
          el('button', {
            class: 'button button-primary',
            text: '添加快捷方式',
            attrs: { type: 'button' },
            on: { click: openCreate },
          }),
        ]),
      );
    } else {
      grid.append(
        el(
          'button',
          {
            class: 'shortcut shortcut-add',
            attrs: { type: 'button', 'aria-label': '添加快捷方式' },
            on: { click: openCreate },
          },
          [
            el('span', { class: 'shortcut-icon shortcut-icon-add' }, [createIcon('plus', 20)]),
            el('span', { class: 'shortcut-title', text: '添加' }),
          ],
        ),
      );
    }

    // 拖拽：悬停另一个图标中心 → 合并预览；边缘 → 排序；靠左右边缘 → 自动横滚
    grid.addEventListener('dragover', (event) => {
      if (!draggingToken) return;
      event.preventDefault();

      // 内容横向溢出时，把图标拖近边缘自动滚动网格
      const bounds = grid.getBoundingClientRect();
      if (grid.scrollWidth > grid.clientWidth + 4) {
        if (event.clientX < bounds.left + 48) grid.scrollLeft -= 14;
        else if (event.clientX > bounds.right - 48) grid.scrollLeft += 14;
      }

      const dragging = grid.querySelector<HTMLElement>(
        `.shortcut[data-token="${CSS.escape(draggingToken)}"]`,
      );
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '.shortcut[data-token]',
      );
      if (!dragging || !target || target === dragging) {
        clearMergePreview();
        return;
      }

      const rect = target.getBoundingClientRect();
      const inCenterX = Math.abs(event.clientX - (rect.left + rect.width / 2)) < rect.width * 0.26;
      const inCenterY = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * 0.3;

      // 只有拖动「松散快捷方式」落在中心区才合并；文件夹只能被并入、不能发起合并
      if (draggingKind === 'shortcut' && inCenterX && inCenterY) {
        armMergePreview(target, target.dataset.token ?? '');
        return;
      }

      clearMergePreview();
      const insertBefore = event.clientX < rect.left + rect.width / 2;
      grid.insertBefore(dragging, insertBefore ? target : target.nextSibling);
      movedDuringDrag = true;
    });

    grid.addEventListener('drop', (event) => {
      if (!draggingToken) return;
      event.preventDefault();
      if (mergeArmed && mergeToken && draggingKind === 'shortcut') {
        const dragged = draggingToken;
        const target = mergeToken;
        clearMergePreview();
        mergeInto(dragged, target);
      }
    });

    // 筛选或条数变化时重放入场动画；同一视图内的增删不闪
    const key = `${filter.kind}:${filter.groupId ?? ''}:${entries
      .map((entry) => entry.token)
      .join(',')}`;
    const animate = key !== lastKey;
    lastKey = key;
    if (animate) {
      grid.classList.add('is-entering');
      if (pendingDirection === 1) grid.classList.add('is-from-right');
      else if (pendingDirection === -1) grid.classList.add('is-from-left');
    }
    pendingDirection = 0;

    root.replaceChildren(...(editing ? [buildEditBar()] : []), grid);

    // 首帧绘制前决定流向（rAF 在 paint 前执行，不会闪）；
    // 横向溢出时右侧渐隐提示；滚到头由 wheel 处理器维护 is-at-start
    if (!empty) {
      requestAnimationFrame(() => syncGridMode(grid));
      grid.addEventListener('scroll', () => {
        grid.classList.toggle('is-at-start', grid.scrollLeft <= 2);
      });
    }
  }

  render();

  return {
    render,
    setFilter: (next, direction = 0) => {
      filter = next;
      pendingDirection = direction;
      render();
    },
    getFilter: () => filter,
    quickOpen: (index) => {
      if (editing) return false;
      const entry = visibleEntries()
        .filter((item) => item.kind === 'shortcut' && item.shortcut)
        .slice(index, index + 1)[0];
      if (!entry?.shortcut) return false;
      window.location.assign(entry.shortcut.url);
      return true;
    },
  };
}
