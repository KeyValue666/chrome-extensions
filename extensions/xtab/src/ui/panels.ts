import type { AppContext } from '../shared/context';
import { el } from '../lib/dom';
import { openModal } from './dialog';
import { initNotes, type NotesHandle } from '../widgets/notes';
import { initTodo, type TodoHandle } from '../widgets/todo';

export interface PanelsHandle {
  todo: TodoHandle;
  notes: NotesHandle;
  openTodo(): void;
  openNote(): void;
}

/**
 * 待办与便签平时寄存在 #panel-holder 里（不占布局），
 * 点工具条时才作为弹窗内容插进去 —— 同一份 DOM 复用，不重复初始化。
 */
export function createPanels(ctx: AppContext): PanelsHandle {
  const holder = document.getElementById('panel-holder');
  if (!holder) throw new Error('缺少 #panel-holder 容器');

  const todoHost = el('div', { class: 'panel panel-todo' });
  const noteHost = el('div', { class: 'panel panel-note' });
  holder.append(todoHost, noteHost);

  const todo = initTodo(todoHost, ctx);
  const notes = initNotes(noteHost, ctx);

  const afterClose = (): void => {
    // 关闭后把面板还回宿体，并刷新工具条徽标
    holder.append(todoHost, noteHost);
    ctx.refreshAll();
  };

  return {
    todo,
    notes,
    openTodo: () => {
      todo.render();
      openModal({
        title: '待办',
        subtitle: '自动保存到本机',
        body: todoHost,
        size: 'lg',
        flush: true,
        onClose: afterClose,
      });
      requestAnimationFrame(() => todo.focus());
    },
    openNote: () => {
      notes.render();
      openModal({
        title: '便签',
        subtitle: '自动保存到本机',
        body: noteHost,
        size: 'lg',
        flush: true,
        onClose: afterClose,
      });
      requestAnimationFrame(() => notes.focus());
    },
  };
}
