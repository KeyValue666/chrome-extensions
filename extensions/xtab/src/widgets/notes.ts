import type { AppContext } from '../shared/context';
import { LIMITS } from '../shared/constants';
import { debounce, el } from '../lib/dom';

export interface NotesHandle {
  render(): void;
  focus(): void;
}

/** 便签面板：输入即存（500ms 防抖），失焦立即落盘，避免关标签页丢内容 */
export function initNotes(root: HTMLElement, ctx: AppContext): NotesHandle {
  const status = el('span', { class: 'note-status', text: '' });
  const counter = el('span', { class: 'note-counter' });

  const textarea = el('textarea', {
    class: 'note-area',
    attrs: {
      placeholder: '随手记点什么，自动保存…',
      maxlength: LIMITS.noteLength,
      'aria-label': '便签内容',
      spellcheck: 'false',
    },
  });

  const persist = (): void => {
    ctx.update((draft) => {
      draft.note = textarea.value;
    });
  };

  const syncCounter = (): void => {
    counter.textContent = `${textarea.value.length} 字`;
  };

  const debouncedSave = debounce(() => {
    persist();
    status.textContent = '已保存';
  }, 500);

  textarea.addEventListener('input', () => {
    status.textContent = '保存中…';
    syncCounter();
    debouncedSave();
  });

  textarea.addEventListener('blur', () => {
    persist();
    status.textContent = '已保存';
  });

  function render(): void {
    const { note } = ctx.getState();
    if (textarea.value !== note) textarea.value = note;
    status.textContent = '';
    syncCounter();
  }

  root.replaceChildren(el('div', { class: 'note-toolbar' }, [status, counter]), textarea);

  render();

  return {
    render,
    focus: () => {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    },
  };
}
