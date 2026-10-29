export interface ElProps {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string | number | boolean>;
  dataset?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
}

/**
 * 轻量元素工厂：全部用 textContent / setAttribute 构建，
 * 不接受 HTML 字符串，从源头杜绝把外部数据拼进 innerHTML 的 XSS 风险。
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title !== undefined) node.title = props.title;

  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === false) continue;
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  if (props.dataset) {
    for (const [key, value] of Object.entries(props.dataset)) node.dataset[key] = value;
  }
  if (props.on) {
    const handlers = props.on as Record<string, EventListener | undefined>;
    for (const [type, handler] of Object.entries(handlers)) {
      if (handler) node.addEventListener(type, handler);
    }
  }

  for (const child of children)
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  wait: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: TArgs) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 取标题或域名首字，作为 favicon 加载失败时的字母头像 */
export function initialOf(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '#';
  const char = trimmed.replace(/^(www\.|https?:\/\/)/i, '').charAt(0);
  return char ? char.toUpperCase() : '#';
}
