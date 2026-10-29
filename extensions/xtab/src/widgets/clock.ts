import type { AppContext } from '../shared/context';
import { formatClock, formatDate, greeting } from '../lib/time';

export interface ClockHandle {
  render(): void;
  stop(): void;
}

/** 时钟：只在文本真正变化时写 DOM，避免每秒触发布局抖动 */
export function initClock(ctx: AppContext): ClockHandle {
  const clockNode = document.getElementById('clock');
  const dateNode = document.getElementById('date');
  const button = document.getElementById('clock-button');
  if (!clockNode || !dateNode || !button) throw new Error('时钟容器缺失');

  let timer: ReturnType<typeof setInterval> | undefined;
  let lastClock = '';
  let lastDate = '';

  const tick = (): void => {
    const now = new Date();
    const { hour24, clockSeconds } = ctx.getState().settings;

    const clockText = formatClock(now, { hour24, seconds: clockSeconds });
    if (clockText !== lastClock) {
      clockNode.textContent = clockText;
      // 12 小时制文本更宽，切换字号避免整体跳动
      clockNode.classList.toggle('clock-long', clockText.length > 5);
      lastClock = clockText;
    }

    const dateText = `${greeting(now)}，${formatDate(now)}`;
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
