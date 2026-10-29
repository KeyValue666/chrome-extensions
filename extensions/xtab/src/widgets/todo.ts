import type { AppContext } from '../shared/context';
import { LIMITS } from '../shared/constants';
import { addTodo, clearDoneTodos, removeTodo, toggleTodo } from '../shared/state';
import { el } from '../lib/dom';
import { createIcon } from '../lib/icons';
import type { TodoItem } from '../shared/types';

export interface TodoHandle {
  render(): void;
  focus(): void;
}

/** 待办面板：输入框常驻不重建，只有列表重绘，保证连续录入时焦点不丢 */
export function initTodo(root: HTMLElement, ctx: AppContext): TodoHandle {
  const input = el('input', {
    class: 'todo-input',
    attrs: {
      type: 'text',
      placeholder: '添加一项待办，回车确认',
      maxlength: LIMITS.todoText,
      'aria-label': '添加待办',
    },
  });

  const form = el('form', { class: 'todo-form' }, [
    input,
    el('button', { class: 'todo-submit', attrs: { type: 'submit', 'aria-label': '添加待办' } }, [
      createIcon('plus', 16),
    ]),
  ]);

  const list = el('div', { class: 'todo-list' });

  const count = el('span', { class: 'todo-count' });

  const clearButton = el(
    'button',
    {
      class: 'link-button',
      attrs: { type: 'button' },
      on: {
        click: () => {
          ctx.update((draft) => {
            clearDoneTodos(draft);
          });
          render();
        },
      },
    },
    [createIcon('refresh', 13), '清除已完成'],
  );

  const foot = el('div', { class: 'todo-foot' }, [count, clearButton]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    ctx.update((draft) => {
      addTodo(draft, text);
    });
    input.value = '';
    render();
    input.focus();
  });

  const buildItem = (todo: TodoItem): HTMLElement => {
    const check = el(
      'button',
      {
        class: 'todo-check',
        attrs: {
          type: 'button',
          role: 'checkbox',
          'aria-checked': String(todo.done),
          'aria-label': todo.done ? `标记未完成：${todo.text}` : `标记完成：${todo.text}`,
        },
        on: {
          click: () => {
            ctx.update((draft) => {
              toggleTodo(draft, todo.id);
            });
            render();
          },
        },
      },
      [createIcon('check', 12, 2.4)],
    );

    const text = el('span', {
      class: 'todo-text',
      text: todo.text,
      on: {
        click: () => {
          ctx.update((draft) => {
            toggleTodo(draft, todo.id);
          });
          render();
        },
      },
    });

    const remove = el(
      'button',
      {
        class: 'todo-remove',
        title: '删除',
        attrs: { type: 'button', 'aria-label': `删除：${todo.text}` },
        on: {
          click: () => {
            ctx.update((draft) => {
              removeTodo(draft, todo.id);
            });
            render();
          },
        },
      },
      [createIcon('close', 14)],
    );

    return el('div', { class: `todo-item${todo.done ? ' is-done' : ''}` }, [check, text, remove]);
  };

  function render(): void {
    const { todos } = ctx.getState();
    const remaining = todos.filter((todo) => !todo.done).length;
    const done = todos.length - remaining;

    count.textContent =
      todos.length === 0 ? '暂无待办' : `${remaining} 项未完成 · 共 ${todos.length} 项`;
    clearButton.hidden = done === 0;

    if (todos.length === 0) {
      list.replaceChildren(
        el('div', { class: 'todo-empty' }, [
          createIcon('todo', 22),
          el('p', { text: '今天还没有待办，先写一件小事' }),
        ]),
      );
      return;
    }

    list.replaceChildren(...todos.map(buildItem));
  }

  root.replaceChildren(form, list, foot);
  render();

  return { render, focus: () => input.focus() };
}
