import { el } from '../lib/dom';
import { createIcon, type IconName } from '../lib/icons';

export interface MenuAction {
  label: string;
  icon: IconName;
  danger?: boolean;
  onSelect(): void;
}

interface MenuOptions {
  /** 视口坐标：右键位置或元素中心 */
  x: number;
  y: number;
  /** 菜单顶部的小标题，通常是目标名称 */
  title?: string;
  actions: MenuAction[];
  /** 菜单关闭时回调（点外部、Esc、滚动都算） */
  onClose?(): void;
}

interface OpenMenu {
  close(): void;
}

let opened: OpenMenu | null = null;

export function closeContextMenu(): void {
  opened?.close();
}

/** 同一时刻只允许一个菜单；点空白处、Esc、滚动、失焦都会自动关闭 */
export function openContextMenu({ x, y, title, actions, onClose }: MenuOptions): void {
  closeContextMenu();

  const items = actions.map((action) =>
    el(
      'button',
      {
        class: `popover-item${action.danger ? ' is-danger' : ''}`,
        attrs: { type: 'button', role: 'menuitem' },
        on: {
          click: () => {
            close();
            action.onSelect();
          },
        },
      },
      [createIcon(action.icon, 15), el('span', { text: action.label })],
    ),
  );

  const menu = el('div', { class: 'popover is-menu', attrs: { role: 'menu' } }, [
    ...(title ? [el('p', { class: 'popover-title', text: title })] : []),
    ...items,
  ]);
  menu.style.visibility = 'hidden';
  document.body.append(menu);

  // 先量再定位，避免菜单从默认位置跳到光标处闪一下
  const { offsetWidth: width, offsetHeight: height } = menu;
  menu.style.left = `${Math.max(12, Math.min(x, window.innerWidth - width - 12))}px`;
  menu.style.top = `${Math.max(12, Math.min(y, window.innerHeight - height - 12))}px`;
  menu.style.visibility = '';

  const onPointerDown = (event: PointerEvent): void => {
    if (!menu.contains(event.target as Node)) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  const onBlur = (): void => close();

  function close(): void {
    if (opened !== current) return;
    opened = null;
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
    menu.remove();
    onClose?.();
  }

  const current: OpenMenu = { close };
  opened = current;

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);

  items[0]?.focus({ preventScroll: true });
}

/**
 * 触屏设备没有右键：长按 480ms 等价于右键。
 * 长按后浏览器仍会补发一次 click，若不管它就会直接跳转，所以先吞掉这一次点击。
 */
export function bindLongPress(target: HTMLElement, handler: (x: number, y: number) => void): void {
  let timer: number | undefined;
  let originX = 0;
  let originY = 0;

  const cancel = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };

  target.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || event.button !== 0) return;
    originX = event.clientX;
    originY = event.clientY;
    cancel();
    timer = window.setTimeout(() => {
      timer = undefined;
      const swallow = (click: MouseEvent): void => {
        click.preventDefault();
        click.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      // 若这次长按最终没有补发 click，别把监听留到下一次
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 700);
      handler(originX, originY);
    }, 480);
  });

  target.addEventListener(
    'pointermove',
    (event) => {
      if (timer === undefined) return;
      if (Math.hypot(event.clientX - originX, event.clientY - originY) > 8) cancel();
    },
    { passive: true },
  );

  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    target.addEventListener(type, cancel);
  }
}
