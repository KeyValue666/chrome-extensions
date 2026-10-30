import type { AppContext, SettingsSection } from '../shared/context';
import { ACCENT_PRESETS, WALLPAPER_PRESETS } from '../shared/constants';
import { clearState } from '../shared/storage';
import { createDefaultState, exportState, parseStateJson } from '../shared/state';
import { el } from '../lib/dom';
import { createIcon } from '../lib/icons';
import { confirmDialog } from './dialog';
import { clearCustomWallpaper, importWallpaper } from './wallpaper';
import type { ThemeMode } from '../shared/types';

export interface SettingsHandle {
  open(section?: SettingsSection): void;
  close(): void;
  isOpen(): boolean;
  toggle(section?: SettingsSection): void;
}

const SECTION_TITLES: Record<SettingsSection, string> = {
  appearance: '外观与时间',
  wallpaper: '壁纸',
  data: '数据与备份',
  about: '关于与权限',
};

export function createSettings(ctx: AppContext): SettingsHandle {
  const host = document.getElementById('drawer-root');
  if (!host) throw new Error('缺少 #drawer-root 容器');

  let backdrop: HTMLElement | null = null;

  const close = (): void => {
    if (!backdrop) return;
    backdrop.remove();
    backdrop = null;
    document.removeEventListener('keydown', onKeyDown);
    document.body.classList.remove('is-drawer-open');
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  const section = (id: SettingsSection, children: HTMLElement[]): HTMLElement =>
    el('section', { class: 'drawer-section', dataset: { section: id } }, [
      el('h3', { class: 'drawer-section-title', text: SECTION_TITLES[id] }),
      ...children,
    ]);

  const switchRow = (
    label: string,
    description: string,
    checked: boolean,
    onChange: (next: boolean) => void,
  ): HTMLElement => {
    const track = el(
      'button',
      {
        class: 'switch',
        attrs: {
          type: 'button',
          role: 'switch',
          'aria-checked': String(checked),
          'aria-label': label,
        },
        on: {
          click: () => {
            const next = track.getAttribute('aria-checked') !== 'true';
            track.setAttribute('aria-checked', String(next));
            onChange(next);
          },
        },
      },
      [el('span', { class: 'switch-thumb' })],
    );

    return el('div', { class: 'row' }, [
      el('div', { class: 'row-text' }, [
        el('span', { class: 'row-label', text: label }),
        el('span', { class: 'row-desc', text: description }),
      ]),
      track,
    ]);
  };

  const rangeRow = (
    label: string,
    min: number,
    max: number,
    value: number,
    onChange: (next: number) => void,
  ): HTMLElement => {
    const output = el('span', { class: 'range-value', text: `${value}%` });
    const input = el('input', {
      class: 'range',
      attrs: { type: 'range', min, max, step: 4, value, 'aria-label': label },
    });
    input.addEventListener('input', () => {
      const next = Number(input.value);
      output.textContent = `${next}%`;
      onChange(next);
    });

    return el('div', { class: 'row row-stacked' }, [
      el('div', { class: 'row-text row-text-inline' }, [
        el('span', { class: 'row-label', text: label }),
        output,
      ]),
      input,
    ]);
  };

  const segmented = (
    options: { value: ThemeMode; label: string }[],
    current: ThemeMode,
    onChange: (next: ThemeMode) => void,
  ): HTMLElement => {
    const buttons = options.map((option) => {
      // 注意：选中态必须和「自己被点中的那个按钮」比，之前误用 buttons[0]，
      // 点哪个都只会点亮第一个（跟随系统），看起来就像浅色/深色选不中
      const node = el('button', {
        class: 'segment',
        text: option.label,
        attrs: { type: 'button', 'aria-pressed': String(option.value === current) },
        on: {
          click: () => {
            for (const peer of buttons) peer.setAttribute('aria-pressed', String(peer === node));
            onChange(option.value);
          },
        },
      });
      return node;
    });
    return el(
      'div',
      { class: 'segmented', attrs: { role: 'group', 'aria-label': '主题' } },
      buttons,
    );
  };

  const buildAppearance = (): HTMLElement => {
    const state = ctx.getState();
    const { settings } = state;

    const accentSwatches = ACCENT_PRESETS.map((accent) => {
      const active = settings.accentId === accent.id;
      const swatch = el('button', {
        class: `accent-swatch${active ? ' is-active' : ''}`,
        title: accent.name,
        attrs: {
          type: 'button',
          'aria-label': `强调色：${accent.name}`,
          'aria-pressed': String(active),
        },
        on: {
          click: () => {
            ctx.update((draft) => {
              draft.settings.accentId = accent.id;
            });
            void ctx.applyAppearance();
            for (const node of accentSwatches) {
              node.classList.toggle('is-active', node === swatch);
              node.setAttribute('aria-pressed', String(node === swatch));
            }
          },
        },
      });
      // 深浅两档色各画一半，让用户预判两种主题下的效果
      swatch.style.background = `linear-gradient(135deg, ${accent.dark} 50%, ${accent.light} 50%)`;
      return swatch;
    });

    return section('appearance', [
      el('div', { class: 'row row-stacked' }, [
        el('span', { class: 'row-label', text: '主题' }),
        segmented(
          [
            { value: 'auto', label: '跟随系统' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ],
          settings.theme,
          (next) => {
            ctx.update((draft) => {
              draft.settings.theme = next;
            });
            void ctx.applyAppearance();
          },
        ),
      ]),
      el('div', { class: 'row row-stacked' }, [
        el('span', { class: 'row-label', text: '强调色' }),
        el('div', { class: 'accent-grid' }, accentSwatches),
      ]),
      switchRow(
        '农历与节日',
        '在日期行显示农历、传统节日与公历节日',
        settings.lunarEnabled,
        (next) => {
          ctx.update((draft) => {
            draft.settings.lunarEnabled = next;
          });
          ctx.refreshAll();
        },
      ),
      switchRow('24 小时制', '关闭后显示 12 小时制（AM/PM）', settings.hour24, (next) => {
        ctx.update((draft) => {
          draft.settings.hour24 = next;
        });
        ctx.refreshAll();
      }),
      switchRow('显示秒', '时钟每秒刷新，略微增加重绘', settings.clockSeconds, (next) => {
        ctx.update((draft) => {
          draft.settings.clockSeconds = next;
        });
        ctx.refreshAll();
      }),
      switchRow(
        '搜索历史',
        '搜索框下拉显示最近搜索，可单条删除',
        settings.searchHistoryEnabled,
        (next) => {
          ctx.update((draft) => {
            draft.settings.searchHistoryEnabled = next;
            // 关掉就顺手清空，避免数据残留
            if (!next) draft.searchHistory = [];
          });
          ctx.refreshAll();
        },
      ),
      switchRow('壁纸毛玻璃', '模糊背景，前景文字更易读', settings.blur, (next) => {
        ctx.update((draft) => {
          draft.settings.blur = next;
        });
        void ctx.applyAppearance();
      }),
      rangeRow('壁纸暗度', 0, 80, settings.dim, (next) => {
        ctx.update((draft) => {
          draft.settings.dim = next;
        });
        void ctx.applyAppearance();
      }),
      switchRow(
        '自动隐藏 Dock',
        '鼠标贴到屏幕左边缘时滑出，平时把空间留给内容',
        settings.sidebarCollapsed,
        (next) => {
          ctx.update((draft) => {
            draft.settings.sidebarCollapsed = next;
          });
          void ctx.applyAppearance();
        },
      ),
    ]);
  };

  const buildWallpaper = (): HTMLElement => {
    const state = ctx.getState();
    const isCustom = state.settings.wallpaperKind === 'custom';

    const swatches = WALLPAPER_PRESETS.map((preset) => {
      const active = !isCustom && state.settings.presetId === preset.id;
      const swatch = el('button', {
        class: `wallpaper-swatch${active ? ' is-active' : ''}`,
        title: preset.name,
        attrs: {
          type: 'button',
          'aria-label': `壁纸：${preset.name}`,
          'aria-pressed': String(active),
        },
        on: {
          click: () => {
            ctx.update((draft) => {
              draft.settings.wallpaperKind = 'preset';
              draft.settings.presetId = preset.id;
            });
            void ctx.applyAppearance();
            for (const node of swatches) {
              node.classList.toggle('is-active', node === swatch);
              node.setAttribute('aria-pressed', String(node === swatch));
            }
          },
        },
      });
      swatch.style.backgroundImage = preset.css;
      return swatch;
    });

    const grid = el('div', { class: 'wallpaper-grid' }, swatches);

    const fileInput = el('input', {
      class: 'visually-hidden',
      attrs: { type: 'file', accept: 'image/*' },
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;

      void (async () => {
        try {
          await importWallpaper(file);
          ctx.update((draft) => {
            draft.settings.wallpaperKind = 'custom';
          });
          await ctx.applyAppearance();
          ctx.notify('壁纸已更新');
          render();
        } catch (error) {
          ctx.notify(error instanceof Error ? error.message : '壁纸导入失败');
        }
      })();
    });

    const uploadButton = el(
      'button',
      {
        class: 'button button-block',
        attrs: { type: 'button' },
        on: { click: () => fileInput.click() },
      },
      [createIcon('upload', 16), ' 上传本地图片'],
    );

    const removeButton = el(
      'button',
      {
        class: 'button button-block button-ghost',
        attrs: { type: 'button' },
        on: {
          click: () => {
            void (async () => {
              await clearCustomWallpaper();
              ctx.update((draft) => {
                draft.settings.wallpaperKind = 'preset';
              });
              await ctx.applyAppearance();
              ctx.notify('已恢复内置壁纸');
              render();
            })();
          },
        },
      },
      [createIcon('trash', 16), ' 移除自定义壁纸'],
    );

    return section('wallpaper', [
      grid,
      el('p', {
        class: 'hint',
        text: '自定义图片压缩后仅保存在本机 IndexedDB，不会上传到任何服务器。',
      }),
      uploadButton,
      ...(isCustom ? [removeButton] : []),
      fileInput,
    ]);
  };

  const buildData = (): HTMLElement => {
    const state = ctx.getState();

    const exportButton = el(
      'button',
      {
        class: 'button button-block',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const blob = new Blob([exportState(ctx.getState())], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = el('a', {
              attrs: {
                href: url,
                download: `xtab-backup-${new Date().toISOString().slice(0, 10)}.json`,
              },
            });
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            ctx.notify('备份已导出');
          },
        },
      },
      [createIcon('download', 16), ' 导出备份'],
    );

    const importInput = el('input', {
      class: 'visually-hidden',
      attrs: { type: 'file', accept: 'application/json,.json' },
    });
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      importInput.value = '';
      if (!file) return;

      void (async () => {
        try {
          const imported = parseStateJson(await file.text());
          const ok = await confirmDialog({
            title: '导入备份',
            message: `将用备份覆盖当前数据：${imported.shortcuts.length} 个快捷方式、${imported.todos.length} 条待办。此操作不可撤销。`,
            confirmText: '覆盖导入',
            danger: true,
          });
          if (!ok) return;

          ctx.update((draft) => {
            Object.assign(draft, imported);
          });
          await ctx.applyAppearance();
          ctx.refreshAll();
          render();
          ctx.notify('备份已导入');
        } catch (error) {
          ctx.notify(error instanceof Error ? error.message : '导入失败');
        }
      })();
    });

    const importButton = el(
      'button',
      {
        class: 'button button-block',
        attrs: { type: 'button' },
        on: { click: () => importInput.click() },
      },
      [createIcon('upload', 16), ' 导入备份'],
    );

    const resetButton = el(
      'button',
      {
        class: 'button button-block button-danger-ghost',
        attrs: { type: 'button' },
        on: {
          click: () => {
            void (async () => {
              const ok = await confirmDialog({
                title: '恢复默认',
                message:
                  '将清空全部快捷方式、待办、便签、壁纸与设置，恢复到初始状态。建议先导出备份。',
                confirmText: '清空并恢复',
                danger: true,
              });
              if (!ok) return;

              await clearState();
              await clearCustomWallpaper();
              ctx.update((draft) => {
                Object.assign(draft, createDefaultState());
              });
              await ctx.applyAppearance();
              ctx.refreshAll();
              render();
              ctx.notify('已恢复默认设置');
            })();
          },
        },
      },
      [createIcon('refresh', 16), ' 恢复默认'],
    );

    return section('data', [
      el('p', {
        class: 'hint',
        text: `当前：${state.shortcuts.length} 个快捷方式 · ${state.todos.length} 条待办`,
      }),
      exportButton,
      importButton,
      resetButton,
      importInput,
    ]);
  };

  const buildAbout = (): HTMLElement =>
    section('about', [
      el('div', { class: 'about-line' }, [
        el('span', { class: 'row-label', text: '版本' }),
        el('span', { class: 'row-desc', text: '0.2.0' }),
      ]),
      el('p', { class: 'hint', text: '权限说明' }),
      el('ul', { class: 'permission-list' }, [
        el('li', { text: 'storage：把快捷方式、待办、便签、倒数日和设置保存在本机。' }),
        el('li', { text: 'favicon：读取本地图标缓存，显示快捷方式的网站图标。' }),
        el('li', {
          text: 'activeTab：只有你点扩展图标时才读取当前标签页的网址与标题，用来新增快捷方式。',
        }),
      ]),
      el('p', { class: 'hint', text: 'XTab 不发起任何网络请求，不收集任何数据，无账号系统。' }),
      el('p', {
        class: 'hint',
        text: '在小工具栏点扩展图标，可以把当前网页一键存成快捷方式（可改名、选分组）。',
      }),
      el('p', {
        class: 'hint',
        text: '快捷键：/ 或 Ctrl/⌘+K 聚焦搜索框，数字键 1-9 打开对应快捷方式，Esc 退出极简模式或关闭弹窗。',
      }),
      el('p', {
        class: 'hint',
        text: '右键快捷方式或 Dock 里的分组可以编辑、复制链接、隐藏或删除；触屏设备长按等效于右键。',
      }),
    ]);

  const render = (): void => {
    const body = backdrop?.querySelector('.drawer-body');
    if (!body) return;
    body.replaceChildren(buildAppearance(), buildWallpaper(), buildData(), buildAbout());
  };

  const scrollToSection = (id: SettingsSection): void => {
    const target = backdrop?.querySelector(`[data-section="${id}"]`);
    target?.scrollIntoView({ block: 'start' });
  };

  const open = (id: SettingsSection = 'appearance'): void => {
    if (backdrop) {
      scrollToSection(id);
      return;
    }

    const closeButton = el(
      'button',
      {
        class: 'icon-button',
        attrs: { type: 'button', 'aria-label': '关闭设置' },
        on: { click: close },
      },
      [createIcon('close', 18)],
    );

    const panel = el(
      'aside',
      { class: 'drawer', attrs: { role: 'dialog', 'aria-modal': 'false', 'aria-label': '设置' } },
      [
        el('header', { class: 'drawer-header' }, [
          el('h2', { class: 'drawer-title', text: '设置' }),
          closeButton,
        ]),
        el('div', { class: 'drawer-body' }),
      ],
    );

    backdrop = el(
      'div',
      {
        class: 'drawer-backdrop',
        on: {
          mousedown: (event) => {
            if (event.target === backdrop) close();
          },
        },
      },
      [panel],
    );

    host.append(backdrop);
    document.body.classList.add('is-drawer-open');
    document.addEventListener('keydown', onKeyDown);

    render();
    scrollToSection(id);
    requestAnimationFrame(() => backdrop?.classList.add('is-open'));
  };

  return {
    open,
    close,
    isOpen: () => backdrop !== null,
    toggle: (id) => (backdrop ? close() : open(id)),
  };
}
