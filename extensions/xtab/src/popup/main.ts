import '../styles/popup.css';

import { el } from '../lib/dom';
import { createIcon } from '../lib/icons';
import { faviconUrl, hostnameOf, normalizeUrl } from '../lib/url';
import { ACCENT_PRESETS } from '../shared/constants';
import { MAX_SHORTCUTS, addShortcut, removeShortcut } from '../shared/state';
import { loadState, saveState } from '../shared/storage';
import type { AppState, Shortcut } from '../shared/types';
import { findDuplicate, groupNameOf, groupTargets, resolveTitle, toTabInfo } from './logic';

/** 记住上次选的分组：连续收藏同一类站点时不必重复选 */
const LAST_GROUP_KEY = 'xtab:popup:lastGroup';

const root = document.getElementById('pop');
if (!root) throw new Error('缺少 #pop 容器');

interface Draft {
  title: string;
  url: string;
  groupId: string | null;
  /** 提示「已在某分组里」后，用户仍坚持再存一份 */
  force: boolean;
}

type View =
  | { kind: 'loading' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'form'; state: AppState; draft: Draft; duplicate: Shortcut | null }
  | { kind: 'done'; state: AppState; shortcut: Shortcut; label: string };

let state: AppState | null = null;
let draft: Draft = { title: '', url: '', groupId: null, force: false };
let view: View = { kind: 'loading' };

/* ---------- 主题：跟随 XTab 设置，auto 时按系统 ---------- */

const applyTheme = (settings: AppState['settings']): void => {
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const mode = settings.theme === 'auto' ? (prefersLight ? 'light' : 'dark') : settings.theme;
  document.documentElement.dataset.theme = mode;

  const preset = ACCENT_PRESETS.find((item) => item.id === settings.accentId);
  if (preset) {
    document.documentElement.style.setProperty(
      '--accent',
      mode === 'light' ? preset.light : preset.dark,
    );
  }
};

/* ---------- 当前标签页 ---------- */

const readActiveTab = async (): Promise<{ url?: string; title?: string } | null> => {
  const tabs = typeof chrome !== 'undefined' ? chrome.tabs : undefined;
  if (!tabs?.query) return null;
  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  } catch {
    return null;
  }
};

const openApp = (): void => {
  const page =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('index.html')
      : 'index.html';
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    void chrome.tabs.create({ url: page });
    window.close();
    return;
  }
  window.open(page, '_blank');
};

/* ---------- 提交 / 撤销 ---------- */

const submit = async (): Promise<void> => {
  const current = state;
  if (!current) return;

  const url = normalizeUrl(draft.url);
  if (!url || current.shortcuts.length >= MAX_SHORTCUTS) {
    render();
    return;
  }

  const shortcut = addShortcut(current, {
    title: resolveTitle(draft.title, url),
    url,
    groupId: draft.groupId,
  });
  if (!shortcut) {
    render();
    return;
  }

  try {
    await saveState(current);
  } catch {
    // 落盘失败就撤回内存改动，避免面板显示成功但实际没存
    removeShortcut(current, shortcut.id);
    render();
    return;
  }

  localStorage.setItem(LAST_GROUP_KEY, draft.groupId ?? '');
  view = {
    kind: 'done',
    state: current,
    shortcut,
    label: groupNameOf(current, shortcut.groupId),
  };
  render();
};

const undo = async (): Promise<void> => {
  const current = view;
  if (current.kind !== 'done') return;

  removeShortcut(current.state, current.shortcut.id);
  try {
    await saveState(current.state);
  } catch {
    render();
    return;
  }

  draft = { ...draft, title: current.shortcut.title, url: current.shortcut.url, force: false };
  view = { kind: 'form', state: current.state, draft, duplicate: null };
  render();
};

/* ---------- 小组件 ---------- */

const head = (): HTMLElement =>
  el('div', { class: 'pop-head' }, [
    el('img', { class: 'pop-logo', attrs: { src: 'icons/icon-32.png', alt: '' } }),
    el('h1', { class: 'pop-heading', text: '添加到 XTab' }),
  ]);

/** 站点图标：favicon 失败时退回主机名首字母 */
const paintIcon = (host: HTMLElement, rawUrl: string): void => {
  const url = normalizeUrl(rawUrl);
  const letter = (hostnameOf(url ?? rawUrl)[0] ?? '?').toUpperCase();
  const src = url ? faviconUrl(url, 32) : null;
  if (!src) {
    host.textContent = letter;
    return;
  }
  const image = el('img', { attrs: { src, alt: '', width: 20, height: 20 } });
  image.addEventListener('error', () => {
    host.textContent = letter;
  });
  host.replaceChildren(image);
};

/* ---------- 渲染 ---------- */

const renderForm = (current: Extract<View, { kind: 'form' }>): void => {
  const appState = current.state;
  const { duplicate } = current;
  const url = normalizeUrl(draft.url);
  const atLimit = appState.shortcuts.length >= MAX_SHORTCUTS;
  const blocked = Boolean(duplicate) && !draft.force;

  const submitButton = el('button', {
    class: 'btn btn-primary',
    text: duplicate && draft.force ? '再存一份' : '添加',
    attrs: { type: 'button', disabled: !url || atLimit || blocked },
    on: { click: () => void submit() },
  });

  const syncSubmit = (): void => {
    submitButton.disabled = !normalizeUrl(draft.url) || atLimit;
  };

  const iconHost = el('span', { class: 'site-icon' });
  paintIcon(iconHost, url ?? draft.url);

  const titleInput = el('input', {
    class: 'field field-title',
    attrs: {
      type: 'text',
      value: draft.title,
      'aria-label': '快捷方式名称',
      placeholder: '给它起个名字',
      maxlength: String(40),
      spellcheck: 'false',
    },
    on: {
      input: (event) => {
        draft = { ...draft, title: (event.target as HTMLInputElement).value };
      },
      keydown: (event) => {
        if (event.key === 'Enter') void submit();
      },
    },
  });

  const urlInput = el('input', {
    class: `field field-url${url ? '' : ' is-invalid'}`,
    attrs: {
      type: 'text',
      value: draft.url,
      'aria-label': '网址',
      placeholder: 'https://example.com',
      spellcheck: 'false',
    },
    on: {
      input: (event) => {
        const field = event.target as HTMLInputElement;
        draft = { ...draft, url: field.value, force: false };
        const next = normalizeUrl(field.value);
        field.classList.toggle('is-invalid', !next);
        paintIcon(iconHost, field.value);
        syncSubmit();
      },
      keydown: (event) => {
        if (event.key === 'Enter') void submit();
      },
    },
  });

  const chips = el(
    'div',
    { class: 'chips', attrs: { role: 'radiogroup', 'aria-label': '保存到分组' } },
    groupTargets(appState).map((target) =>
      el('button', {
        class: `chip${target.id === draft.groupId ? ' is-active' : ''}`,
        text: target.name,
        attrs: {
          type: 'button',
          role: 'radio',
          'aria-checked': String(target.id === draft.groupId),
        },
        on: {
          click: () => {
            draft = { ...draft, groupId: target.id };
            render();
          },
        },
      }),
    ),
  );

  const notices: HTMLElement[] = [];
  if (!url) {
    notices.push(el('p', { class: 'notice is-warn', text: '这个地址不是 http/https 网页' }));
  } else if (duplicate) {
    notices.push(
      el('div', { class: 'notice' }, [
        el('span', { text: `已在「${groupNameOf(appState, duplicate.groupId)}」里` }),
        draft.force
          ? el('span', { text: '· 将再存一份' })
          : el('button', {
              class: 'notice-link',
              text: '仍要添加',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  draft = { ...draft, force: true };
                  render();
                },
              },
            }),
      ]),
    );
  } else if (atLimit) {
    notices.push(el('p', { class: 'notice is-warn', text: '快捷方式已达 300 条上限' }));
  }

  root.replaceChildren(
    head(),
    el('div', { class: 'site' }, [
      iconHost,
      el('div', { class: 'site-fields' }, [titleInput, urlInput]),
    ]),
    chips,
    ...notices,
    submitButton,
    el('p', { class: 'pop-foot' }, [
      el('span', { text: '只写入本机 · 不联网' }),
      el('button', {
        class: 'notice-link',
        text: '打开 XTab',
        attrs: { type: 'button' },
        on: { click: openApp },
      }),
    ]),
  );

  // 键盘流：点图标后直接回车即可保存
  submitButton.focus({ preventScroll: true });
};

const renderDone = (current: Extract<View, { kind: 'done' }>): void => {
  root.replaceChildren(
    head(),
    el('div', { class: 'done' }, [
      el('span', { class: 'done-badge' }, [createIcon('check', 20)]),
      el('p', { class: 'done-text', text: `已添加到「${current.label}」` }),
      el('p', { class: 'done-sub', text: current.shortcut.title }),
      el('div', { class: 'done-actions' }, [
        el('button', {
          class: 'btn btn-ghost',
          text: '撤销',
          attrs: { type: 'button' },
          on: { click: () => void undo() },
        }),
        el('button', {
          class: 'btn btn-primary',
          text: '打开 XTab',
          attrs: { type: 'button' },
          on: { click: openApp },
        }),
      ]),
    ]),
  );
};

const renderBlocked = (reason: string): void => {
  root.replaceChildren(
    head(),
    el('p', { class: 'notice is-warn', text: reason }),
    el('button', {
      class: 'btn btn-ghost',
      text: '打开 XTab 手动添加',
      attrs: { type: 'button' },
      on: { click: openApp },
    }),
  );
};

const render = (): void => {
  if (view.kind === 'loading') {
    root.replaceChildren(head(), el('div', { class: 'skeleton' }));
    return;
  }
  if (view.kind === 'blocked') {
    renderBlocked(view.reason);
    return;
  }
  if (view.kind === 'done') {
    renderDone(view);
    return;
  }
  renderForm(view);
};

/* ---------- 启动 ---------- */

const boot = async (): Promise<void> => {
  render();

  state = await loadState();
  applyTheme(state.settings);

  // 恢复上次的分组选择；该分组已被删掉就回到未分组
  const remembered = localStorage.getItem(LAST_GROUP_KEY);
  const rememberedTarget = groupTargets(state).find(
    (target) => (target.id ?? '') === (remembered ?? ''),
  );
  draft = { ...draft, groupId: rememberedTarget ? rememberedTarget.id : null };

  const info = toTabInfo(await readActiveTab());
  if (!info) {
    view = {
      kind: 'blocked',
      reason: '读不到当前页面：chrome:// 等系统页面无法收藏，或没有读取权限',
    };
    render();
    return;
  }

  draft = { ...draft, url: info.url, title: info.title };
  view = { kind: 'form', state, draft, duplicate: findDuplicate(state, info.url) };
  render();
};

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

void boot().catch((error: unknown) => {
  console.error('[xtab] 收藏面板启动失败', error);
  renderBlocked('面板初始化失败，请重试');
});
