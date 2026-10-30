import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { startDevHub, type DevHub } from './tools/dev-hub.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/** 热重载端口，可用 XTAB_DEV_HUB_PORT 覆盖（需与 src/dev/reload-client.ts 保持一致） */
const devHubPort = Number(process.env.XTAB_DEV_HUB_PORT ?? 3579);

/**
 * manifest.json 保留在扩展根目录（便于直接审查权限与入口），
 * 构建结束时复制到 dist，保证「加载未打包扩展」选的 dist 目录自带合法 Manifest。
 */
const copyManifestPlugin = (): Plugin => ({
  name: 'xtab:copy-manifest',
  apply: 'build',
  closeBundle() {
    const distDir = `${rootDir}dist`;
    mkdirSync(distDir, { recursive: true });
    copyFileSync(`${rootDir}manifest.json`, `${distDir}/manifest.json`);
    console.info('[xtab] manifest.json -> dist/manifest.json');
  },
});

/**
 * 开发期热重载：watch 构建时起一个本机版本号服务，每次构建完成把版本号 +1，
 * 页面轮询到变化就整页刷新——省掉「点扩展卡片重新加载 + 手动刷新」两步。
 *
 * 必须排在 copyManifestPlugin 之后，保证 bump 发生在 manifest 落地之后。
 */
const liveReloadPlugin = (): Plugin => {
  let hub: DevHub | null = null;
  return {
    name: 'xtab:live-reload',
    apply: 'build',
    buildStart() {
      // 只在 watch 模式起服务：一次性构建不该挂住进程
      if (!this.meta.watchMode) return;
      hub ??= startDevHub(devHubPort);
    },
    closeBundle() {
      if (!this.meta.watchMode) return;
      hub?.bump();
    },
    closeWatcher() {
      hub?.close();
      hub = null;
    },
  };
};

export default defineConfig(({ mode }) => {
  const isDev = mode !== 'production';

  return {
    root: rootDir,
    // 相对路径，避免 chrome-extension:// 下绝对路径解析问题
    base: './',
    publicDir: 'public',
    build: {
      outDir: 'dist',
      // 开发构建保留旧文件：dist 正被 Chrome 加载，清空会瞬间丢失 manifest 导致扩展被停用
      emptyOutDir: !isDev,
      target: 'chrome110',
      rollupOptions: {
        input: { index: `${rootDir}index.html`, popup: `${rootDir}popup.html` },
      },
    },
    plugins: [copyManifestPlugin(), ...(isDev ? [liveReloadPlugin()] : [])],
  };
});
