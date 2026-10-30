import type { AppContext } from '../shared/context';
import { DEFAULT_GROUP_ICON, GROUP_ICONS } from '../shared/constants';
import { addGroup, removeGroup, updateGroup } from '../shared/state';
import { tintOf } from '../lib/color';
import { el } from '../lib/dom';
import { createIcon, type IconName } from '../lib/icons';
import { confirmDialog, groupDialog, hiddenGroupsDialog } from './dialog';
import { bindLongPress, openContextMenu } from './menu';
import type { ShortcutFilter, ShortcutGroup } from '../shared/types';

export interface SidebarHandle {
  render(): void;
  getFilter(): ShortcutFilter;
  /** 按顺序循环切换分类（1 下一个 / -1 上一个），等效于点击 Dock 项 */
  cycle(direction: 1 | -1): void;
}

interface SidebarOptions {
  /** 首屏分类，由 main 依据数据决定（首页空着时退到有内容的分组） */
  initialFilter?: ShortcutFilter;
  /** 筛选条件变化时通知快捷方式区；direction 供入场动画定方向 */
  onChange(filter: ShortcutFilter, direction?: -1 | 0 | 1): void;
}

const HOME_FILTER: ShortcutFilter = { kind: 'ungrouped', groupId: null };

interface DockItemOptions {
  label: string;
  /** 气泡里跟在名称后面的补充信息，例如「12 个」 */
  meta?: string;
  icon: IconName;
  active?: boolean;
  /** 图标底色；不传则是中性半透明块（未分组 / 新建） */
  tint?: string;
  onClick(): void;
  onMenu?(x: number, y: number): void;
}

/**
 * 左侧 Dock：图标 + 悬停气泡标签（气泡挂在 body 上用 fixed 定位，
 * 因为 Dock 本身可滚动，内部 absolute 元素会被裁剪）。
 * 右键（触屏长按）才出操作菜单 —— 平时不显示任何按钮，避免图标被小按钮切碎。
 */
function dockItem(options: DockItemOptions): HTMLElement {
  const tile = el('span', { class: 'dock-tile' }, [createIcon(options.icon, 20, 1.8)]);
  if (options.tint) tile.style.setProperty('--tile-bg', options.tint);

  const item = el(
    'button',
    {
      class: `dock-item${options.active ? ' is-active' : ''}${options.tint ? '' : ' is-plain'}`,
      attrs: {
        type: 'button',
        'aria-label': options.meta ? `${options.label}（${options.meta}）` : options.label,
        ...(options.active ? { 'aria-current': 'page' } : {}),
      },
      on: { click: options.onClick },
    },
    [tile],
  );

  item.addEventListener('pointerenter', () => showDockTip(item, options.label, options.meta));
  item.addEventListener('pointerleave', hideDockTip);
  item.addEventListener('focus', () => showDockTip(item, options.label, options.meta));
  item.addEventListener('blur', hideDockTip);

  if (options.onMenu) {
    const openMenu = (x: number, y: number): void => options.onMenu?.(x, y);
    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openMenu(event.clientX, event.clientY);
    });
    item.addEventListener('keydown', (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        const rect = item.getBoundingClientRect();
        openMenu(rect.right + 8, rect.top + rect.height / 2);
      }
    });
    bindLongPress(item, openMenu);
  }

  return item;
}

/* ---------- 共享气泡：整个 Dock 只有一个，跟随悬停的图标 ---------- */

let dockTipNode: HTMLElement | null = null;
let dockTipItem: HTMLElement | null = null;

function showDockTip(item: HTMLElement, label: string, meta?: string): void {
  if (!dockTipNode) return;
  dockTipNode.replaceChildren(
    el('span', { class: 'dock-tip-name', text: label }),
    ...(meta ? [el('span', { class: 'dock-tip-meta', text: meta })] : []),
  );
  dockTipNode.hidden = false;
  const rect = item.getBoundingClientRect();
  // 小屏 Dock 落在底部横排，气泡显示在图标上方
  const above = window.matchMedia('(max-width: 640px)').matches;
  dockTipNode.classList.toggle('is-above', above);
  dockTipNode.style.left = above ? `${rect.left + rect.width / 2}px` : `${rect.right + 14}px`;
  dockTipNode.style.top = above ? `${rect.top}px` : `${rect.top + rect.height / 2}px`;
  dockTipItem = item;
  requestAnimationFrame(() => {
    if (dockTipItem === item) dockTipNode?.classList.add('is-visible');
  });
}

function hideDockTip(): void {
  dockTipItem = null;
  if (!dockTipNode) return;
  dockTipNode.classList.remove('is-visible');
  dockTipNode.hidden = true;
}

/**
 * Dock 放大：按指针到各图标的距离做高斯衰减，再用 lerp 追帧，
 * 所以放大是连续的而不是「命中就 1.2 倍」的阶跃；离开后自然回落。
 */
function attachMagnification(dock: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const items = (): HTMLElement[] => [...dock.querySelectorAll<HTMLElement>('.dock-item')];
  const MAX_GROWTH = 0.3;
  const SIGMA = 52;

  let centers: number[] = [];
  let targets: number[] = [];
  let current: number[] = [];
  let raf = 0;

  const measure = (): void => {
    const list = items();
    const next = list.map((item) => {
      const rect = item.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    // 图标数量变化时重置，避免用旧数组的下标去写新元素
    if (next.length !== current.length) {
      targets = next.map(() => 1);
      current = next.map(() => 1);
    }
    centers = next;
  };

  const tick = (): void => {
    raf = 0;
    let moving = false;
    const list = items();

    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (!item) continue;
      const tile = item.querySelector<HTMLElement>('.dock-tile');
      if (!tile) continue;

      const goal = targets[index] ?? 1;
      const value = current[index] ?? 1;
      const next = Math.abs(goal - value) < 0.002 ? goal : value + (goal - value) * 0.22;
      if (next !== goal) moving = true;
      current[index] = next;
      tile.style.transform = next > 1.002 ? `scale(${next.toFixed(3)})` : '';
    }

    if (moving) raf = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  dock.addEventListener('pointerenter', measure);
  dock.addEventListener('pointermove', (event) => {
    if (centers.length === 0) measure();
    for (let index = 0; index < centers.length; index += 1) {
      const center = centers[index] ?? 0;
      const distance = event.clientY - center;
      targets[index] = 1 + MAX_GROWTH * Math.exp(-(distance * distance) / (2 * SIGMA * SIGMA));
    }
    start();
  });
  dock.addEventListener('pointerleave', () => {
    targets = targets.map(() => 1);
    start();
  });
  window.addEventListener('resize', measure);
}

/**
 * 左侧 Dock 导航：未分组（首页）/ 分组列表。
 * 分组支持新建、重命名、换图标、隐藏、删除；右键或长按才出菜单。
 */
export function initSidebar(
  root: HTMLElement,
  ctx: AppContext,
  options: SidebarOptions,
): SidebarHandle {
  let filter: ShortcutFilter = options.initialFilter ?? HOME_FILTER;

  // 悬停气泡：挂 body，避免被 Dock 的滚动容器裁剪
  const tip = el('div', { class: 'dock-tip', attrs: { role: 'tooltip', hidden: true } });
  document.body.append(tip);
  dockTipNode = tip;

  /** Dock 顶到下的分类顺序：未分组（首页）→ 各可见分组 */
  function orderedFilters(): ShortcutFilter[] {
    const groups = ctx.getState().groups.filter((group) => !group.hidden);
    return [
      HOME_FILTER,
      ...groups.map((group): ShortcutFilter => ({ kind: 'group', groupId: group.id })),
    ];
  }

  function pickFilter(next: ShortcutFilter, direction: -1 | 0 | 1 = 0): void {
    if (next.kind === filter.kind && (next.kind !== 'group' || next.groupId === filter.groupId)) {
      return;
    }
    filter = next;
    options.onChange(next, direction);
    render();
  }

  function cycle(direction: 1 | -1): void {
    const list = orderedFilters();
    const index = list.findIndex(
      (item) => item.kind === filter.kind && item.groupId === filter.groupId,
    );
    if (index < 0) return;
    const next = list[(index + direction + list.length) % list.length];
    if (next) pickFilter(next, direction);
  }

  function editGroup(group: ShortcutGroup): void {
    groupDialog({
      title: '编辑分组',
      initial: { name: group.name, icon: group.icon },
      confirmText: '保存',
      onSubmit: (value) => {
        const duplicated = ctx
          .getState()
          .groups.some((item) => item.id !== group.id && item.name === value.name);
        if (duplicated) return '已存在同名分组';
        ctx.update((draft) => {
          updateGroup(draft, group.id, { name: value.name, icon: value.icon });
        });
        render();
        return null;
      },
    });
  }

  function createGroup(): void {
    const state = ctx.getState();
    const nextIcon =
      GROUP_ICONS[Math.min(state.groups.length + 1, GROUP_ICONS.length - 1)]?.id ??
      DEFAULT_GROUP_ICON;

    groupDialog({
      title: '新建分组',
      initial: { name: '', icon: nextIcon },
      confirmText: '创建',
      onSubmit: (value) => {
        if (ctx.getState().groups.some((group) => group.name === value.name)) {
          return '已存在同名分组';
        }
        const created: { id: string | null } = { id: null };
        ctx.update((draft) => {
          const group = addGroup(draft, value.name, value.icon);
          created.id = group?.id ?? null;
        });
        if (!created.id) return '分组名不能为空';
        filter = { kind: 'group', groupId: created.id };
        options.onChange(filter);
        render();
        return null;
      },
    });
  }

  function hideGroup(group: ShortcutGroup): void {
    ctx.update((draft) => {
      updateGroup(draft, group.id, { hidden: !group.hidden });
    });
    if (!group.hidden && filter.kind === 'group' && filter.groupId === group.id) {
      filter = HOME_FILTER;
      options.onChange(filter);
    }
    render();
  }

  function deleteGroup(group: ShortcutGroup): void {
    void (async () => {
      const ok = await confirmDialog({
        title: '删除分组',
        message: `「${group.name}」里的快捷方式会移到未分组，不会被删除。`,
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      ctx.update((draft) => {
        removeGroup(draft, group.id);
      });
      if (filter.kind === 'group' && filter.groupId === group.id) {
        filter = HOME_FILTER;
        options.onChange(filter);
      }
      render();
    })();
  }

  function openGroupMenu(group: ShortcutGroup, x: number, y: number): void {
    // 菜单永远出现在 Dock 右侧，不压在图标上；同时收起气泡，避免两层文字叠一起
    const dockRight = root.getBoundingClientRect().right;
    root.classList.add('is-menu-open');
    hideDockTip();
    openContextMenu({
      x: Math.max(x, dockRight + 12),
      y,
      title: group.name,
      onClose: () => root.classList.remove('is-menu-open'),
      actions: [
        { label: '重命名 / 换图标', icon: 'edit', onSelect: () => editGroup(group) },
        {
          label: group.hidden ? '在 Dock 中显示' : '隐藏分组',
          icon: group.hidden ? 'eye' : 'eye-off',
          onSelect: () => hideGroup(group),
        },
        { label: '删除分组', icon: 'trash', danger: true, onSelect: () => deleteGroup(group) },
      ],
    });
  }

  function showHiddenGroups(): void {
    hiddenGroupsDialog({
      getGroups: () => ctx.getState().groups.filter((group) => group.hidden),
      onShow: (id) => {
        ctx.update((draft) => {
          updateGroup(draft, id, { hidden: false });
        });
        render();
      },
      onDelete: (id) => {
        ctx.update((draft) => {
          removeGroup(draft, id);
        });
        render();
      },
      onChanged: render,
    });
  }

  function render(): void {
    const { groups, shortcuts, folders } = ctx.getState();

    // 被删掉或被隐藏的分组不能继续作为筛选条件
    if (filter.kind === 'group') {
      const target = groups.find((group) => group.id === filter.groupId);
      if (!target || target.hidden) {
        filter = HOME_FILTER;
        options.onChange(filter);
      }
    }

    const visibleGroups = groups.filter((group) => !group.hidden);
    const hiddenGroups = groups.filter((group) => group.hidden);
    // 分组视图里看不到文件夹与内置应用（它们只在「未分组」首页出现），计数与所见一致
    const countOf = (groupId: string | null): number =>
      shortcuts.filter((item) => item.groupId === groupId && !item.folderId).length;
    // 首页还包含文件夹（内置应用不算数，避免计数虚高）
    const homeCount = countOf(null) + folders.length;

    const children: HTMLElement[] = [
      dockItem({
        label: '未分组',
        meta: `${homeCount} 个`,
        icon: 'inbox',
        active: filter.kind === 'ungrouped',
        onClick: () => pickFilter(HOME_FILTER),
      }),
    ];

    if (visibleGroups.length > 0) {
      children.push(el('span', { class: 'dock-sep', attrs: { 'aria-hidden': 'true' } }));
    }

    for (const group of visibleGroups) {
      children.push(
        dockItem({
          label: group.name,
          meta: `${countOf(group.id)} 个`,
          icon: group.icon,
          tint: tintOf(group.id),
          active: filter.kind === 'group' && filter.groupId === group.id,
          onClick: () => pickFilter({ kind: 'group', groupId: group.id }),
          onMenu: (x, y) => openGroupMenu(group, x, y),
        }),
      );
    }

    children.push(
      el('span', { class: 'dock-sep', attrs: { 'aria-hidden': 'true' } }),
      dockItem({
        label: '新建分组',
        icon: 'plus',
        onClick: createGroup,
      }),
    );

    if (hiddenGroups.length > 0) {
      children.push(
        dockItem({
          label: '隐藏的分组',
          meta: `${hiddenGroups.length} 个`,
          icon: 'eye-off',
          onClick: showHiddenGroups,
        }),
      );
    }

    hideDockTip();
    root.replaceChildren(...children);

    // 内容超高时可滚动：两端渐隐由 is-at-start 区分；激活项滚进可视区
    requestAnimationFrame(() => {
      root.classList.toggle('is-overflow', root.scrollHeight > root.clientHeight + 2);
      root.classList.toggle(
        'is-at-start',
        root.scrollTop <= 2 || !root.classList.contains('is-overflow'),
      );
      root.querySelector<HTMLElement>('.dock-item.is-active')?.scrollIntoView({ block: 'nearest' });
    });
  }

  // 自动隐藏：鼠标贴到屏幕左边缘时滑出，离开一会儿再收回去
  const sensor = el('div', { class: 'dock-sensor', attrs: { 'aria-hidden': 'true' } });
  document.body.append(sensor);
  sensor.addEventListener('mouseenter', () => {
    if (!ctx.getState().settings.sidebarCollapsed) return;
    root.classList.add('is-peek');
  });

  // 收回判定必须同时看 Dock 和感应条：指针从 Dock 挪回屏幕左边缘时，
  // 感应条早已 enter 过、不会再触发唤出；若此时把 Dock 收走，图标会在指针
  // 底下消失，再向右移回来什么也点不到 —— 表现为「再次悬停无法点击」
  const scheduleHide = (): void => {
    window.setTimeout(() => {
      if (!ctx.getState().settings.sidebarCollapsed) return;
      if (root.matches(':hover') || sensor.matches(':hover')) return;
      root.classList.remove('is-peek');
    }, 420);
  };
  root.addEventListener('mouseleave', scheduleHide);
  sensor.addEventListener('mouseleave', scheduleHide);

  attachMagnification(root);

  // 滚动时维护两端渐隐的起始端标记
  root.addEventListener('scroll', () => {
    root.classList.toggle('is-at-start', root.scrollTop <= 2);
  });

  // 滚轮策略（需 preventDefault，必须非 passive）：
  //   Dock 上        → 滚动 Dock 本身
  //   网格可横向翻页  → 滚轮横向滚网格，滚到头再切分类
  //   其余位置       → 直接切分类
  // 触控板连续小 delta：累积过阈值再切，切完进入短冷却防连跳。
  let wheelAccum = 0;
  let wheelLastAt = 0;
  let wheelCoolUntil = 0;
  window.addEventListener(
    'wheel',
    (event) => {
      if (ctx.getState().settings.minimal) return;
      if (document.querySelector('.dialog-backdrop, .drawer-backdrop')) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (target.closest('.dock')) return; // Dock 自己滚

      // 网格翻页：只在还有横向余量时接管
      const grid = target
        .closest('.shortcuts-area')
        ?.querySelector<HTMLElement>('.shortcut-grid:not(.is-empty)');
      if (grid && grid.scrollWidth > grid.clientWidth + 4) {
        const max = grid.scrollWidth - grid.clientWidth;
        const before = grid.scrollLeft;
        const atStart = before <= 0 && event.deltaY < 0;
        const atEnd = before >= max - 1 && event.deltaY > 0;
        if (!atStart && !atEnd) {
          event.preventDefault();
          grid.scrollLeft = Math.max(0, Math.min(max, before + event.deltaY));
          grid.classList.toggle('is-at-start', grid.scrollLeft <= 2);
          return;
        }
      }

      const now = Date.now();
      if (now - wheelLastAt > 240) wheelAccum = 0;
      wheelLastAt = now;
      if (now < wheelCoolUntil) return;

      wheelAccum += event.deltaY;
      if (Math.abs(wheelAccum) < 120) return;
      const direction = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      wheelCoolUntil = now + 520;
      cycle(direction);
    },
    { passive: false },
  );

  render();

  return { render, getFilter: () => filter, cycle };
}
