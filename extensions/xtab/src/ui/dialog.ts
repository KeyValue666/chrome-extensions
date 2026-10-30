import { el } from '../lib/dom';
import { tintOf } from '../lib/color';
import { createIcon, type IconName } from '../lib/icons';
import { GROUP_ICONS, LIMITS } from '../shared/constants';
import { normalizeUrl } from '../lib/url';
import type { GroupIconId, ShortcutGroup } from '../shared/types';

const root = (): HTMLElement | null => document.getElementById('dialog-root');

const closers = new Set<() => void>();

export function closeAllDialogs(): void {
  for (const close of [...closers]) close();
}

/** 单输入改名弹窗：文件夹重命名等场景，复用 openModal 的骨架与 Esc 行为 */
export function nameDialog(options: {
  title: string;
  initial: string;
  placeholder?: string;
  maxLength?: number;
  confirmText?: string;
  onSubmit: (name: string) => string | null;
}): void {
  const input = el('input', {
    class: 'field-input',
    attrs: {
      type: 'text',
      value: options.initial,
      placeholder: options.placeholder ?? '请输入名称',
      maxlength: String(options.maxLength ?? LIMITS.folderName),
      autocomplete: 'off',
    },
  });

  const error = el('p', { class: 'dialog-error', attrs: { role: 'alert' } });

  const body = el('div', { class: 'dialog-body' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '名称' }), input]),
    error,
  ]);

  const submit = (): void => {
    const failure = options.onSubmit(input.value.trim());
    if (failure) {
      error.textContent = failure;
      return;
    }
    close();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  const close = openModal({
    title: options.title,
    body,
    footer: el('footer', { class: 'dialog-footer' }, [
      el('button', {
        class: 'button',
        text: '取消',
        attrs: { type: 'button' },
        on: { click: () => close() },
      }),
      el('button', {
        class: 'button button-primary dialog-primary',
        text: options.confirmText ?? '保存',
        attrs: { type: 'button' },
        on: { click: submit },
      }),
    ]),
  });

  input.focus();
  input.select();
}

interface ModalOptions {
  title: string;
  subtitle?: string;
  body: HTMLElement;
  footer?: HTMLElement;
  /** lg 用于待办 / 便签这类内容较多的面板 */
  size?: 'md' | 'lg';
  /** 内容自带内边距（待办列表、便签）时不再叠加 dialog-body 的 padding */
  flush?: boolean;
  /** 关闭后回调：用于刷新工具条徽标等衍生信息 */
  onClose?: () => void;
}

export function openModal({
  title,
  subtitle,
  body,
  footer,
  size = 'md',
  flush = false,
  onClose,
}: ModalOptions): () => void {
  const host = root();
  if (!host) return () => undefined;

  let closed = false;

  function close(): void {
    if (closed) return;
    closed = true;
    closers.delete(close);
    document.removeEventListener('keydown', onKeyDown);
    backdrop.classList.remove('is-open');
    window.setTimeout(() => {
      backdrop.remove();
      onClose?.();
    }, 200);
  }

  function onKeyDown(event: KeyboardEvent): void {
    // 只在最上层弹窗响应 Esc，避免嵌套弹窗一次全关
    if (event.key === 'Escape' && host?.lastElementChild === backdrop) {
      event.stopPropagation();
      close();
    }
  }

  const titleId = `dialog-title-${Math.random().toString(36).slice(2, 8)}`;

  const panel = el(
    'div',
    {
      class: `dialog dialog-${size}${flush ? ' is-flush' : ''}`,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    },
    [
      el('header', { class: 'dialog-header' }, [
        el('div', { class: 'dialog-heading' }, [
          el('h2', { class: 'dialog-title', text: title, attrs: { id: titleId } }),
          ...(subtitle ? [el('p', { class: 'dialog-subtitle', text: subtitle })] : []),
        ]),
        el(
          'button',
          {
            class: 'icon-button dialog-close',
            attrs: { type: 'button', 'aria-label': '关闭' },
            on: { click: close },
          },
          [createIcon('close', 17)],
        ),
      ]),
      body,
      ...(footer ? [footer] : []),
    ],
  );

  const backdrop = el(
    'div',
    {
      class: 'dialog-backdrop',
      on: {
        mousedown: (event) => {
          if (event.target === backdrop) close();
        },
      },
    },
    [panel],
  );

  host.append(backdrop);
  closers.add(close);
  document.addEventListener('keydown', onKeyDown);

  // 下一帧再加 is-open，让浏览器先渲染初始状态，过渡才会生效
  requestAnimationFrame(() => backdrop.classList.add('is-open'));

  const focusTarget = panel.querySelector<HTMLElement>(
    'input, textarea, select, button.dialog-primary, button',
  );
  focusTarget?.focus({ preventScroll: true });

  return close;
}

export function confirmDialog(options: {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean, close: () => void): void => {
      if (settled) return;
      settled = true;
      close();
      resolve(value);
    };

    const body = el('div', { class: 'dialog-body' }, [
      el('p', { class: 'dialog-message', text: options.message }),
    ]);

    const cancelButton = el('button', {
      class: 'button',
      text: '取消',
      attrs: { type: 'button' },
      on: { click: () => finish(false, close) },
    });

    const confirmButton = el('button', {
      class: options.danger ? 'button button-danger' : 'button button-primary dialog-primary',
      text: options.confirmText ?? '确定',
      attrs: { type: 'button' },
      on: { click: () => finish(true, close) },
    });

    const close = openModal({
      title: options.title,
      body,
      footer: el('footer', { class: 'dialog-footer' }, [cancelButton, confirmButton]),
    });

    confirmButton.focus();
  });
}

export interface ShortcutFormValue {
  title: string;
  url: string;
  groupId: string | null;
}

interface GroupPicker {
  node: HTMLElement;
  getValue(): string | null;
  /** 弹窗关闭时调用：把挂在 body 上的菜单移除，避免泄漏 */
  dispose(): void;
}

/**
 * 分组选择器：替代原生 select。按钮显示当前分组的彩色图标 + 名称，
 * 弹出菜单列出全部选项（选中项打勾），支持方向键 / Enter / Esc 键盘操作。
 * 菜单挂在 body 上用 fixed 定位 —— dialog 有 overflow 裁剪，绝对定位会被切掉。
 */
function groupPicker(options: { groups: ShortcutGroup[]; value: string | null }): GroupPicker {
  const entries: { id: string; name: string; icon: IconName; tint: string }[] = [
    { id: '', name: '未分组', icon: 'inbox', tint: '' },
    ...options.groups.map((group) => ({
      id: group.id,
      name: group.name,
      icon: group.icon,
      tint: tintOf(group.id),
    })),
  ];

  let value = options.value ?? '';
  let isOpen = false;
  let focusIndex = -1;

  const menu = el('div', {
    class: 'group-picker-menu',
    attrs: { role: 'listbox', 'aria-label': '选择分组', hidden: true },
  });
  document.body.append(menu);

  const button = el('button', {
    class: 'group-picker-button',
    attrs: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    on: { click: () => (isOpen ? closeMenu() : openMenu()) },
  });

  const chip = (entry: { icon: IconName; tint: string }): HTMLElement => {
    const chipNode = el('span', { class: 'group-picker-icon' }, [createIcon(entry.icon, 14)]);
    if (entry.tint) {
      chipNode.classList.add('has-tint');
      chipNode.style.setProperty('--tile-bg', entry.tint);
    }
    return chipNode;
  };

  const renderButton = (): void => {
    const current = entries.find((entry) => entry.id === value) ?? entries[0]!;
    button.replaceChildren(
      chip(current),
      el('span', { class: 'group-picker-name', text: current.name }),
      el('span', { class: 'caret', attrs: { 'aria-hidden': 'true' } }),
    );
  };

  const syncFocus = (): void => {
    [...menu.children].forEach((node, index) => {
      node.classList.toggle('is-focused', index === focusIndex);
    });
  };

  const move = (delta: 1 | -1): void => {
    focusIndex = (focusIndex + delta + entries.length) % entries.length;
    syncFocus();
  };

  const choose = (index: number): void => {
    const entry = entries[index];
    if (!entry) return;
    value = entry.id;
    [...menu.children].forEach((node, i) => {
      node.classList.toggle('is-active', i === index);
      node.setAttribute('aria-selected', String(i === index));
    });
    renderButton();
    closeMenu();
  };

  const items = entries.map((entry, index) => {
    const option = el(
      'button',
      {
        class: `group-picker-option${entry.id === value ? ' is-active' : ''}`,
        attrs: {
          type: 'button',
          role: 'option',
          'aria-selected': String(entry.id === value),
        },
        on: {
          click: () => choose(index),
          mouseenter: () => {
            focusIndex = index;
            syncFocus();
          },
        },
      },
      [
        chip(entry),
        el('span', { class: 'group-picker-name', text: entry.name }),
        el('span', { class: 'group-picker-check' }, [createIcon('check', 14)]),
      ],
    );
    return option;
  });
  menu.replaceChildren(...items);

  const onDocKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(focusIndex);
    }
  };

  const onDocDown = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return;
    if (!target.closest('.group-picker') && !target.closest('.group-picker-menu')) closeMenu();
  };

  /** 菜单挂在 body 上，需要手动对齐按钮；下方放不下时向上翻 */
  const positionMenu = (): void => {
    const rect = button.getBoundingClientRect();
    menu.style.width = `${rect.width}px`;
    menu.hidden = false;
    const height = menu.offsetHeight;
    if (rect.bottom + 8 + height > window.innerHeight - 12) {
      menu.style.top = `${Math.max(12, rect.top - height - 8)}px`;
    } else {
      menu.style.top = `${rect.bottom + 8}px`;
    }
    menu.style.left = `${rect.left}px`;
  };

  const onScroll = (): void => {
    if (isOpen) positionMenu();
  };

  function openMenu(): void {
    if (isOpen) return;
    isOpen = true;
    positionMenu();
    button.setAttribute('aria-expanded', 'true');
    focusIndex = Math.max(
      0,
      entries.findIndex((entry) => entry.id === value),
    );
    syncFocus();
    document.addEventListener('keydown', onDocKey, true);
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('scroll', onScroll, true);
  }

  function closeMenu(): void {
    if (!isOpen) return;
    isOpen = false;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onDocKey, true);
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('scroll', onScroll, true);
  }

  renderButton();

  return {
    node: el('div', { class: 'group-picker' }, [button]),
    getValue: () => value || null,
    dispose: () => {
      closeMenu();
      menu.remove();
    },
  };
}

/** 新增/编辑快捷方式弹窗；onSubmit 返回错误文案表示校验失败，弹窗保持打开 */
export function shortcutDialog(options: {
  title: string;
  groups: ShortcutGroup[];
  initial?: ShortcutFormValue;
  onSubmit: (value: ShortcutFormValue) => string | null;
}): void {
  const initial: ShortcutFormValue = options.initial ?? { title: '', url: '', groupId: null };

  const titleInput = el('input', {
    class: 'field-input',
    attrs: {
      type: 'text',
      value: initial.title,
      placeholder: '例如 GitHub',
      maxlength: LIMITS.shortcutTitle,
    },
  });

  const urlInput = el('input', {
    class: 'field-input',
    attrs: {
      type: 'text',
      value: initial.url,
      placeholder: '例如 github.com',
      spellcheck: 'false',
      autocomplete: 'off',
    },
  });

  const picker = groupPicker({ groups: options.groups, value: initial.groupId });

  const error = el('p', { class: 'dialog-error', attrs: { role: 'alert' } });

  const body = el('div', { class: 'dialog-body' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: '名称' }),
      titleInput,
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: '网址' }), urlInput]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: '分组' }),
      picker.node,
    ]),
    error,
  ]);

  const submit = (): void => {
    const url = normalizeUrl(urlInput.value);
    if (!url) {
      error.textContent = '网址无效，只支持 http/https 地址';
      urlInput.classList.add('is-invalid');
      urlInput.focus();
      return;
    }
    const groupValue = picker.getValue();
    const failure = options.onSubmit({
      title: titleInput.value.trim(),
      url,
      groupId: groupValue,
    });
    if (failure) {
      error.textContent = failure;
      return;
    }
    close();
  };

  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  const close = openModal({
    title: options.title,
    body,
    onClose: () => picker.dispose(),
    footer: el('footer', { class: 'dialog-footer' }, [
      el('button', {
        class: 'button',
        text: '取消',
        attrs: { type: 'button' },
        on: { click: () => close() },
      }),
      el('button', {
        class: 'button button-primary dialog-primary',
        text: '保存',
        attrs: { type: 'button' },
        on: { click: submit },
      }),
    ]),
  });

  (initial.title ? urlInput : titleInput).focus();
}

/** 新建 / 编辑分组：名称 + 图标选择 */
export function groupDialog(options: {
  title: string;
  initial: { name: string; icon: GroupIconId };
  confirmText?: string;
  onSubmit: (value: { name: string; icon: GroupIconId }) => string | null;
}): void {
  let icon: GroupIconId = options.initial.icon;

  const nameInput = el('input', {
    class: 'field-input',
    attrs: {
      type: 'text',
      value: options.initial.name,
      placeholder: '例如 工作、开发、娱乐',
      maxlength: LIMITS.groupName,
      autocomplete: 'off',
    },
  });

  const preview = el('span', { class: 'group-preview', attrs: { 'aria-hidden': 'true' } });
  const renderPreview = (): void => {
    preview.replaceChildren(createIcon(icon, 18));
  };

  const choices = GROUP_ICONS.map((entry) => {
    const button = el(
      'button',
      {
        class: `icon-choice${entry.id === icon ? ' is-active' : ''}`,
        title: entry.label,
        attrs: {
          type: 'button',
          role: 'radio',
          'aria-checked': String(entry.id === icon),
          'aria-label': entry.label,
        },
        on: {
          click: () => {
            icon = entry.id;
            for (const node of choices) {
              node.classList.toggle('is-active', node === button);
              node.setAttribute('aria-checked', String(node === button));
            }
            renderPreview();
          },
        },
      },
      [createIcon(entry.id, 18)],
    );
    return button;
  });

  renderPreview();

  const error = el('p', { class: 'dialog-error', attrs: { role: 'alert' } });

  const body = el('div', { class: 'dialog-body' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: '分组名称' }),
      el('div', { class: 'field-inline' }, [preview, nameInput]),
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: '图标' }),
      el(
        'div',
        { class: 'icon-grid', attrs: { role: 'radiogroup', 'aria-label': '分组图标' } },
        choices,
      ),
    ]),
    error,
  ]);

  const submit = (): void => {
    const name = nameInput.value.trim();
    if (!name) {
      error.textContent = '请填写分组名称';
      nameInput.classList.add('is-invalid');
      nameInput.focus();
      return;
    }
    const failure = options.onSubmit({ name, icon });
    if (failure) {
      error.textContent = failure;
      return;
    }
    close();
  };

  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  const close = openModal({
    title: options.title,
    body,
    footer: el('footer', { class: 'dialog-footer' }, [
      el('button', {
        class: 'button',
        text: '取消',
        attrs: { type: 'button' },
        on: { click: () => close() },
      }),
      el('button', {
        class: 'button button-primary dialog-primary',
        text: options.confirmText ?? '保存',
        attrs: { type: 'button' },
        on: { click: submit },
      }),
    ]),
  });

  nameInput.focus();
  nameInput.select();
}

/** 隐藏的分组：恢复显示或删除 */
export function hiddenGroupsDialog(options: {
  getGroups: () => ShortcutGroup[];
  onShow: (id: string) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
}): void {
  const list = el('div', { class: 'group-list' });

  const renderList = (): void => {
    const groups = options.getGroups();
    if (groups.length === 0) {
      list.replaceChildren(el('p', { class: 'hint', text: '没有被隐藏的分组。' }));
      return;
    }

    list.replaceChildren(
      ...groups.map((group) =>
        el('div', { class: 'group-row' }, [
          el('span', { class: 'group-row-icon' }, [createIcon(group.icon, 16)]),
          el('span', { class: 'group-row-name', text: group.name }),
          el(
            'button',
            {
              class: 'chip-button',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  options.onShow(group.id);
                  options.onChanged();
                  renderList();
                },
              },
            },
            [createIcon('eye', 14), '显示'],
          ),
          el(
            'button',
            {
              class: 'icon-button',
              attrs: { type: 'button', 'aria-label': `删除 ${group.name}` },
              on: {
                click: () => {
                  void (async () => {
                    const ok = await confirmDialog({
                      title: '删除分组',
                      message: `「${group.name}」里的快捷方式会移到未分组，不会被删除。`,
                      confirmText: '删除',
                      danger: true,
                    });
                    if (!ok) return;
                    options.onDelete(group.id);
                    options.onChanged();
                    renderList();
                  })();
                },
              },
            },
            [createIcon('trash', 15)],
          ),
        ]),
      ),
    );
  };

  renderList();

  const doneButton = el('button', {
    class: 'button button-primary dialog-primary',
    text: '完成',
    attrs: { type: 'button' },
  });

  const close = openModal({
    title: '隐藏的分组',
    subtitle: '隐藏不会删除数据，随时可以恢复',
    body: el('div', { class: 'dialog-body' }, [list]),
    footer: el('footer', { class: 'dialog-footer' }, [doneButton]),
  });

  doneButton.addEventListener('click', () => close());
}
