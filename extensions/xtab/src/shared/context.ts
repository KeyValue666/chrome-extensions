import type { AppState } from './types';

export type SettingsSection = 'appearance' | 'wallpaper' | 'data' | 'about';

/**
 * 组件之间共享的最小应用接口。
 * 只暴露「读状态 / 改状态 / 重绘外观 / 打开设置 / 全量重绘」，避免组件互相直接引用。
 */
export interface AppContext {
  getState(): AppState;
  /** 同步修改内存状态并触发防抖持久化；不负责重绘，由调用方按需刷新自身 */
  update(mutator: (state: AppState) => void): void;
  /** 应用主题与壁纸（改动外观设置后调用） */
  applyAppearance(): Promise<void>;
  /** 全量重绘所有组件（导入备份、恢复默认后使用） */
  refreshAll(): void;
  openSettings(section?: SettingsSection): void;
  /** 右下角短暂提示 */
  notify(message: string): void;
}
