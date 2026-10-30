import type { AppContext } from '../shared/context';
import { MAX_SEARCH_HISTORY, SEARCH_ENGINES, findEngine } from '../shared/constants';
import { clearSearchHistory, pushSearchHistory, removeSearchHistory } from '../shared/state';
import { el } from '../lib/dom';
import { createIcon } from '../lib/icons';
import { looksLikeUrl, resolveSearchInput } from '../lib/url';

export interface SearchHandle {
  render(): void;
  focus(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

/**
 * 各引擎的品牌图标：圆角色块 + 简化图形，全部本地绘制，
 * 不加载任何网络图标（扩展零网络请求的底线不能破）。
 */
function engineArt(id: string): SVGElement {
  const tile = (bg: string, children: SVGElement[]): SVGElement =>
    svgNode('svg', { viewBox: '0 0 24 24', class: 'engine-art', 'aria-hidden': 'true' }, [
      svgNode('rect', { x: '1', y: '1', width: '22', height: '22', rx: '6.5', fill: bg }),
      ...children,
    ]);
  const glyph = (text: string, size = '12'): SVGElement => {
    const node = svgNode('text', {
      x: '12',
      y: '16.8',
      'text-anchor': 'middle',
      fill: '#fff',
      'font-size': size,
      'font-weight': '700',
      'font-family': 'inherit',
    });
    node.textContent = text;
    return node;
  };

  switch (id) {
    case 'google':
      return tile('#4285f4', [glyph('G')]);
    case 'bing':
      return tile('#0c8484', [glyph('b')]);
    case 'baidu':
      // 熊爪：掌心椭圆 + 四枚脚趾
      return tile('#2932e1', [
        svgNode('ellipse', { cx: '12', cy: '15.4', rx: '4.1', ry: '3.3', fill: '#fff' }),
        ...[
          ['7.2', '9.4'],
          ['10.3', '7.4'],
          ['13.7', '7.4'],
          ['16.8', '9.4'],
        ].map(([cx, cy]) =>
          svgNode('circle', { cx: cx ?? '0', cy: cy ?? '0', r: '1.55', fill: '#fff' }),
        ),
      ]);
    case 'zhihu':
      return tile('#0066ff', [glyph('知')]);
    case 'bilibili':
      // 小电视：圆角屏幕 + 两根天线
      return tile('#fb7299', [
        svgNode('rect', {
          x: '4.6',
          y: '8',
          width: '14.8',
          height: '10.6',
          rx: '3.2',
          fill: 'none',
          stroke: '#fff',
          'stroke-width': '1.8',
        }),
        svgNode('path', {
          d: 'M8.6 4.4l2.3 3M15.4 4.4l-2.3 3',
          stroke: '#fff',
          'stroke-width': '1.8',
          'stroke-linecap': 'round',
          fill: 'none',
        }),
      ]);
    case 'github':
      // 简化猫头：圆头 + 双耳 + 两眼
      return tile('#24292f', [
        svgNode('path', { d: 'M7.4 10.8 6.2 6.6l3.8 2zM16.6 10.8l1.2-4.2-3.8 2z', fill: '#fff' }),
        svgNode('circle', { cx: '12', cy: '13.8', r: '5.3', fill: '#fff' }),
        svgNode('circle', { cx: '10', cy: '13.4', r: '0.95', fill: '#24292f' }),
        svgNode('circle', { cx: '14', cy: '13.4', r: '0.95', fill: '#24292f' }),
      ]);
    case 'sogou':
      return tile('#f4610f', [glyph('S')]);
    default:
      return tile('#de5833', [glyph('D')]);
  }
}

/** 搜索框：输入网址直接跳转，否则用当前引擎搜索（不发送任何后台请求） */
export function initSearch(ctx: AppContext): SearchHandle {
  const root = document.getElementById('search');
  if (!root) throw new Error('搜索容器缺失');

  const input = el('input', {
    class: 'search-input',
    attrs: {
      type: 'text',
      placeholder: '搜索，或输入网址直接打开',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': '搜索或输入网址',
    },
  });

  const engineIconHost = el('span', { class: 'search-engine-art' });
  const engineButton = el(
    'button',
    {
      class: 'search-engine',
      title: '切换搜索引擎',
      attrs: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    },
    [engineIconHost, el('span', { class: 'caret', attrs: { 'aria-hidden': 'true' } })],
  );

  const menu = el('div', {
    class: 'engine-menu',
    attrs: { role: 'listbox', 'aria-label': '搜索引擎', hidden: true },
  });

  /* ---------- 搜索历史（纯本地，最多 MAX_SEARCH_HISTORY 条） ---------- */

  const suggest = el('div', {
    class: 'search-suggest',
    attrs: { role: 'listbox', 'aria-label': '最近搜索', hidden: true },
  });

  let suggestActive = -1;

  const closeSuggest = (): void => {
    suggest.hidden = true;
    suggestActive = -1;
  };

  const openSuggest = (): void => {
    const { searchHistory, settings } = ctx.getState();
    if (!settings.searchHistoryEnabled || searchHistory.length === 0) {
      closeSuggest();
      return;
    }
    const query = input.value.trim().toLowerCase();
    const items = query
      ? searchHistory.filter((item) => item.toLowerCase().includes(query))
      : searchHistory;

    if (items.length === 0) {
      closeSuggest();
      return;
    }

    const buildRow = (text: string, index: number): HTMLElement => {
      const row = el(
        'button',
        {
          class: `suggest-item${index === suggestActive ? ' is-active' : ''}`,
          attrs: { type: 'button', role: 'option', 'aria-label': `搜索 ${text}` },
          on: {
            click: () => {
              input.value = text;
              closeSuggest();
              submitSearch(text);
            },
          },
        },
        [
          el('span', { class: 'suggest-icon', attrs: { 'aria-hidden': 'true' } }, [
            createIcon('search', 13),
          ]),
          el('span', { class: 'suggest-text', text: text }),
          el(
            'span',
            {
              class: 'suggest-remove',
              title: '删除这条记录',
              attrs: { type: 'button', role: 'button', 'aria-label': `删除 ${text}` },
            },
            [createIcon('close', 12)],
          ),
        ],
      ) as HTMLButtonElement;

      // 点删除不触发整行搜索
      row.querySelector('.suggest-remove')?.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      row.querySelector('.suggest-remove')?.addEventListener('click', (event) => {
        event.stopPropagation();
        ctx.update((draft) => {
          removeSearchHistory(draft, text);
        });
        openSuggest();
      });
      return row;
    };

    const header = el('div', { class: 'suggest-header' }, [
      el('span', { class: 'suggest-title', text: '最近搜索' }),
      el(
        'button',
        {
          class: 'link-button',
          attrs: { type: 'button' },
          on: {
            click: () => {
              ctx.update((draft) => {
                clearSearchHistory(draft);
              });
              closeSuggest();
            },
          },
        },
        ['清空'],
      ),
    ]);

    suggestActive = -1;
    suggest.replaceChildren(header, ...items.slice(0, MAX_SEARCH_HISTORY).map(buildRow));
    suggest.hidden = false;
  };

  /** 下拉键盘导航：返回 true 表示已消费按键 */
  const handleSuggestKeys = (event: KeyboardEvent): boolean => {
    if (suggest.hidden) return false;
    const rows = [...suggest.querySelectorAll<HTMLButtonElement>('.suggest-item')];
    if (rows.length === 0) return false;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      suggestActive = (suggestActive + delta + rows.length) % rows.length;
      rows.forEach((row, index) => row.classList.toggle('is-active', index === suggestActive));
      return true;
    }
    if (event.key === 'Enter' && suggestActive >= 0) {
      event.preventDefault();
      rows[suggestActive]?.click();
      return true;
    }
    return false;
  };

  /* ---------- 引擎菜单 ---------- */
  const closeMenu = (): void => {
    menu.hidden = true;
    engineButton.setAttribute('aria-expanded', 'false');
  };

  const openMenu = (): void => {
    menu.hidden = false;
    engineButton.setAttribute('aria-expanded', 'true');
  };

  const syncEngines = (): void => {
    const currentId = ctx.getState().settings.searchEngine;
    menu.replaceChildren(
      ...SEARCH_ENGINES.map((engine) => {
        const active = engine.id === currentId;
        return el(
          'button',
          {
            class: `engine-option${active ? ' is-active' : ''}`,
            attrs: {
              type: 'button',
              role: 'option',
              'aria-selected': String(active),
              title: engine.name,
            },
            on: {
              click: () => {
                ctx.update((state) => {
                  state.settings.searchEngine = engine.id;
                });
                syncEngines();
                closeMenu();
                input.focus();
              },
            },
          },
          [
            el('span', { class: 'engine-option-icon' }, [engineArt(engine.id)]),
            el('span', { class: 'engine-option-name', text: engine.name }),
          ],
        );
      }),
    );
    engineIconHost.replaceChildren(engineArt(currentId));
    engineButton.setAttribute('aria-label', `搜索引擎：${findEngine(currentId).name}`);
  };

  engineButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  const form = el('form', { class: 'search-form', attrs: { role: 'search' } }, [
    el('span', { class: 'search-icon', attrs: { 'aria-hidden': 'true' } }, [
      createIcon('search', 20),
    ]),
    input,
    engineButton,
    menu,
    suggest,
  ]);

  /** 真正执行跳转；像网址的输入不记入搜索历史 */
  const submitSearch = (raw: string): void => {
    const engine = findEngine(ctx.getState().settings.searchEngine);
    const target = resolveSearchInput(raw, engine);
    if (!target) {
      input.focus();
      return;
    }
    if (!looksLikeUrl(raw.trim())) {
      ctx.update((draft) => {
        pushSearchHistory(draft, raw);
      });
    }
    // 新标签页本身就是空页面，直接在当前页跳转，不额外开标签
    window.location.assign(target);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    closeSuggest();
    submitSearch(input.value);
  });

  input.addEventListener('input', () => {
    if (input.value.trim()) openSuggest();
    else closeSuggest();
  });

  input.addEventListener('focus', openSuggest);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !suggest.hidden) {
      event.stopPropagation();
      closeSuggest();
      return;
    }
    handleSuggestKeys(event);
  });

  document.addEventListener('mousedown', (event) => {
    const targetNode = event.target as Node;
    if (!menu.hidden && !form.contains(targetNode)) closeMenu();
    if (!suggest.hidden && !form.contains(targetNode)) closeSuggest();
  });

  root.append(form);
  syncEngines();

  return {
    render: () => {
      syncEngines();
      closeMenu();
      closeSuggest();
    },
    focus: () => {
      input.focus();
      input.select();
    },
  };
}
