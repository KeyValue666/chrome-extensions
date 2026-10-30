import { findAccent, findPreset, LIMITS } from '../shared/constants';
import { getWallpaper, putWallpaper, deleteWallpaper } from '../shared/wallpaper-store';
import type { AppState, Settings, ThemeMode } from '../shared/types';

let customUrl: string | null = null;

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'auto') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function releaseCustomUrl(): void {
  if (customUrl) {
    URL.revokeObjectURL(customUrl);
    customUrl = null;
  }
}

async function applyWallpaper(settings: Settings): Promise<void> {
  const layer = document.getElementById('bg');
  if (!layer) return;

  if (settings.wallpaperKind === 'custom') {
    try {
      const blob = await getWallpaper();
      if (blob) {
        releaseCustomUrl();
        customUrl = URL.createObjectURL(blob);
        layer.style.backgroundImage = `url("${customUrl}")`;
        return;
      }
      // 数据被清理过时回退内置壁纸，避免出现纯黑背景
    } catch (error) {
      console.warn('[xtab] 读取自定义壁纸失败', error);
    }
  }

  releaseCustomUrl();
  layer.style.backgroundImage = findPreset(settings.presetId).css;
}

export async function applyAppearance(state: AppState): Promise<void> {
  const { settings } = state;
  const theme = resolveTheme(settings.theme);

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--dim-alpha', (settings.dim / 100).toFixed(2));
  // 强调色跟随主题取值，派生的浅色底由 CSS color-mix 从 --accent 计算
  const accent = findAccent(settings.accentId);
  document.documentElement.style.setProperty(
    '--accent',
    theme === 'light' ? accent.light : accent.dark,
  );
  document.body.classList.toggle('is-blurred', settings.blur);
  document.body.classList.toggle('is-minimal', settings.minimal);
  document.body.classList.toggle('is-dock-autohide', settings.sidebarCollapsed);

  await applyWallpaper(settings);
}

/**
 * 上传图片统一压缩到 2560px 宽、JPEG 0.86：
 * 4K 原图动辄 8MB，压缩后通常 <1MB，既省配额也不会让首屏变卡。
 */
export async function importWallpaper(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > LIMITS.wallpaperBytes) throw new Error('图片超过 20MB，请先压缩');

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, LIMITS.wallpaperMaxWidth / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器不支持 Canvas 2D');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.86),
    );
    if (!blob) throw new Error('图片处理失败，请换一张试试');
    await putWallpaper(blob);
  } finally {
    bitmap.close();
  }
}

export async function clearCustomWallpaper(): Promise<void> {
  await deleteWallpaper();
  releaseCustomUrl();
}
