import type { AppContext } from '../shared/context';
import { LIMITS } from '../shared/constants';
import { addCountdown, removeCountdown } from '../shared/state';
import { el } from '../lib/dom';
import { createIcon } from '../lib/icons';
import { daysUntil, formatDateKey, nextOccurrence } from '../lib/time';
import type { CountdownItem } from '../shared/types';

export interface CountdownHandle {
  render(): void;
  /** 最近一个即将到来的倒数日剩余天数；没有条目返回 null（网格角标用） */
  nextDays(): number | null;
}

const MAX_DAYS_BADGE = 999;

function describe(item: CountdownItem): { days: number | null; label: string } {
  if (item.anniversary) {
    const next = nextOccurrence(item.date);
    if (!next) return { days: null, label: '' };
    const days = Math.round((next.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    return { days, label: days === 0 ? '就是今天' : `还有 ${days} 天` };
  }
  const days = daysUntil(item.date);
  if (days === null) return { days: null, label: '' };
  if (days > 0) return { days, label: `还有 ${days} 天` };
  if (days === 0) return { days, label: '就是今天' };
  return { days, label: `已过 ${-days} 天` };
}

/** 倒数日面板：列表 + 新增表单（名称 / 日期 / 类型） */
export function initCountdown(root: HTMLElement, ctx: AppContext): CountdownHandle {
  const nameInput = el('input', {
    class: 'field-input',
    attrs: {
      type: 'text',
      placeholder: '例如 项目上线、生日',
      maxlength: LIMITS.countdownName,
      'aria-label': '倒数日名称',
    },
  });

  const dateInput = el('input', {
    class: 'field-input',
    attrs: { type: 'date', 'aria-label': '日期' },
  });
  dateInput.value = formatDateKey(new Date());

  const anniversaryToggle = el('button', {
    class: 'segment',
    text: '纪念日（每年）',
    attrs: { type: 'button', 'aria-pressed': 'false' },
  });
  anniversaryToggle.addEventListener('click', () => {
    const next = anniversaryToggle.getAttribute('aria-pressed') !== 'true';
    anniversaryToggle.setAttribute('aria-pressed', String(next));
  });

  const errorNode = el('p', { class: 'dialog-error', text: '' });
  const list = el('div', { class: 'countdown-list' });

  const form = el('form', { class: 'countdown-form' }, [
    nameInput,
    el('div', { class: 'field-inline' }, [dateInput, anniversaryToggle]),
    el('button', { class: 'button button-primary', attrs: { type: 'submit' } }, [
      createIcon('plus', 15),
      ' 添加',
    ]),
    errorNode,
  ]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorNode.textContent = '';
    const name = nameInput.value.trim();
    const date = dateInput.value;
    if (!name) {
      errorNode.textContent = '请填写名称';
      nameInput.focus();
      return;
    }
    if (!date) {
      errorNode.textContent = '请选择日期';
      dateInput.focus();
      return;
    }
    let ok = false;
    ctx.update((draft) => {
      ok =
        addCountdown(draft, {
          name,
          date,
          anniversary: anniversaryToggle.getAttribute('aria-pressed') === 'true',
        }) !== null;
    });
    if (!ok) {
      errorNode.textContent = '添加失败：日期无效或数量已达上限';
      return;
    }
    nameInput.value = '';
    render();
    nameInput.focus();
  });

  const buildRow = (item: CountdownItem): HTMLElement => {
    const { label } = describe(item);
    const remove = el(
      'button',
      {
        class: 'todo-remove',
        title: '删除',
        attrs: { type: 'button', 'aria-label': `删除：${item.name}` },
        on: {
          click: () => {
            ctx.update((draft) => {
              removeCountdown(draft, item.id);
            });
            render();
          },
        },
      },
      [createIcon('close', 14)],
    );

    return el('div', { class: 'countdown-item' }, [
      el('div', { class: 'countdown-info' }, [
        el('span', { class: 'countdown-name', text: item.name }),
        el('span', { class: 'countdown-date', text: item.date }),
      ]),
      el('span', {
        class: `countdown-days${label === '就是今天' ? ' is-today' : ''}`,
        text: label,
      }),
      remove,
    ]);
  };

  function render(): void {
    const { countdowns } = ctx.getState();
    if (countdowns.length === 0) {
      list.replaceChildren(
        el('div', { class: 'todo-empty' }, [
          createIcon('flag', 22),
          el('p', { text: '添加一个重要日子，网格图标会显示最近倒计时' }),
        ]),
      );
      return;
    }
    // 排序：纪念日按下次发生日，普通倒数日按日期，近的在前
    const sorted = [...countdowns].sort((a, b) => {
      const da = describe(a).days ?? Number.MAX_SAFE_INTEGER;
      const db = describe(b).days ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
    list.replaceChildren(...sorted.map(buildRow));
  }

  root.replaceChildren(form, list);
  render();

  return {
    render,
    nextDays: () => {
      const upcoming = ctx
        .getState()
        .countdowns.map((item) => describe(item).days)
        .filter((days): days is number => days !== null && days >= 0)
        .sort((a, b) => a - b)[0];
      return upcoming === undefined ? null : Math.min(upcoming, MAX_DAYS_BADGE);
    },
  };
}
