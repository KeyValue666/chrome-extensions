/** 分组图标底色：按 id 稳定取一个色相，同一分组刷新多少次都是同一个颜色 */
export function tintOf(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return `linear-gradient(150deg, hsl(${hash} 74% 64%), hsl(${(hash + 32) % 360} 70% 48%))`;
}
