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
