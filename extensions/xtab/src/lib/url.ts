const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const EXPLICIT_SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
const HTTP_SCHEME_RE = /^https?:\/\//i;
/** host:port 形式（localhost:5173、192.168.1.10:8080），不能被当成协议名 */
const HOST_PORT_RE = /^[a-z0-9.-]+:\d{1,5}(?:[/?#]|$)/i;
/** 形如 example.com、sub.example.com/path 的输入按网址处理 */
const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/i;
const LOCALHOST_RE = /^localhost(?::\d{1,5})?(?:[/?#].*)?$/i;

/**
 * 只接受 http/https：拒绝 javascript:、data:、file: 等可执行或本地协议，
 * 避免搜索框变成任意协议的执行入口。
 */
export function normalizeUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input || /\s/.test(input)) return null;

  const scheme = EXPLICIT_SCHEME_RE.exec(input)?.[1]?.toLowerCase();
  const hasHttpScheme = HTTP_SCHEME_RE.test(input);
  const isHostPort = HOST_PORT_RE.test(input);

  if (!hasHttpScheme) {
    if (scheme && !isHostPort) return null;
    if (!scheme && !isHostPort && !DOMAIN_RE.test(input)) return null;
  }

  const isLocal = LOCALHOST_RE.test(input) || /^https?:\/\/localhost/i.test(input);
  const withScheme = hasHttpScheme ? input : `${isLocal ? 'http' : 'https'}://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  // 排除 https://foo 这类无点主机名（多为误输入），localhost 例外便于本地开发
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;

  return parsed.toString();
}

export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (HTTP_SCHEME_RE.test(trimmed)) return true;
  if (EXPLICIT_SCHEME_RE.test(trimmed) && !HOST_PORT_RE.test(trimmed)) return false;
  if (LOCALHOST_RE.test(trimmed)) return true;
  if (HOST_PORT_RE.test(trimmed)) return true;
  return DOMAIN_RE.test(trimmed);
}

export function buildSearchUrl(engine: { searchUrl: string }, query: string): string {
  return engine.searchUrl.replace('%s', encodeURIComponent(query.trim()));
}

/**
 * 搜索框输入的最终去向：像网址就直接打开，否则交给当前搜索引擎。
 * 空输入返回 null，调用方不发请求。
 */
export function resolveSearchInput(input: string, engine: { searchUrl: string }): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (looksLikeUrl(trimmed)) {
    return normalizeUrl(trimmed) ?? buildSearchUrl(engine, trimmed);
  }
  return buildSearchUrl(engine, trimmed);
}

/** 取主机名用于字母头像回退；解析失败返回空串 */
export function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** chrome://favicon 由扩展本地缓存提供，不产生任何网络请求 */
export function faviconUrl(pageUrl: string, size = 32): string | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
  const query = `pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
  return chrome.runtime.getURL(`/_favicon/?${query}`);
}
