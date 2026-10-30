const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

export interface ClockOptions {
  hour24: boolean;
  seconds: boolean;
}

/** 24 小时制固定两位小时；12 小时制带 AM/PM */
export function formatClock(date: Date, options: ClockOptions): string {
  const { hour24, seconds } = options;
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());

  if (hour24) {
    const hour = pad2(date.getHours());
    return seconds ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
  }

  const rawHour = date.getHours();
  const hour = rawHour % 12 === 0 ? 12 : rawHour % 12;
  const suffix = rawHour < 12 ? 'AM' : 'PM';
  const body = seconds ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
  return `${body} ${suffix}`;
}

/** 解析 YYYY-MM-DD 为本地时区的当天 0 点；非法格式返回 null */
export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // 2 月 30 日这类输入会被 Date 进位到 3 月，回读校验挡掉
  if (date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}

/** 本地时区当天 0 点 */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** 距目标日期还有几天（当天为 0，已过为负数）；目标按本地时区 0 点计 */
export function daysUntil(dateKey: string, now: Date = new Date()): number | null {
  const target = parseDateKey(dateKey);
  if (!target) return null;
  const diff = target.getTime() - startOfToday(now).getTime();
  return Math.round(diff / 86_400_000);
}

/** 年度纪念日的下一次发生日（闰日 2/29 在平年按 2/28 兜底） */
export function nextOccurrence(dateKey: string, now: Date = new Date()): Date | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const today = startOfToday(now);
  const day = parsed.getMonth() === 1 && parsed.getDate() === 29 ? 28 : parsed.getDate();
  for (let year = today.getFullYear(); year <= today.getFullYear() + 1; year += 1) {
    const candidate = new Date(year, parsed.getMonth(), day);
    if (candidate >= today) return candidate;
  }
  return null;
}

/** 日期转 YYYY-MM-DD（本地时区），供 date input 默认值使用 */
export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** 形如「10月29日 星期四」 */
export function formatDate(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

/** 依据当前时间给出问候语，让首屏不至于是纯数字 */
export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}
