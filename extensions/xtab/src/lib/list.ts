/** 把 from 位置的元素移到 to 位置，返回新数组（不改原数组，便于测试与撤销） */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/** 按给定 id 顺序重排；未出现在 order 中的元素保持原有相对顺序追加到末尾 */
export function reorderByIds<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  for (const item of items) {
    if (byId.has(item.id)) ordered.push(item);
  }
  return ordered;
}

/** 去掉首尾空白并折叠内部连续空白 */
export function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * 只重排某个子集（例如「开发」分组内的快捷方式），
 * 其余元素保持在原下标不动，避免拖拽过滤视图时打乱其他分组。
 */
export function reorderSubset<T extends { id: string }>(
  all: readonly T[],
  subsetOrder: readonly string[],
): T[] {
  const byId = new Map(all.map((item) => [item.id, item]));
  const next = [...all];
  let cursor = 0;

  for (let index = 0; index < next.length; index += 1) {
    const item = next[index];
    if (!item) continue;
    if (!subsetOrder.includes(item.id)) continue;
    const replacement = byId.get(subsetOrder[cursor] ?? '');
    cursor += 1;
    if (replacement) next[index] = replacement;
  }

  return next;
}
