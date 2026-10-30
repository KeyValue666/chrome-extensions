#!/usr/bin/env node
/**
 * 把 Infinity 新标签页的备份 JSON 转换成 XTab 的备份格式。
 *
 * 用法：node tools/import-infinity.mjs <infinity备份.json> [输出.json]
 *
 * 映射：
 *   data.site.sites[页][项]        → 文件夹转分组（带图标映射），站点转快捷方式
 *   data.note.list                 → 拼接为 XTab 便签（HTML 剥成纯文本）
 *   data.searcher.current          → 已知引擎映射到 XTab 引擎 id
 *   data.todo / wallpaper / 天气   → 不迁移（待办仅官方示例；壁纸是云图需联网）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const input = process.argv[2];
if (!input) {
  console.error('用法：node tools/import-infinity.mjs <infinity备份.json> [输出.json]');
  process.exit(1);
}
const output = process.argv[3] ?? resolve(here, '../../xtab-import-from-infinity.json');

/** Infinity 文件夹名 → XTab 分组图标 */
const ICON_MAP = [
  [/^(brush|后端|前端|api)$/i, 'code'],
  [/^game$/i, 'game'],
  [/^work$/i, 'briefcase'],
  [/^(工具箱|thirdparty|hacked)$/i, 'terminal'],
  [/^(crosswall|search)$/i, 'globe'],
  [/^video$/i, 'film'],
  [/^(resources|网盘|简历)$/i, 'briefcase'],
  [/^(邮件|bbs)$/i, 'chat'],
  [/^图片$/i, 'camera'],
  [/^音乐$/i, 'music'],
  [/^(substance|阅读)$/i, 'book'],
  [/^web3$/i, 'wallet'],
  [/^ai$/i, 'flask'],
];

const iconOf = (name) => ICON_MAP.find(([re]) => re.test(name.trim()))?.[1] ?? 'grid';

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

const isHttpUrl = (value) => /^https?:\/\//i.test(value ?? '');

/** Infinity 便签是 HTML，剥成纯文本（div 当换行，链接保留地址） */
function htmlToText(html) {
  return html
    .replace(/<div><br><\/div>/gi, '\n')
    .replace(/<\/div>\s*<div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ENGINE_MAP = { 必应: 'bing', 谷歌: 'google', 百度: 'baidu', 搜狗: 'sogou' };

const stats = { groups: 0, shortcuts: 0, skippedInternal: 0, skippedBad: 0, notes: 0 };

function convert(raw) {
  const groups = [];
  const shortcuts = [];
  const grid = [];

  for (const page of raw.data?.site?.sites ?? []) {
    for (const item of page ?? []) {
      if (Array.isArray(item.children)) {
        // Infinity 文件夹 → XTab 分组
        const name = String(item.name ?? '').trim();
        if (!name) continue;
        const group = { id: `g-${groups.length + 1}`, name, icon: iconOf(name), hidden: false };
        groups.push(group);
        for (const child of item.children) {
          const target = child.target;
          if (!isHttpUrl(target)) {
            stats.skippedInternal += 1;
            continue;
          }
          const title = String(child.name ?? '').trim() || hostOf(target);
          shortcuts.push({
            id: `s-${shortcuts.length + 1}`,
            title,
            url: target,
            groupId: group.id,
            folderId: null,
          });
          grid.push(`s-${shortcuts.length}`);
        }
      } else {
        // 顶层散装站点 → 未分组
        const target = item.target;
        if (!isHttpUrl(target)) {
          stats.skippedInternal += 1;
          continue;
        }
        const title = String(item.name ?? '').trim() || hostOf(target);
        shortcuts.push({
          id: `s-${shortcuts.length + 1}`,
          title,
          url: target,
          groupId: null,
          folderId: null,
        });
        grid.push(`s-${shortcuts.length}`);
      }
    }
  }

  // 便签：全部拼成一段
  const note = (raw.data?.note?.list ?? [])
    .map((item) =>
      item.title
        ? `【${item.title}】\n${htmlToText(String(item.content ?? ''))}`
        : htmlToText(String(item.content ?? '')),
    )
    .join('\n\n')
    .slice(0, 20000);
  stats.notes = raw.data?.note?.list?.length ?? 0;

  const engineName = String(raw.data?.searcher?.searchEngine?.current?.name ?? '');
  const searchEngine = ENGINE_MAP[engineName] ?? undefined;

  return {
    version: 1,
    settings: searchEngine ? { searchEngine } : {},
    groups,
    shortcuts,
    folders: [],
    grid,
    todos: [],
    note,
    searchHistory: [],
    countdowns: [],
  };
}

const raw = JSON.parse(readFileSync(resolve(input), 'utf8'));
const state = convert(raw);
writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`);

stats.groups = state.groups.length;
stats.shortcuts = state.shortcuts.length;
console.log(`转换完成 → ${output}`);
console.log(
  `分组 ${stats.groups}，快捷方式 ${stats.shortcuts}，便签 ${stats.notes} 条；` +
    `跳过 Infinity 内部页 ${stats.skippedInternal} 个。`,
);
if (stats.groups > 30) console.warn('⚠️ 分组超过 XTab 上限 30，导入时多出的会被丢弃');
if (stats.shortcuts > 300) console.warn('⚠️ 快捷方式超过 XTab 上限 300，导入时多出的会被丢弃');
