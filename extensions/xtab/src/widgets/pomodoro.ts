import type { AppContext } from '../shared/context';
import { POMODORO_LIMITS } from '../shared/constants';
import { clamp, el } from '../lib/dom';
import { createIcon } from '../lib/icons';

export interface PomodoroHandle {
  render(): void;
}

type Phase = 'focus' | 'break';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 番茄钟：计时器活在页面内存里（新标签页通常长期驻留），
 * 只有专注/休息时长设置持久化；关掉标签页计时即失效，这是刻意的取舍。
 * 完成一个阶段自动进入下一阶段，面板关着也照常计时并弹 toast。
 */
export function initPomodoro(root: HTMLElement, ctx: AppContext): PomodoroHandle {
  let phase: Phase = 'focus';
  let running = false;
  let remaining = 0;
  let endsAt = 0;
  let completedRounds = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const phaseMinutes = (target: Phase): number =>
    target === 'focus'
      ? ctx.getState().settings.pomodoroFocus
      : ctx.getState().settings.pomodoroBreak;

  const timeText = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  /* ---------- DOM ---------- */

  const ring = document.createElementNS(SVG_NS, 'svg');
  ring.setAttribute('viewBox', '0 0 120 120');
  ring.setAttribute('class', 'pomodoro-ring');
  ring.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '60');
  track.setAttribute('cy', '60');
  track.setAttribute('r', '54');
  track.setAttribute('class', 'pomodoro-ring-track');
  const bar = document.createElementNS(SVG_NS, 'circle');
  bar.setAttribute('cx', '60');
  bar.setAttribute('cy', '60');
  bar.setAttribute('r', '54');
  bar.setAttribute('class', 'pomodoro-ring-bar');
  ring.append(track, bar);
  const RING_LENGTH = 2 * Math.PI * 54;
  bar.style.strokeDasharray = String(RING_LENGTH);

  const timeNode = el('span', { class: 'pomodoro-time', text: '00:00' });
  const phaseNode = el('span', { class: 'pomodoro-phase', text: '专注' });
  const roundNode = el('span', { class: 'pomodoro-round', text: '' });

  const startButton = el(
    'button',
    {
      class: 'pomodoro-main',
      attrs: { type: 'button' },
      on: { click: () => (running ? pause() : start()) },
    },
    [createIcon('timer', 15), el('span', { text: '开始' })],
  );

  const resetButton = el(
    'button',
    {
      class: 'button button-ghost',
      attrs: { type: 'button', 'aria-label': '重置当前阶段' },
      on: { click: () => resetPhase() },
    },
    ['重置'],
  );

  const stepper = (label: string, kind: 'focus' | 'break'): HTMLElement => {
    const value = el('span', { class: 'pomodoro-step-value' });
    const sync = (): void => {
      value.textContent = `${phaseMinutes(kind)} 分钟`;
    };
    const bump = (delta: number): void => {
      const limits = kind === 'focus' ? POMODORO_LIMITS.focus : POMODORO_LIMITS.break;
      const next = clamp(phaseMinutes(kind) + delta, limits.min, limits.max);
      ctx.update((draft) => {
        if (kind === 'focus') draft.settings.pomodoroFocus = next;
        else draft.settings.pomodoroBreak = next;
      });
      // 空闲时改时长立即生效；计时中不动当前阶段，下个阶段生效
      if (!running && phase === kind) {
        remaining = next * 60;
        syncTime();
      }
      sync();
    };
    const row = el('div', { class: 'pomodoro-step' }, [
      el('span', { class: 'pomodoro-step-label', text: label }),
      el('div', { class: 'pomodoro-step-controls' }, [
        el(
          'button',
          {
            class: 'icon-button',
            attrs: { type: 'button', 'aria-label': `减少${label}` },
            on: { click: () => bump(-limits(kind).step) },
          },
          [createIcon('chevron-left', 14)],
        ),
        value,
        el(
          'button',
          {
            class: 'icon-button',
            attrs: { type: 'button', 'aria-label': `增加${label}` },
            on: { click: () => bump(limits(kind).step) },
          },
          [createIcon('chevron-right', 14)],
        ),
      ]),
    ]);
    sync();
    return row;
  };

  function limits(kind: 'focus' | 'break'): { min: number; max: number; step: number } {
    return kind === 'focus' ? POMODORO_LIMITS.focus : POMODORO_LIMITS.break;
  }

  /* ---------- 计时逻辑 ---------- */

  const syncTime = (): void => {
    timeNode.textContent = timeText(Math.max(0, Math.ceil(remaining)));
    const total = phaseMinutes(phase) * 60;
    const fraction = total > 0 ? 1 - remaining / total : 0;
    // 空环起步，随时间流逝逐渐填满一圈
    bar.style.strokeDashoffset = String(RING_LENGTH * (1 - fraction));
  };

  const syncButtons = (): void => {
    const label = running ? '暂停' : '继续';
    startButton.classList.toggle('is-running', running);
    const textNode = startButton.querySelector('span');
    if (textNode) textNode.textContent = remaining === phaseMinutes(phase) * 60 ? '开始' : label;
  };

  const switchPhase = (next: Phase, autoStart: boolean): void => {
    phase = next;
    remaining = phaseMinutes(next) * 60;
    running = autoStart;
    endsAt = autoStart ? Date.now() + remaining * 1000 : 0;
    phaseNode.textContent = next === 'focus' ? '专注' : '休息';
    document.body.classList.toggle('is-pomodoro-break', next === 'break');
    syncTime();
    syncButtons();
  };

  const onPhaseDone = (): void => {
    if (phase === 'focus') {
      completedRounds += 1;
      roundNode.textContent = `已完成 ${completedRounds} 轮`;
      ctx.notify(`完成第 ${completedRounds} 轮专注，休息一下`);
      switchPhase('break', true);
    } else {
      ctx.notify('休息结束，开始下一轮专注');
      switchPhase('focus', true);
    }
  };

  const tick = (): void => {
    if (!running) return;
    remaining = (endsAt - Date.now()) / 1000;
    if (remaining <= 0) {
      onPhaseDone();
      return;
    }
    syncTime();
  };

  const start = (): void => {
    if (running) return;
    if (remaining <= 0) remaining = phaseMinutes(phase) * 60;
    endsAt = Date.now() + remaining * 1000;
    running = true;
    if (timer === undefined) timer = setInterval(tick, 250);
    syncButtons();
  };

  const pause = (): void => {
    if (!running) return;
    running = false;
    if (endsAt) remaining = Math.max(0, (endsAt - Date.now()) / 1000);
    endsAt = 0;
    syncButtons();
  };

  const resetPhase = (): void => {
    running = false;
    endsAt = 0;
    remaining = phaseMinutes(phase) * 60;
    syncTime();
    syncButtons();
  };

  // 常驻 interval：面板关闭后照样走（250ms 醒一次，开销可忽略）
  timer = setInterval(tick, 250);
  document.body.classList.remove('is-pomodoro-break');
  switchPhase('focus', false);

  root.replaceChildren(
    el('div', { class: 'pomodoro' }, [
      el('div', { class: 'pomodoro-dial' }, [
        ring,
        el('div', { class: 'pomodoro-center' }, [phaseNode, timeNode, roundNode]),
      ]),
      el('div', { class: 'pomodoro-actions' }, [startButton, resetButton]),
      el('div', { class: 'pomodoro-settings' }, [
        stepper('专注', 'focus'),
        stepper('休息', 'break'),
      ]),
      el('p', {
        class: 'hint',
        text: '完成一个阶段自动进入下一个；时长改动在下个阶段生效。计时只在本页内有效，关闭标签页即停止。',
      }),
    ]),
  );

  roundNode.textContent = '';

  return {
    render: () => {
      syncTime();
      syncButtons();
    },
  };
}
