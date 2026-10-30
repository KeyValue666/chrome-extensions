import type { AppContext } from '../shared/context';
import { el } from '../lib/dom';
import { openModal } from './dialog';
import { initNotes, type NotesHandle } from '../widgets/notes';
import { initPomodoro, type PomodoroHandle } from '../widgets/pomodoro';
import { initCountdown, type CountdownHandle } from '../widgets/countdown';
import { initTodo, type TodoHandle } from '../widgets/todo';

export interface PanelsHandle {
  todo: TodoHandle;
  notes: NotesHandle;
  pomodoro: PomodoroHandle;
  countdown: CountdownHandle;
  openTodo(): void;
  openNote(): void;
  openPomodoro(): void;
  openCountdown(): void;
}

/**
 * 待办、便签、番茄钟、倒数日平时寄存在 #panel-holder 里（不占布局），
 * 点网格图标时才作为弹窗内容插进去 —— 同一份 DOM 复用，不重复初始化。
 */
export function createPanels(ctx: AppContext): PanelsHandle {
  const holder = document.getElementById('panel-holder');
  if (!holder) throw new Error('缺少 #panel-holder 容器');

  const todoHost = el('div', { class: 'panel panel-todo' });
  const noteHost = el('div', { class: 'panel panel-note' });
  const pomodoroHost = el('div', { class: 'panel panel-pomodoro' });
  const countdownHost = el('div', { class: 'panel panel-countdown' });
  holder.append(todoHost, noteHost, pomodoroHost, countdownHost);

  const todo = initTodo(todoHost, ctx);
  const notes = initNotes(noteHost, ctx);
  const pomodoro = initPomodoro(pomodoroHost, ctx);
  const countdown = initCountdown(countdownHost, ctx);

  const afterClose = (): void => {
    // 关闭后把面板还回宿体，并刷新网格角标等外部状态
    holder.append(todoHost, noteHost, pomodoroHost, countdownHost);
    ctx.refreshAll();
  };

  const open = (body: HTMLElement, title: string, subtitle: string, focus?: () => void): void => {
    openModal({ title, subtitle, body, size: 'lg', flush: true, onClose: afterClose });
    if (focus) requestAnimationFrame(focus);
  };

  return {
    todo,
    notes,
    pomodoro,
    countdown,
    openTodo: () => {
      todo.render();
      open(todoHost, '待办', '自动保存到本机', () => todo.focus());
    },
    openNote: () => {
      notes.render();
      open(noteHost, '便签', '自动保存到本机', () => notes.focus());
    },
    openPomodoro: () => {
      pomodoro.render();
      open(pomodoroHost, '专注', '番茄钟 · 纯离线计时');
    },
    openCountdown: () => {
      countdown.render();
      open(countdownHost, '倒数日', '重要日子自动倒计', () =>
        (countdownHost.querySelector('input') as HTMLInputElement | null)?.focus(),
      );
    },
  };
}
