import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export interface DevHub {
  readonly port: number;
  /** 每次构建完成后递增版本号，页面据此判断是否需要刷新 */
  readonly bump: () => void;
  readonly close: () => void;
}

/**
 * 跨源请求必须放开 CORS：页面来自 chrome-extension:// 或 http://localhost，
 * 没有 Access-Control-Allow-Origin 时浏览器会直接拦掉。
 * 这里只用 GET + 无凭证，读到的也只是一个整数版本号，不涉及任何用户数据。
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Private-Network': 'true',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

/**
 * 开发期热重载中枢：本机回环端口上的一个极简 HTTP 服务。
 *
 * 只在 `vite build --watch` 时启动；页面每 600ms 取一次版本号，
 * 构建结束（closeBundle）时版本号 +1，页面看到变化就 location.reload()。
 * 打开新标签页时第一次取到的版本号作为基线，所以不会自己无限刷新。
 */
export function startDevHub(port: number): DevHub {
  let version = 0;

  const respond = (res: ServerResponse, status: number, payload: unknown): void => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  };

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const pathname = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && pathname === '/version') {
      respond(res, 200, { version });
      return;
    }
    if (req.method === 'GET' && pathname === '/') {
      respond(res, 200, { ok: true, version, endpoints: ['/version'] });
      return;
    }
    respond(res, 404, { error: 'not found' });
  };

  const server: Server = createServer(handler);
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[xtab] 端口 ${port} 已被占用（可能已经有一个 dev 在跑），本次不启用自动刷新`);
      return;
    }
    console.warn(`[xtab] 热重载服务异常：${error.message}`);
  });
  server.listen(port, '127.0.0.1', () => {
    console.info(
      `[xtab] 热重载就绪 → http://127.0.0.1:${port}/version（每次构建完成，页面会自动刷新）`,
    );
  });

  return {
    port,
    bump: () => {
      version += 1;
    },
    close: () => {
      server.close();
    },
  };
}
