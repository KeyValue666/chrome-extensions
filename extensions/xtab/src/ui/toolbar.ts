import type { AppContext } from '../shared/context';
import { el } from '../lib/dom';
import { createIcon, type IconName } from '../lib/icons';

export interface ToolbarHandle {
  render(): void;
}

interface ToolButtonOptions {
  label: string;
  icon: IconName;
  onClick: () => void;
  pressed?: boolean;
}

/** 右上角常驻工具条：壁纸、设置（极简模式由点击时钟触发，不再单独占位） */
export function initToolbar(root: HTMLElement, ctx: AppContext): ToolbarHandle {
  const toolButton = ({ label, icon, onClick, pressed }: ToolButtonOptions): HTMLElement => {
    const button = el(
      'button',
      {
        class: 'tool-button',
        title: label,
        attrs: {
          type: 'button',
          'aria-label': label,
          ...(pressed === undefined ? {} : { 'aria-pressed': String(pressed) }),
        },
        on: { click: onClick },
      },
      [createIcon(icon, 19)],
    );

    return button;
  };

  function render(): void {
    root.replaceChildren(
      el('div', { class: 'toolbar-group' }, [
        toolButton({
          label: '壁纸',
          icon: 'image',
          onClick: () => ctx.openSettings('wallpaper'),
        }),
        toolButton({
          label: '设置',
          icon: 'settings',
          onClick: () => ctx.openSettings('appearance'),
        }),
      ]),
    );
  }

  render();
  return { render };
}

/** 极简模式提示条：告知退出方式，避免用户以为页面坏了 */
export function initMinimalHint(ctx: AppContext): void {
  const hint = el('button', {
    class: 'minimal-hint',
    text: '按 Esc 或点击时钟退出极简模式',
    attrs: { type: 'button' },
    on: {
      click: () => {
        ctx.update((state) => {
          state.settings.minimal = false;
        });
        void ctx.applyAppearance();
      },
    },
  });
  document.body.append(hint);
}
