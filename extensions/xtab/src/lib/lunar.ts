/**
 * 农历与节日（纯本地计算，零网络请求）。
 * 农历部分基于 Intl 内建的 chinese 历（Chrome 110+ 与 Node 20+ 均支持，
 * 包含闰月与大小月，无需自己维护 1900-2100 查表数据）；
 * 只把「几号」的数字映射成 初一/十五/廿三 这类中文序数。
 */

const DAY_NAMES = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
] as const;

const monthFormat = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long' });
const dayFormat = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' });

/** 形如「正月初一」「闰六月初五」；环境不支持时返回空串（调用方自行省略该段） */
export function lunarDateText(date: Date): string {
  try {
    const month = monthFormat.format(date);
    const day = Number.parseInt(dayFormat.format(date), 10);
    const name = DAY_NAMES[day - 1];
    return month && name ? `${month}${name}` : '';
  } catch {
    return '';
  }
}

interface LunarFestival {
  month: string;
  day: number;
  name: string;
}

/** 农历节日：月份名直接用 ICU 输出（自然覆盖闰月同名月取第一个），day 为农历日 */
const LUNAR_FESTIVALS: LunarFestival[] = [
  { month: '正月', day: 1, name: '春节' },
  { month: '正月', day: 15, name: '元宵节' },
  { month: '五月', day: 5, name: '端午节' },
  { month: '七月', day: 7, name: '七夕' },
  { month: '八月', day: 15, name: '中秋节' },
  { month: '九月', day: 9, name: '重阳节' },
  { month: '腊月', day: 8, name: '腊八节' },
];

/** 公历节日：month/day 都是 1 起 */
const SOLAR_FESTIVALS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: '元旦' },
  { month: 2, day: 14, name: '情人节' },
  { month: 3, day: 8, name: '妇女节' },
  { month: 4, day: 5, name: '清明节' },
  { month: 5, day: 1, name: '劳动节' },
  { month: 5, day: 4, name: '青年节' },
  { month: 6, day: 1, name: '儿童节' },
  { month: 8, day: 1, name: '建军节' },
  { month: 9, day: 10, name: '教师节' },
  { month: 10, day: 1, name: '国庆节' },
  { month: 12, day: 24, name: '平安夜' },
  { month: 12, day: 25, name: '圣诞节' },
];

interface LunarParts {
  month: string;
  day: number;
}

function lunarParts(date: Date): LunarParts {
  try {
    const month = monthFormat.format(date);
    const day = Number.parseInt(dayFormat.format(date), 10);
    if (!month || !Number.isFinite(day)) return { month: '', day: 0 };
    return { month, day };
  } catch {
    return { month: '', day: 0 };
  }
}

/** 当天的节日名（含除夕）；没有节日返回 null */
export function festivalOf(date: Date): string | null {
  const solar = SOLAR_FESTIVALS.find(
    (item) => item.month === date.getMonth() + 1 && item.day === date.getDate(),
  );
  if (solar) return solar.name;

  const lunar = lunarParts(date);
  if (lunar.month) {
    const match = LUNAR_FESTIVALS.find(
      (item) => lunar.month.includes(item.month) && lunar.day === item.day,
    );
    if (match) return match.name;
    // 除夕：明天是正月初一，今天就是一年最后一天
    const tomorrow = lunarParts(new Date(date.getTime() + 86_400_000));
    if (tomorrow.month === '正月' && tomorrow.day === 1) return '除夕';
  }
  return null;
}
