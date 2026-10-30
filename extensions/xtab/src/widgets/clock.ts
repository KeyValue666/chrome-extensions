import type { AppContext } from '../shared/context';
import { festivalOf, lunarDateText } from '../lib/lunar';
import { formatClock, formatDate, greeting } from '../lib/time';

export interface ClockHandle {
  render(): void;
  stop(): void;
}

const MERIDIEM_RE = / (AM|PM)$/;

/** 单个数字位的滚动动画时长，需与 base.css 中 --dur-2 保持一致 */
const DIGIT_ANIM_MS = 200;

/**
 * 时钟：按位拆分成 .digit 槽位，数字变化时旧字上滑、新字下滑（翻牌效果），
 * 只在内容真正变化时写 DOM，避免每秒触发布局抖动。
 */
export function initClock(ctx: AppContext): ClockHandle {
  const clockNode = document.getElementById('clock');
  const dateNode = document.getElementById('date');
  const button = document.getElementById('clock-button');
  if (!clockNode || !dateNode || !button) throw new Error('时钟容器缺失');

  // AM/PM 后缀独立成小字，不参与翻牌
  const meridiemNode = document.createElement('span');
  meridiemNode.className = 'clock-meridiem';
  meridiemNode.hidden = true;
  clockNode.append(meridiemNode);

  let timer: ReturnType<typeof setInterval> | undefined;
  let lastClock = '';
  let lastDate = '';
  const slots: HTMLElement[] = [];

  const updateSlot = (slot: HTMLElement, ch: string): void => {
    if (slot.dataset.char === ch) return;
    slot.dataset.char = ch;
    // 清掉上次没来得及收尾的旧字（后台标签页会漏 animationend）
    for (const stale of [...slot.querySelectorAll('.is-out')]) stale.remove();
    const current = slot.lastElementChild;
    if (current instanceof HTMLElement) {
      current.classList.add('is-out');
      window.setTimeout(() => current.remove(), DIGIT_ANIM_MS + 80);
    }
    const incoming = document.createElement('span');
    incoming.className = ch === ':' ? 'digit-num colon-char' : 'digit-num';
    incoming.textContent = ch;
    slot.append(incoming);
  };

  const renderClockText = (clockText: string): void => {
    const match = MERIDIEM_RE.exec(clockText);
    const body = match ? clockText.slice(0, match.index) : clockText;
    const suffix = match?.[1] ?? '';

    if (suffix !== meridiemNode.textContent) {
      meridiemNode.textContent = suffix;
      meridiemNode.hidden = suffix === '';
    }

    const chars = [...body];
    while (slots.length < chars.length) {
      const slot = document.createElement('span');
      slot.className = 'digit';
      clockNode.insertBefore(slot, meridiemNode);
      slots.push(slot);
    }
    while (slots.length > chars.length) slots.pop()?.remove();
    chars.forEach((ch, index) => updateSlot(slots[index]!, ch));
  };

  const tick = (): void => {
    const now = new Date();
    const { hour24, clockSeconds } = ctx.getState().settings;

    const clockText = formatClock(now, { hour24, seconds: clockSeconds });
    if (clockText !== lastClock) {
      renderClockText(clockText);
      // 12 小时制或带秒时整体更宽，切换字号避免布局跳动
      clockNode.classList.toggle('clock-long', !hour24 || clockSeconds);
      lastClock = clockText;
    }

    const parts = [`${greeting(now)}，${formatDate(now)}`];
    if (ctx.getState().settings.lunarEnabled) {
      const lunar = lunarDateText(now);
      if (lunar) parts.push(lunar);
      const festival = festivalOf(now);
      if (festival) parts.push(festival);
    }
    const dateText = parts.join(' · ');
    if (dateText !== lastDate) {
      dateNode.textContent = dateText;
      lastDate = dateText;
    }
  };

  const startTimer = (): void => {
    if (timer !== undefined) clearInterval(timer);
    const { clockSeconds } = ctx.getState().settings;
    timer = setInterval(tick, clockSeconds ? 1000 : 10_000);
  };

  button.addEventListener('click', () => {
    ctx.update((state) => {
      state.settings.minimal = !state.settings.minimal;
    });
    void ctx.applyAppearance();
  });

  const render = (): void => {
    lastClock = '';
    lastDate = '';
    tick();
    startTimer();
  };

  // 自行启动，避免调用方忘记渲染导致时钟空白
  render();

  return {
    render,
    stop: () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}
