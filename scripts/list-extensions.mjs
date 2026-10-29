#!/usr/bin/env node
/**
 * 列出工作区内所有扩展（extensions/<name>/package.json）。
 * 用途：不依赖任何第三方包，快速确认当前仓库有哪些扩展、各自版本与可用脚本。
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.cwd();
const extensionsDir = path.join(workspaceRoot, 'extensions');

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const main = async () => {
  if (!existsSync(extensionsDir)) {
    console.log('暂无扩展：extensions/ 目录不存在。');
    return;
  }

  const entries = await readdir(extensionsDir, { withFileTypes: true });
  const extensionDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const extensions = [];
  for (const dirName of extensionDirs.sort()) {
    const packageJsonPath = path.join(extensionsDir, dirName, 'package.json');
    if (!existsSync(packageJsonPath)) {
      extensions.push({ dir: dirName, name: '(缺少 package.json)', version: '-', scripts: [] });
      continue;
    }
    const pkg = await readJson(packageJsonPath);
    extensions.push({
      dir: dirName,
      name: pkg.name ?? '(未命名)',
      version: pkg.version ?? '-',
      scripts: Object.keys(pkg.scripts ?? {}),
    });
  }

  if (extensions.length === 0) {
    console.log('暂无扩展：extensions/ 目录为空。');
    return;
  }

  console.log(`共 ${extensions.length} 个扩展：\n`);
  for (const ext of extensions) {
    console.log(`- ${ext.dir}  (${ext.name}@${ext.version})`);
    console.log(`  目录: extensions/${ext.dir}`);
    console.log(`  脚本: ${ext.scripts.length > 0 ? ext.scripts.join(', ') : '无'}`);
  }
};

main().catch((error) => {
  console.error('读取扩展清单失败:', error);
  process.exitCode = 1;
});
