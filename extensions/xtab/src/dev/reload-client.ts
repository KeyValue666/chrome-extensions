/**
 * 开发期自动刷新：轮询本机 dev hub 的版本号，变了就 reload 页面。
 *
 * 只被 `import.meta.env.DEV` 分支引用，生产构建中整段被摇掉，
 * 因此运行时不产生任何网络请求，也不需要 host_permissions。
 */
const DEFAULT_PORT = 3579;
const ACTIVE_INTERVAL = 600;
const IDLE_INTERVAL = 5000;
const FAILURES_BEFORE_IDLE = 5;

interface HubPayload {
  version?: unknown;
}

export interface ReloadWatcherOptions {
  port?: number;
  intervalMs?: number;
}

export function startReloadWatcher(options: ReloadWatcherOptions = {}): () => void {
  const port = options.port ?? DEFAULT_PORT;
  const endpoint = `http://127.0.0.1:${port}/version`;

  let baseline: number | null = null;
  let misses = 0;
  let stopped = false;
  let timer: number | undefined;

  const stop = (): void => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };

  const schedule = (delay: number): void => {
    if (stopped) return;
    timer = window.setTimeout(() => void poll(), delay);
  };

  const poll = async (): Promise<void> => {
    try {
      const response = await fetch(`${endpoint}?t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = (await response.json()) as HubPayload;
      const version = typeof payload.version === 'number' ? payload.version : null;
      misses = 0;

      if (version !== null) {
        if (baseline === null) {
          baseline = version;
        } else if (version !== baseline) {
          stop();
          window.location.reload();
          return;
        }
      }
      schedule(ACTIVE_INTERVAL);
    } catch {
      misses += 1;
      if (misses === FAILURES_BEFORE_IDLE) {
        console.info('[xtab] 未连上 dev hub，自动刷新暂停（运行 pnpm --filter xtab dev 即可恢复）');
      }
      schedule(IDLE_INTERVAL);
    }
  };

  void poll();
  return stop;
}
